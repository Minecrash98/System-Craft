import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { DesignReviewDialogue } from "@/lib/design-review/types";
import type { NarrationSegment } from "@/lib/narration/types";

export const bundledDemoAudioVoiceId = "microsoft-zira-desktop";
export const bundledDemoAudioDialogueVoiceId = "microsoft-mixed-desktop";
export const bundledDemoAudioModelId = "windows-system-speech";
export const bundledDemoAudioOutputFormat = "wav_pcm_16000_mono";

export type DemoAudioPurpose =
  | "narration_segment"
  | "design_review_dialogue";

export interface DemoAudioKeyConfig {
  voiceId: string;
  modelId: string;
  outputFormat: string;
}

export interface DemoAudioManifestEntry {
  key: string;
  purpose: DemoAudioPurpose;
  graph_id: string;
  content_hash: string;
  asset_path: string;
  content_type: string;
  byte_length: number;
  audio_sha256: string;
  voice_id: string;
  model_id: string;
  output_format: string;
  source: "bundled";
  generated_at: string;
  provenance: string;
  segment_id?: string;
  dialogue_id?: string;
  character_count: number;
}

export interface DemoAudioManifest {
  version: "1.0.0";
  generated_at: string;
  entries: DemoAudioManifestEntry[];
}

export interface BundledDemoAudio {
  entry: DemoAudioManifestEntry;
  bytes: Uint8Array;
  contentType: string;
}

const manifestEntrySchema = z.object({
  key: z.string().min(1),
  purpose: z.enum(["narration_segment", "design_review_dialogue"]),
  graph_id: z.string().min(1),
  content_hash: z.string().length(64),
  asset_path: z.string().startsWith("/demo-audio/"),
  content_type: z.string().min(1),
  byte_length: z.number().int().positive(),
  audio_sha256: z.string().length(64),
  voice_id: z.string().min(1),
  model_id: z.string().min(1),
  output_format: z.string().min(1),
  source: z.literal("bundled"),
  generated_at: z.string().min(1),
  provenance: z.string().min(1),
  segment_id: z.string().min(1).optional(),
  dialogue_id: z.string().min(1).optional(),
  character_count: z.number().int().positive()
});

export const demoAudioManifestSchema = z.object({
  version: z.literal("1.0.0"),
  generated_at: z.string().min(1),
  entries: z.array(manifestEntrySchema)
});

export function createDemoAudioKey({
  content,
  graphId,
  purpose,
  voiceId,
  modelId,
  outputFormat
}: {
  content: string[];
  graphId: string;
  purpose: DemoAudioPurpose;
} & DemoAudioKeyConfig) {
  const contentHash = createDemoAudioContentHash(content);
  const identity = {
    purpose,
    graph_id: graphId,
    content_hash: contentHash,
    voice_id: voiceId,
    model_id: modelId,
    output_format: outputFormat
  };

  return {
    contentHash,
    key: `demo-audio:${sha256(JSON.stringify(identity)).slice(0, 32)}`
  };
}

export function createNarrationSegmentDemoAudioKey(
  segment: NarrationSegment,
  graphId: string,
  config: DemoAudioKeyConfig = {
    voiceId: bundledDemoAudioVoiceId,
    modelId: bundledDemoAudioModelId,
    outputFormat: bundledDemoAudioOutputFormat
  }
) {
  return createDemoAudioKey({
    purpose: "narration_segment",
    graphId,
    content: [segment.id, segment.title, segment.text],
    ...config
  });
}

export function createDesignReviewDemoAudioKey(
  dialogue: DesignReviewDialogue,
  config: DemoAudioKeyConfig = {
    voiceId: bundledDemoAudioDialogueVoiceId,
    modelId: bundledDemoAudioModelId,
    outputFormat: bundledDemoAudioOutputFormat
  }
) {
  return createDemoAudioKey({
    purpose: "design_review_dialogue",
    graphId: dialogue.graph_id,
    content: [
      dialogue.id,
      dialogue.title,
      ...dialogue.turns.map(
        (turn) => `${turn.id}:${turn.role}:${turn.speaker}:${turn.text}`
      )
    ],
    ...config
  });
}

export async function loadDemoAudioManifest(
  publicDir = path.join(process.cwd(), "public")
): Promise<DemoAudioManifest | null> {
  try {
    const manifestPath = path.join(publicDir, "demo-audio", "manifest.json");
    const rawManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const parsed = demoAudioManifestSchema.safeParse(rawManifest);

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getBundledNarrationAudio(
  segments: NarrationSegment[],
  graphId?: string,
  publicDir?: string,
  config: DemoAudioKeyConfig = {
    voiceId: bundledDemoAudioVoiceId,
    modelId: bundledDemoAudioModelId,
    outputFormat: bundledDemoAudioOutputFormat
  }
): Promise<BundledDemoAudio[] | null> {
  const manifest = await loadDemoAudioManifest(publicDir);

  if (!manifest) {
    return null;
  }

  const audio: BundledDemoAudio[] = [];

  for (const segment of segments) {
    const keyInfo = graphId
      ? createNarrationSegmentDemoAudioKey(segment, graphId, config)
      : null;
    const contentHash =
      keyInfo?.contentHash ??
      createDemoAudioContentHash([segment.id, segment.title, segment.text]);
    const entry = manifest.entries.find(
      (candidate) =>
        candidate.purpose === "narration_segment" &&
        candidate.segment_id === segment.id &&
        candidate.content_hash === contentHash &&
        candidate.voice_id === config.voiceId &&
        candidate.model_id === config.modelId &&
        candidate.output_format === config.outputFormat &&
        (!keyInfo || candidate.key === keyInfo.key)
    );
    const bundled = entry
      ? await readBundledDemoAudio(entry, publicDir)
      : null;

    if (!bundled) {
      return null;
    }

    audio.push(bundled);
  }

  return audio;
}

export async function getBundledDesignReviewAudio(
  dialogue: DesignReviewDialogue,
  publicDir?: string,
  config: DemoAudioKeyConfig = {
    voiceId: bundledDemoAudioDialogueVoiceId,
    modelId: bundledDemoAudioModelId,
    outputFormat: bundledDemoAudioOutputFormat
  }
): Promise<BundledDemoAudio | null> {
  const manifest = await loadDemoAudioManifest(publicDir);

  if (!manifest) {
    return null;
  }

  const { key } = createDesignReviewDemoAudioKey(dialogue, config);
  const entry = manifest.entries.find(
    (candidate) =>
      candidate.key === key &&
      candidate.purpose === "design_review_dialogue" &&
      candidate.dialogue_id === dialogue.id
  );

  return entry ? readBundledDemoAudio(entry, publicDir) : null;
}

export async function readBundledDemoAudio(
  entry: DemoAudioManifestEntry,
  publicDir = path.join(process.cwd(), "public")
): Promise<BundledDemoAudio | null> {
  try {
    const assetPath = path.join(publicDir, entry.asset_path.replace(/^\//, ""));
    const bytes = new Uint8Array(await readFile(assetPath));

    if (bytes.byteLength !== entry.byte_length) {
      return null;
    }

    if (sha256(bytes) !== entry.audio_sha256) {
      return null;
    }

    return {
      entry,
      bytes,
      contentType: entry.content_type
    };
  } catch {
    return null;
  }
}

export function createDemoAudioContentHash(content: string[]) {
  return sha256(content.map(normalizeText).join("\n---\n"));
}

export function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}
