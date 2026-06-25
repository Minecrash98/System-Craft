import { NextResponse } from "next/server";
import { z } from "zod";

import { designReviewDialogueSchema } from "@/lib/design-review/schema";
import {
  getBundledDesignReviewAudio,
  type BundledDemoAudio
} from "@/lib/demo-audio/demoAudio";
import {
  designReviewRoles,
  type DesignReviewDialogue,
  type DesignReviewRole
} from "@/lib/design-review/types";
import { createDialogue } from "@/lib/elevenlabs/client";
import { isElevenLabsError } from "@/lib/elevenlabs/errors";
import type { ElevenLabsAudioMetadata } from "@/lib/elevenlabs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxDesignReviewAudioTotalCharacters = 2000;

type DesignReviewAudioErrorCode =
  | "invalid_request"
  | "missing_config"
  | "timeout"
  | "unauthorized"
  | "rate_limited"
  | "provider_failure"
  | "malformed_audio";

type RoleVoiceMap = Record<DesignReviewRole, string>;

interface DesignReviewAudioRequest {
  dialogue: DesignReviewDialogue;
  responseFormat: "audio" | "json";
  requestId?: string;
  traceId?: string;
  totalTextCharacters: number;
}

interface RenderedDesignReviewAudio {
  bytes: Uint8Array;
  contentType: string;
  metadata: SafeDesignReviewAudioMetadata;
}

interface SafeDesignReviewAudioMetadata {
  provider: ElevenLabsAudioMetadata["provider"] | "bundled";
  endpoint: ElevenLabsAudioMetadata["endpoint"] | "bundledDesignReviewDialogue";
  model_id: string;
  output_format: string;
  content_type: string;
  byte_length: number;
  character_count: number;
  character_cost?: number;
  provider_request_id?: string;
  status: number;
  elapsed_ms: number;
  voice_count?: number;
  turn_count?: number;
  role_count: number;
  roles: DesignReviewRole[];
  source: "generated" | "bundled";
  cache_status?: "hit";
  cache_key?: string;
  asset_path?: string;
}

const roleVoiceEnvNames: Record<DesignReviewRole, string> = {
  builder: "ELEVENLABS_BUILDER_VOICE_ID",
  reviewer: "ELEVENLABS_REVIEWER_VOICE_ID",
  mentor: "ELEVENLABS_MENTOR_VOICE_ID"
};

const designReviewAudioRequestSchema = z
  .object({
    dialogue: designReviewDialogueSchema,
    request_id: z.string().trim().min(1).max(120).optional(),
    trace_id: z.string().trim().min(1).max(120).optional(),
    response_format: z.enum(["audio", "json"]).optional()
  })
  .strict();

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = parseDesignReviewAudioRequest(body);

  if (!parsed.success) {
    return errorResponse({
      code: "invalid_request",
      message: "Request body must include a valid bounded design review dialogue.",
      status: 400,
      details: parsed.details
    });
  }

  const roles = parsed.request.dialogue.turns.map((turn) => turn.role);
  const bundledAudio = await getBundledDesignReviewAudio(parsed.request.dialogue);

  if (bundledAudio) {
    return designReviewAudioResponse({
      audio: {
        bytes: bundledAudio.bytes,
        contentType: bundledAudio.contentType,
        metadata: toBundledMetadata(bundledAudio, roles)
      },
      request: parsed.request
    });
  }

  const roleVoices = resolveRoleVoices(roles);

  if (!roleVoices.success) {
    return errorResponse({
      code: "missing_config",
      message:
        "Design review audio is unavailable because one or more role voices are not configured.",
      status: 503,
      details: roleVoices.details
    });
  }

  try {
    const result = await createDialogue({
      inputs: parsed.request.dialogue.turns.map((turn) => ({
        text: turn.text,
        voiceId: roleVoices.voices[turn.role],
        role: turn.role
      })),
      textNormalization: "auto",
      metadata: {
        requestId: parsed.request.requestId,
        traceId: parsed.request.traceId ?? parsed.request.dialogue.id
      }
    });

    return designReviewAudioResponse({
      audio: {
        bytes: result.bytes,
        contentType: result.contentType,
        metadata: toSafeMetadata(result.metadata, roles)
      },
      request: parsed.request
    });
  } catch (error) {
    return providerErrorResponse(error);
  }
}

function designReviewAudioResponse({
  audio,
  request
}: {
  audio: RenderedDesignReviewAudio;
  request: DesignReviewAudioRequest;
}) {
  if (request.responseFormat === "json") {
    return NextResponse.json({
      audio_base64: Buffer.from(audio.bytes).toString("base64"),
      alignment: null,
      metadata: audio.metadata,
      request: {
        dialogue_id: request.dialogue.id,
        graph_id: request.dialogue.graph_id,
        turn_count: request.dialogue.turns.length,
        total_text_characters: request.totalTextCharacters,
        role_order: request.dialogue.turns.map((turn) => ({
          turn_id: turn.id,
          role: turn.role,
          speaker: turn.speaker,
          character_count: countCharacters(turn.text)
        }))
      }
    });
  }

  return new Response(toArrayBuffer(audio.bytes), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="${buildAudioFileName(
        request.dialogue.id,
        audio.metadata.output_format
      )}"`,
      "Content-Type": audio.contentType,
      "X-SystemCraft-Audio-Metadata": encodeURIComponent(
        JSON.stringify(audio.metadata)
      ),
      "X-SystemCraft-Design-Review-Id": request.dialogue.id
    }
  });
}
async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseDesignReviewAudioRequest(
  body: unknown
):
  | { success: true; request: DesignReviewAudioRequest }
  | { success: false; details: string[] } {
  const parsed = designReviewAudioRequestSchema.safeParse(body);

  if (!parsed.success) {
    return {
      success: false,
      details: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "request"}: ${issue.message}`
      )
    };
  }

  const totalTextCharacters = parsed.data.dialogue.turns.reduce(
    (total, turn) => total + countCharacters(turn.text),
    0
  );

  if (totalTextCharacters > maxDesignReviewAudioTotalCharacters) {
    return {
      success: false,
      details: [
        `dialogue.turns: Design review audio text must be ${maxDesignReviewAudioTotalCharacters} characters or fewer.`
      ]
    };
  }

  return {
    success: true,
    request: {
      dialogue: parsed.data.dialogue,
      responseFormat: parsed.data.response_format ?? "audio",
      requestId: parsed.data.request_id,
      traceId: parsed.data.trace_id,
      totalTextCharacters
    }
  };
}

function resolveRoleVoices(roles: DesignReviewRole[]):
  | { success: true; voices: RoleVoiceMap }
  | { success: false; details: string[] } {
  const uniqueRoles = new Set(roles);
  const missing: string[] = [];
  const voices = {} as RoleVoiceMap;

  for (const role of designReviewRoles) {
    if (!uniqueRoles.has(role)) {
      continue;
    }

    const envName = roleVoiceEnvNames[role];
    const voiceId = normalizeOptionalEnv(process.env[envName]);

    if (!voiceId) {
      missing.push(`${envName} is required for ${role} audio.`);
      continue;
    }

    voices[role] = voiceId;
  }

  return missing.length > 0
    ? { success: false, details: missing }
    : { success: true, voices };
}

function providerErrorResponse(error: unknown) {
  if (!isElevenLabsError(error)) {
    return errorResponse({
      code: "provider_failure",
      message: "Design review audio generation failed before audio was returned.",
      status: 502
    });
  }

  if (error.code === "configuration_error") {
    return errorResponse({
      code: "missing_config",
      message:
        "Design review audio is unavailable because ElevenLabs server configuration is missing or invalid.",
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
      message: "Design review audio provider timed out.",
      status: 504
    });
  }

  if (error.code === "unauthorized") {
    return errorResponse({
      code: "unauthorized",
      message: "Design review audio provider rejected the configured credentials.",
      status: 401,
      providerRequestId: error.providerRequestId,
      retryAfterMs: error.retryAfterMs
    });
  }

  if (error.code === "rate_limited") {
    return errorResponse({
      code: "rate_limited",
      message: "Design review audio provider rate limit was reached.",
      status: 429,
      providerRequestId: error.providerRequestId,
      retryAfterMs: error.retryAfterMs
    });
  }

  if (error.code === "malformed_response") {
    return errorResponse({
      code: "malformed_audio",
      message: "Design review audio provider returned malformed audio.",
      status: 502,
      providerRequestId: error.providerRequestId
    });
  }

  return errorResponse({
    code: "provider_failure",
    message: "Design review audio provider failed.",
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
  code: DesignReviewAudioErrorCode;
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
  metadata: ElevenLabsAudioMetadata,
  roles: DesignReviewRole[]
): SafeDesignReviewAudioMetadata {
  const uniqueRoles = designReviewRoles.filter((role) => roles.includes(role));

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
    voice_count: metadata.voiceCount,
    turn_count: metadata.turnCount,
    role_count: uniqueRoles.length,
    roles: uniqueRoles,
    source: "generated"
  };
}

function toBundledMetadata(
  item: BundledDemoAudio,
  roles: DesignReviewRole[]
): SafeDesignReviewAudioMetadata {
  const uniqueRoles = designReviewRoles.filter((role) => roles.includes(role));

  return {
    provider: "bundled",
    endpoint: "bundledDesignReviewDialogue",
    model_id: item.entry.model_id,
    output_format: item.entry.output_format,
    content_type: item.entry.content_type,
    byte_length: item.entry.byte_length,
    character_count: item.entry.character_count,
    status: 200,
    elapsed_ms: 0,
    voice_count: uniqueRoles.length,
    turn_count: roles.length,
    role_count: uniqueRoles.length,
    roles: uniqueRoles,
    source: "bundled",
    cache_status: "hit",
    cache_key: item.entry.key,
    asset_path: item.entry.asset_path
  };
}

function normalizeOptionalEnv(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function buildAudioFileName(dialogueId: string, outputFormat: string) {
  const safeDialogueId = dialogueId.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
  const extension = outputFormat.startsWith("mp3")
    ? "mp3"
    : outputFormat.startsWith("wav")
      ? "wav"
      : outputFormat.startsWith("pcm")
        ? "pcm"
        : outputFormat.startsWith("ulaw")
          ? "ulaw"
          : "audio";

  return `design-review-${safeDialogueId || "dialogue"}.${extension}`;
}

function countCharacters(value: string) {
  return Array.from(value).length;
}
