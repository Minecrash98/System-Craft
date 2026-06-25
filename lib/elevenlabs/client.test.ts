import assert from "node:assert/strict";
import test from "node:test";

import { createDialogue, createSpeech } from "./client";
import { isElevenLabsError } from "./errors";
import type { ElevenLabsFetch } from "./types";

const apiKey = "test-elevenlabs-key";

test("createSpeech sends typed TTS payloads and returns safe audio metadata", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetchMock: ElevenLabsFetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;

    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        "request-id": "provider-request-1",
        "x-elevenlabs-character-cost": "5"
      }
    });
  };

  const result = await createSpeech(
    {
      text: "Hello",
      voiceId: "voice-a",
      metadata: { requestId: "app-request-1", traceId: "trace-1" }
    },
    { apiKey, fetch: fetchMock, timeoutMs: 50 }
  );
  const requestBody = JSON.parse(String(requestInit?.body));
  const requestHeaders = requestInit?.headers as Record<string, string>;

  assert.match(
    requestUrl,
    /\/v1\/text-to-speech\/voice-a\?output_format=mp3_44100_128$/
  );
  assert.equal(requestHeaders["xi-api-key"], apiKey);
  assert.equal(requestBody.text, "Hello");
  assert.equal(requestBody.model_id, "eleven_multilingual_v2");
  assert.deepEqual(Array.from(result.bytes), [1, 2, 3]);
  assert.equal(result.contentType, "audio/mpeg");
  assert.equal(result.metadata.endpoint, "createSpeech");
  assert.equal(result.metadata.characterCount, 5);
  assert.equal(result.metadata.characterCost, 5);
  assert.equal(result.metadata.providerRequestId, "provider-request-1");
  assert.equal(result.metadata.requestId, "app-request-1");
  assert.equal(result.metadata.traceId, "trace-1");
  assert.equal(result.metadata.voiceId, "voice-a");
});

test("createDialogue sends typed dialogue payloads and returns audio metadata", async () => {
  let requestUrl = "";
  let requestBody: {
    inputs: Array<{ text: string; voice_id: string }>;
    model_id: string;
  };
  const fetchMock: ElevenLabsFetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));

    return new Response(new Uint8Array([7, 8]), {
      status: 200,
      headers: { "content-type": "audio/mpeg", "x-character-cost": "28" }
    });
  };

  const result = await createDialogue(
    {
      inputs: [
        { text: "Builder opens.", voiceId: "builder-voice", role: "builder" },
        { text: "Reviewer answers.", voiceId: "reviewer-voice", role: "reviewer" }
      ],
      metadata: { traceId: "dialogue-trace" }
    },
    { apiKey, fetch: fetchMock, timeoutMs: 50 }
  );

  assert.match(requestUrl, /\/v1\/text-to-dialogue\?output_format=mp3_44100_128$/);
  assert.equal(requestBody!.model_id, "eleven_v3");
  assert.deepEqual(requestBody!.inputs, [
    { text: "Builder opens.", voice_id: "builder-voice" },
    { text: "Reviewer answers.", voice_id: "reviewer-voice" }
  ]);
  assert.deepEqual(Array.from(result.bytes), [7, 8]);
  assert.equal(result.metadata.endpoint, "createDialogue");
  assert.equal(result.metadata.characterCount, 31);
  assert.equal(result.metadata.characterCost, 28);
  assert.equal(result.metadata.turnCount, 2);
  assert.equal(result.metadata.voiceCount, 2);
  assert.equal(result.metadata.traceId, "dialogue-trace");
});

test("createSpeech maps 401 responses to unauthorized errors", async () => {
  const fetchMock: ElevenLabsFetch = async () =>
    new Response(JSON.stringify({ detail: "bad key" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    });

  await assert.rejects(
    () =>
      createSpeech(
        { text: "Hello", voiceId: "voice-a" },
        { apiKey, fetch: fetchMock, timeoutMs: 50 }
      ),
    (error) =>
      isElevenLabsError(error) &&
      error.code === "unauthorized" &&
      error.status === 401
  );
});

test("createSpeech maps 429 responses to rate-limited errors", async () => {
  const fetchMock: ElevenLabsFetch = async () =>
    new Response("quota", {
      status: 429,
      headers: { "retry-after": "2" }
    });

  await assert.rejects(
    () =>
      createSpeech(
        { text: "Hello", voiceId: "voice-a" },
        { apiKey, fetch: fetchMock, timeoutMs: 50 }
      ),
    (error) =>
      isElevenLabsError(error) &&
      error.code === "rate_limited" &&
      error.status === 429 &&
      error.retryAfterMs === 2000
  );
});

test("createDialogue maps timeout to a stable timeout error", async () => {
  const fetchMock: ElevenLabsFetch = () => new Promise<Response>(() => undefined);

  await assert.rejects(
    () =>
      createDialogue(
        { inputs: [{ text: "Hello", voiceId: "voice-a" }] },
        { apiKey, fetch: fetchMock, timeoutMs: 5 }
      ),
    (error) => isElevenLabsError(error) && error.code === "timeout"
  );
});

test("createSpeech rejects malformed successful responses", async () => {
  const fetchMock: ElevenLabsFetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

  await assert.rejects(
    () =>
      createSpeech(
        { text: "Hello", voiceId: "voice-a" },
        { apiKey, fetch: fetchMock, timeoutMs: 50 }
      ),
    (error) => isElevenLabsError(error) && error.code === "malformed_response"
  );
});

test("createSpeech does not read secrets in browser-like execution", async () => {
  const globalRecord = globalThis as Record<string, unknown>;
  globalRecord.window = {};

  try {
    await assert.rejects(
      () =>
        createSpeech(
          { text: "Hello", voiceId: "voice-a" },
          { apiKey, fetch: async () => new Response(new Uint8Array([1])) }
        ),
      (error) =>
        isElevenLabsError(error) && error.code === "configuration_error"
    );
  } finally {
    Reflect.deleteProperty(globalRecord, "window");
  }
});
