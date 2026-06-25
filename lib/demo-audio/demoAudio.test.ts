import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { POST as narrationAudioPost } from "../../app/api/narration/audio/route";
import { POST as designReviewAudioPost } from "../../app/api/design-review/audio/route";
import {
  bundledDemoAudioDialogueVoiceId,
  bundledDemoAudioModelId,
  bundledDemoAudioOutputFormat,
  bundledDemoAudioVoiceId,
  createDesignReviewDemoAudioKey,
  createNarrationSegmentDemoAudioKey,
  getBundledDesignReviewAudio,
  getBundledNarrationAudio,
  loadDemoAudioManifest,
  readBundledDemoAudio
} from "./demoAudio";
import type { DesignReviewDialogue } from "../design-review/types";
import type { NarrationScript, NarrationSegment } from "../narration/types";

interface DemoAudioPayload {
  graph_id: string;
  narration: NarrationScript;
  dialogue: DesignReviewDialogue;
}

test("demo audio manifest validates and every bundled asset matches metadata", async () => {
  const manifest = await loadDemoAudioManifest();

  assert.ok(manifest, "manifest should load");
  assert.equal(manifest.entries.length, 8);
  assert.equal(
    manifest.entries.filter((entry) => entry.purpose === "narration_segment").length,
    7
  );
  assert.equal(
    manifest.entries.filter((entry) => entry.purpose === "design_review_dialogue").length,
    1
  );

  for (const entry of manifest.entries) {
    assert.equal(entry.source, "bundled");
    assert.equal(entry.model_id, bundledDemoAudioModelId);
    assert.equal(entry.output_format, bundledDemoAudioOutputFormat);
    assert.match(entry.provenance, /No provider call/);
    assert.ok(await readBundledDemoAudio(entry), entry.asset_path);
  }
});

test("primary narration and design review resolve to stable bundled assets", async () => {
  const payload = await loadPayload();
  const narrationAudio = await getBundledNarrationAudio(
    payload.narration.segments,
    payload.graph_id
  );
  const reviewAudio = await getBundledDesignReviewAudio(payload.dialogue);

  assert.ok(narrationAudio);
  assert.equal(narrationAudio.length, payload.narration.segments.length);
  assert.ok(reviewAudio);

  for (const [index, item] of narrationAudio.entries()) {
    const segment = payload.narration.segments[index];
    const { key, contentHash } = createNarrationSegmentDemoAudioKey(
      segment,
      payload.graph_id
    );

    assert.equal(item.entry.key, key);
    assert.equal(item.entry.content_hash, contentHash);
    assert.equal(item.entry.voice_id, bundledDemoAudioVoiceId);
  }

  const { key, contentHash } = createDesignReviewDemoAudioKey(payload.dialogue);
  assert.equal(reviewAudio.entry.key, key);
  assert.equal(reviewAudio.entry.content_hash, contentHash);
  assert.equal(reviewAudio.entry.voice_id, bundledDemoAudioDialogueVoiceId);
});

test("changed content or audio config misses the bundled cache", async () => {
  const payload = await loadPayload();
  const changedSegments: NarrationSegment[] = [
    {
      ...payload.narration.segments[0],
      text: payload.narration.segments[0].text + " Extra text."
    }
  ];
  const changedDialogue: DesignReviewDialogue = {
    ...payload.dialogue,
    turns: payload.dialogue.turns.map((turn, index) =>
      index === 0 ? { ...turn, text: turn.text + " Extra text." } : turn
    )
  };
  const alternateConfig = {
    voiceId: "different-demo-voice",
    modelId: bundledDemoAudioModelId,
    outputFormat: bundledDemoAudioOutputFormat
  };

  assert.equal(
    await getBundledNarrationAudio(changedSegments, payload.graph_id),
    null
  );
  assert.equal(await getBundledDesignReviewAudio(changedDialogue), null);
  assert.equal(
    await getBundledNarrationAudio(
      [payload.narration.segments[0]],
      payload.graph_id,
      undefined,
      alternateConfig
    ),
    null
  );
  assert.equal(
    await getBundledDesignReviewAudio(payload.dialogue, undefined, {
      ...alternateConfig,
      voiceId: bundledDemoAudioDialogueVoiceId,
      outputFormat: "wav_pcm_44100_mono"
    }),
    null
  );
});

test("missing or corrupt assets fail closed", async () => {
  const manifest = await loadDemoAudioManifest();

  assert.ok(manifest);
  const [entry] = manifest.entries;

  assert.equal(
    await readBundledDemoAudio({ ...entry, asset_path: "/demo-audio/missing.wav" }),
    null
  );
  assert.equal(
    await readBundledDemoAudio({ ...entry, audio_sha256: "0".repeat(64) }),
    null
  );
  assert.equal(await readBundledDemoAudio({ ...entry, byte_length: entry.byte_length + 1 }), null);
});

test("primary audio routes return bundled audio without provider configuration", async () => {
  const payload = await loadPayload();
  const previousApiKey = process.env.ELEVENLABS_API_KEY;
  const previousNarratorVoice = process.env.ELEVENLABS_NARRATOR_VOICE_ID;
  const previousBuilderVoice = process.env.ELEVENLABS_BUILDER_VOICE_ID;
  const previousReviewerVoice = process.env.ELEVENLABS_REVIEWER_VOICE_ID;
  const previousMentorVoice = process.env.ELEVENLABS_MENTOR_VOICE_ID;

  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_NARRATOR_VOICE_ID;
  delete process.env.ELEVENLABS_BUILDER_VOICE_ID;
  delete process.env.ELEVENLABS_REVIEWER_VOICE_ID;
  delete process.env.ELEVENLABS_MENTOR_VOICE_ID;

  try {
    const narrationResponse = await narrationAudioPost(
      jsonRequest("http://localhost/api/narration/audio", {
        segments: payload.narration.segments,
        response_format: "json"
      })
    );
    const narrationPayload = await narrationResponse.json();

    assert.equal(narrationResponse.status, 200);
    assert.equal(narrationPayload.audio.length, payload.narration.segments.length);
    assert.ok(
      narrationPayload.audio.every(
        (item: { metadata?: { source?: string; cache_status?: string; provider?: string } }) =>
          item.metadata?.source === "bundled" &&
          item.metadata.cache_status === "hit" &&
          item.metadata.provider === "bundled"
      )
    );

    const reviewResponse = await designReviewAudioPost(
      jsonRequest("http://localhost/api/design-review/audio", {
        dialogue: payload.dialogue,
        response_format: "json"
      })
    );
    const reviewPayload = await reviewResponse.json();

    assert.equal(reviewResponse.status, 200);
    assert.equal(reviewPayload.metadata.source, "bundled");
    assert.equal(reviewPayload.metadata.cache_status, "hit");
    assert.equal(reviewPayload.metadata.provider, "bundled");
    assert.equal(reviewPayload.metadata.turn_count, payload.dialogue.turns.length);
    assert.equal(reviewPayload.request.turn_count, payload.dialogue.turns.length);
    assert.ok(reviewPayload.audio_base64.length > 0);
  } finally {
    restoreEnv("ELEVENLABS_API_KEY", previousApiKey);
    restoreEnv("ELEVENLABS_NARRATOR_VOICE_ID", previousNarratorVoice);
    restoreEnv("ELEVENLABS_BUILDER_VOICE_ID", previousBuilderVoice);
    restoreEnv("ELEVENLABS_REVIEWER_VOICE_ID", previousReviewerVoice);
    restoreEnv("ELEVENLABS_MENTOR_VOICE_ID", previousMentorVoice);
  }
});

async function loadPayload(): Promise<DemoAudioPayload> {
  const payloadPath = path.join(
    process.cwd(),
    "artifacts",
    "task12",
    "demo-audio-payload.json"
  );
  return JSON.parse(await readFile(payloadPath, "utf8")) as DemoAudioPayload;
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
