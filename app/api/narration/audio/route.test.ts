import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "./route";

const validSegment = {
  id: "overview",
  kind: "overview",
  title: "Research assistant overview",
  text:
    "This walkthrough explains why the graph separates retrieval, grounding, verification, and human review before any final answer is trusted.",
  related_node_ids: ["retrieval", "citation-verifier"],
  related_issue_ids: ["grounding-warning"],
  target_duration_seconds: 16
} as const;

test("narration audio route returns mocked audio metadata for valid segments", async () => {
  let requestBody: { text: string; model_id: string } | undefined;

  await withElevenLabsEnv(
    {
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));

        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            "content-type": "audio/mpeg",
            "request-id": "provider-request-1",
            "x-elevenlabs-character-cost": "42"
          }
        });
      }
    },
    async () => {
      const response = await postJson({
        segment: validSegment,
        references: {
          node_ids: ["retrieval", "citation-verifier"],
          issue_ids: ["grounding-warning"]
        },
        response_format: "json"
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(requestBody?.text, validSegment.text);
      assert.equal(requestBody?.model_id, "eleven_multilingual_v2");
      assert.equal(body.audio[0].audio_base64, "AQID");
      assert.equal(body.audio[0].metadata.content_type, "audio/mpeg");
      assert.equal(body.audio[0].metadata.byte_length, 3);
      assert.equal(body.audio[0].metadata.character_cost, 42);
      assert.equal(body.audio[0].metadata.provider_request_id, "provider-request-1");
      assert.equal(body.request.segment_count, 1);
    }
  );
});

test("narration audio route rejects invalid references before provider calls", async () => {
  await withElevenLabsEnv(
    {
      fetch: async () => {
        throw new Error("Provider should not be called for invalid references.");
      }
    },
    async () => {
      const response = await postJson({
        segment: validSegment,
        references: {
          node_ids: ["retrieval"],
          issue_ids: ["grounding-warning"]
        },
        response_format: "json"
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.code, "invalid_request");
      assert.ok(
        body.details.some((detail: string) =>
          detail.includes("unknown node citation-verifier")
        )
      );
    }
  );
});

test("narration audio route rejects empty or oversized text", async () => {
  const emptyResponse = await postJson({
    segment: { ...validSegment, text: "" },
    response_format: "json"
  });
  const emptyBody = await emptyResponse.json();

  assert.equal(emptyResponse.status, 400);
  assert.equal(emptyBody.code, "invalid_request");

  const oversizedResponse = await postJson({
    segment: { ...validSegment, text: "x".repeat(600) },
    response_format: "json"
  });
  const oversizedBody = await oversizedResponse.json();

  assert.equal(oversizedResponse.status, 400);
  assert.equal(oversizedBody.code, "invalid_request");
});

test("narration audio route maps missing config to a stable error", async () => {
  await withElevenLabsEnv(
    {
      apiKey: undefined,
      voiceId: undefined,
      fetch: async () => {
        throw new Error("Provider should not be called without config.");
      }
    },
    async () => {
      const response = await postJson({
        segment: validSegment,
        response_format: "json"
      });
      const body = await response.json();

      assert.equal(response.status, 503);
      assert.equal(body.code, "missing_config");
    }
  );
});

test("narration audio route distinguishes 401, 429, and malformed provider audio", async () => {
  await withElevenLabsEnv(
    {
      fetch: async () =>
        new Response(JSON.stringify({ detail: "bad key" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })
    },
    async () => {
      const response = await postJson({
        segment: validSegment,
        response_format: "json"
      });
      const body = await response.json();

      assert.equal(response.status, 401);
      assert.equal(body.code, "unauthorized");
    }
  );

  await withElevenLabsEnv(
    {
      fetch: async () =>
        new Response("quota", {
          status: 429,
          headers: { "retry-after": "2" }
        })
    },
    async () => {
      const response = await postJson({
        segment: validSegment,
        response_format: "json"
      });
      const body = await response.json();

      assert.equal(response.status, 429);
      assert.equal(body.code, "rate_limited");
      assert.equal(body.retry_after_ms, 2000);
    }
  );

  await withElevenLabsEnv(
    {
      fetch: async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    },
    async () => {
      const response = await postJson({
        segment: validSegment,
        response_format: "json"
      });
      const body = await response.json();

      assert.equal(response.status, 502);
      assert.equal(body.code, "malformed_audio");
    }
  );
});

async function postJson(body: unknown) {
  return POST(
    new Request("http://localhost/api/narration/audio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );
}

async function withElevenLabsEnv(
  options: {
    apiKey?: string;
    voiceId?: string;
    fetch?: typeof fetch;
  },
  callback: () => Promise<void>
) {
  const previousApiKey = process.env.ELEVENLABS_API_KEY;
  const previousVoiceId = process.env.ELEVENLABS_NARRATOR_VOICE_ID;
  const previousFetch = globalThis.fetch;

  setOptionalEnv(
    "ELEVENLABS_API_KEY",
    "apiKey" in options ? options.apiKey : "test-elevenlabs-key"
  );
  setOptionalEnv(
    "ELEVENLABS_NARRATOR_VOICE_ID",
    "voiceId" in options ? options.voiceId : "narrator-voice"
  );

  if (options.fetch) {
    globalThis.fetch = options.fetch;
  }

  try {
    await callback();
  } finally {
    setOptionalEnv("ELEVENLABS_API_KEY", previousApiKey);
    setOptionalEnv("ELEVENLABS_NARRATOR_VOICE_ID", previousVoiceId);
    globalThis.fetch = previousFetch;
  }
}

function setOptionalEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }

  process.env[name] = value;
}
