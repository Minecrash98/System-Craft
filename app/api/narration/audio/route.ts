import { NextResponse } from "next/server";

import {
  getBundledNarrationAudio,
  type BundledDemoAudio
} from "@/lib/demo-audio/demoAudio";
import { createSpeech } from "@/lib/elevenlabs/client";
import { isElevenLabsError } from "@/lib/elevenlabs/errors";
import type { ElevenLabsAudioMetadata } from "@/lib/elevenlabs/types";

import { parseNarrationAudioRequest } from "./schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NarrationAudioErrorCode =
  | "invalid_request"
  | "missing_config"
  | "timeout"
  | "unauthorized"
  | "rate_limited"
  | "provider_failure"
  | "malformed_audio";

interface RenderedSegmentAudio {
  segmentId: string;
  bytes: Uint8Array;
  contentType: string;
  metadata: SafeNarrationAudioMetadata;
}

interface SafeNarrationAudioMetadata {
  provider: ElevenLabsAudioMetadata["provider"] | "bundled";
  endpoint: ElevenLabsAudioMetadata["endpoint"] | "bundledNarrationSegment";
  model_id: string;
  output_format: string;
  content_type: string;
  byte_length: number;
  character_count: number;
  character_cost?: number;
  provider_request_id?: string;
  status: number;
  elapsed_ms: number;
  source: "generated" | "bundled";
  cache_status?: "hit";
  cache_key?: string;
  asset_path?: string;
}

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = parseNarrationAudioRequest(body);

  if (!parsed.success) {
    return errorResponse({
      code: "invalid_request",
      message: "Request body must include valid bounded narration segments.",
      status: 400,
      details: parsed.details
    });
  }

  const bundledAudio = await getBundledNarrationAudio(parsed.request.segments);

  if (bundledAudio) {
    return narrationAudioResponse(
      bundledAudio.map(toBundledRenderedSegmentAudio),
      parsed.request.responseFormat,
      parsed.request.segments.length,
      parsed.request.totalTextCharacters
    );
  }

  const audio: RenderedSegmentAudio[] = [];

  try {
    for (const segment of parsed.request.segments) {
      const result = await createSpeech({
        text: segment.text,
        textNormalization: "auto",
        metadata: {
          requestId: parsed.request.requestId,
          traceId: parsed.request.traceId ?? segment.id
        }
      });

      audio.push({
        segmentId: segment.id,
        bytes: result.bytes,
        contentType: result.contentType,
        metadata: toSafeMetadata(result.metadata)
      });
    }
  } catch (error) {
    return providerErrorResponse(error);
  }

  return narrationAudioResponse(
    audio,
    parsed.request.responseFormat,
    parsed.request.segments.length,
    parsed.request.totalTextCharacters
  );
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function providerErrorResponse(error: unknown) {
  if (!isElevenLabsError(error)) {
    return errorResponse({
      code: "provider_failure",
      message: "Narration audio generation failed before audio was returned.",
      status: 502
    });
  }

  if (error.code === "configuration_error") {
    return errorResponse({
      code: "missing_config",
      message:
        "Narration audio is unavailable because ElevenLabs server configuration is missing or invalid.",
      status: 503
    });
  }

  if (error.code === "invalid_request") {
    return errorResponse({
      code: "invalid_request",
      message: error.message,
      status: 400
    });
  }

  if (error.code === "timeout") {
    return errorResponse({
      code: "timeout",
      message: "Narration audio provider timed out.",
      status: 504
    });
  }

  if (error.code === "unauthorized") {
    return errorResponse({
      code: "unauthorized",
      message: "Narration audio provider rejected the configured credentials.",
      status: 401,
      providerRequestId: error.providerRequestId,
      retryAfterMs: error.retryAfterMs
    });
  }

  if (error.code === "rate_limited") {
    return errorResponse({
      code: "rate_limited",
      message: "Narration audio provider rate limit was reached.",
      status: 429,
      providerRequestId: error.providerRequestId,
      retryAfterMs: error.retryAfterMs
    });
  }

  if (error.code === "malformed_response") {
    return errorResponse({
      code: "malformed_audio",
      message: "Narration audio provider returned malformed audio.",
      status: 502,
      providerRequestId: error.providerRequestId
    });
  }

  return errorResponse({
    code: "provider_failure",
    message: "Narration audio provider failed.",
    status: 502,
    providerRequestId: error.providerRequestId,
    retryAfterMs: error.retryAfterMs
  });
}

function errorResponse({
  code,
  message,
  status,
  details,
  providerRequestId,
  retryAfterMs
}: {
  code: NarrationAudioErrorCode;
  message: string;
  status: number;
  details?: string[];
  providerRequestId?: string;
  retryAfterMs?: number;
}) {
  return NextResponse.json(
    {
      error: message,
      code,
      details,
      provider_request_id: providerRequestId,
      retry_after_ms: retryAfterMs
    },
    { status }
  );
}

function toSafeMetadata(
  metadata: ElevenLabsAudioMetadata
): SafeNarrationAudioMetadata {
  return {
    provider: metadata.provider,
    endpoint: metadata.endpoint,
    model_id: metadata.modelId,
    output_format: metadata.outputFormat,
    content_type: metadata.contentType,
    byte_length: metadata.byteLength,
    character_count: metadata.characterCount,
    character_cost: metadata.characterCost,
    provider_request_id: metadata.providerRequestId,
    status: metadata.status,
    elapsed_ms: metadata.elapsedMs,
    source: "generated"
  };
}

function toBundledRenderedSegmentAudio(item: BundledDemoAudio): RenderedSegmentAudio {
  return {
    segmentId: item.entry.segment_id ?? "segment",
    bytes: item.bytes,
    contentType: item.contentType,
    metadata: {
      provider: "bundled",
      endpoint: "bundledNarrationSegment",
      model_id: item.entry.model_id,
      output_format: item.entry.output_format,
      content_type: item.entry.content_type,
      byte_length: item.entry.byte_length,
      character_count: item.entry.character_count,
      status: 200,
      elapsed_ms: 0,
      source: "bundled",
      cache_status: "hit",
      cache_key: item.entry.key,
      asset_path: item.entry.asset_path
    }
  };
}

function narrationAudioResponse(
  audio: RenderedSegmentAudio[],
  responseFormat: "audio" | "json",
  segmentCount: number,
  totalTextCharacters: number
) {
  if (responseFormat === "json" || audio.length > 1) {
    return NextResponse.json({
      audio: audio.map((item) => ({
        segment_id: item.segmentId,
        audio_base64: Buffer.from(item.bytes).toString("base64"),
        metadata: item.metadata
      })),
      request: {
        segment_count: segmentCount,
        total_text_characters: totalTextCharacters
      }
    });
  }

  const [singleAudio] = audio;
  return new Response(toArrayBuffer(singleAudio.bytes), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="${buildAudioFileName(
        singleAudio.segmentId,
        singleAudio.metadata.output_format
      )}"`,
      "Content-Type": singleAudio.contentType,
      "X-SystemCraft-Audio-Metadata": encodeURIComponent(
        JSON.stringify(singleAudio.metadata)
      ),
      "X-SystemCraft-Narration-Segment-Id": singleAudio.segmentId
    }
  });
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function buildAudioFileName(segmentId: string, outputFormat: string) {
  const safeSegmentId = segmentId.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
  const extension = outputFormat.startsWith("mp3")
    ? "mp3"
    : outputFormat.startsWith("wav")
      ? "wav"
      : outputFormat.startsWith("pcm")
        ? "pcm"
        : outputFormat.startsWith("ulaw")
          ? "ulaw"
          : "audio";

  return `narration-${safeSegmentId || "segment"}.${extension}`;
}
