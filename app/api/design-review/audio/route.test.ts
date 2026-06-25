import assert from "node:assert/strict";
import test from "node:test";

import type { DesignReviewDialogue } from "@/lib/design-review/types";

import { POST } from "./route";

test("design review audio route maps roles to server voices and returns safe metadata", async () => {
  let requestUrl = "";
  let requestBody:
    | {
        inputs: Array<{ text: string; voice_id: string }>;
        model_id: string;
      }
    | undefined;

  await withElevenLabsEnv(
    {
      fetch: async (input, init) => {
        requestUrl = String(input);
        requestBody = JSON.parse(String(init?.body));

        return new Response(new Uint8Array([9, 8, 7]), {
          status: 200,
          headers: {
            "content-type": "audio/mpeg",
            "request-id": "provider-request-9",
            "x-character-cost": "144"
          }
        });
      }
    },
    async () => {
      const dialogue = makeValidDialogue();
      const response = await postJson({
        dialogue,
        request_id: "request-1",
        trace_id: "trace-1",
        response_format: "json"
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.match(requestUrl, /\/v1\/text-to-dialogue\?output_format=mp3_44100_128$/);
      assert.equal(requestBody?.model_id, "eleven_v3");
      assert.deepEqual(
        requestBody?.inputs.map((input) => input.voice_id),
        [
          "builder-voice",
          "reviewer-voice",
          "builder-voice",
          "reviewer-voice",
          "mentor-voice",
          "mentor-voice"
        ]
      );
      assert.equal(body.audio_base64, "CQgH");
      assert.equal(body.alignment, null);
      assert.equal(body.metadata.endpoint, "createDialogue");
      assert.equal(body.metadata.content_type, "audio/mpeg");
      assert.equal(body.metadata.byte_length, 3);
      assert.equal(body.metadata.character_cost, 144);
      assert.equal(body.metadata.provider_request_id, "provider-request-9");
      assert.equal(body.metadata.voice_count, 3);
      assert.equal(body.metadata.turn_count, 6);
      assert.deepEqual(body.metadata.roles, ["builder", "reviewer", "mentor"]);
      assert.equal(body.request.dialogue_id, dialogue.id);
      assert.equal(body.request.role_order[0].role, "builder");
      assert.equal(JSON.stringify(body).includes("builder-voice"), false);
    }
  );
});

test("design review audio route rejects missing role voice configuration", async () => {
  await withElevenLabsEnv(
    {
      reviewerVoiceId: undefined,
      fetch: async () => {
        throw new Error("Provider should not be called without all role voices.");
      }
    },
    async () => {
      const response = await postJson({
        dialogue: makeValidDialogue(),
        response_format: "json"
      });
      const body = await response.json();

      assert.equal(response.status, 503);
      assert.equal(body.code, "missing_config");
      assert.ok(
        body.details.some((detail: string) =>
          detail.includes("ELEVENLABS_REVIEWER_VOICE_ID")
        )
      );
    }
  );
});

test("design review audio route rejects audio text above provider limits", async () => {
  await withElevenLabsEnv(
    {
      fetch: async () => {
        throw new Error("Provider should not be called for oversized audio text.");
      }
    },
    async () => {
      const dialogue = makeValidDialogue({
        turnText: "x".repeat(340)
      });
      const response = await postJson({
        dialogue,
        response_format: "json"
      });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.code, "invalid_request");
      assert.ok(
        body.details.some((detail: string) => detail.includes("2000 characters"))
      );
    }
  );
});

test("design review audio route distinguishes provider failures", async () => {
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
        dialogue: makeValidDialogue(),
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
        dialogue: makeValidDialogue(),
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
        dialogue: makeValidDialogue(),
        response_format: "json"
      });
      const body = await response.json();

      assert.equal(response.status, 502);
      assert.equal(body.code, "malformed_audio");
    }
  );
});

test("design review audio route maps provider timeout to a stable error", async () => {
  await withElevenLabsEnv(
    {
      timeoutMs: "5",
      fetch: () => new Promise<Response>(() => undefined)
    },
    async () => {
      const response = await postJson({
        dialogue: makeValidDialogue(),
        response_format: "json"
      });
      const body = await response.json();

      assert.equal(response.status, 504);
      assert.equal(body.code, "timeout");
    }
  );
});

async function postJson(body: unknown) {
  return POST(
    new Request("http://localhost/api/design-review/audio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );
}

function makeValidDialogue(options: { turnText?: string } = {}): DesignReviewDialogue {
  const turnText =
    options.turnText ??
    "The design choice stays concrete: retrieval, citation checking, and human review are separate checkpoints before a user trusts the final answer.";

  return {
    id: "research-assistant-design-review",
    graph_id: "research-assistant",
    version: "1.0.0",
    title: "Research assistant design review",
    source: "deterministic",
    review_notice:
      "This is a simulated design critique for an architecture graph. It is not a live execution, not proof of correctness, and does not call external systems.",
    turns: [
      turn("turn-1-builder", "builder", turnText),
      turn("turn-2-reviewer", "reviewer", turnText),
      turn("turn-3-builder", "builder", turnText),
      turn("turn-4-reviewer", "reviewer", turnText),
      turn("turn-5-mentor", "mentor", turnText),
      turn("turn-6-mentor", "mentor", turnText)
    ],
    lessons: [
      {
        id: "lesson-evidence-before-answer",
        title: "Evidence before answers",
        text:
          "For source-heavy work, make retrieval and citation checks visible before the output so the user can inspect the evidence path.",
        related_node_ids: ["retrieval"],
        related_issue_ids: []
      },
      {
        id: "lesson-tradeoffs-stay-visible",
        title: "Tradeoffs stay visible",
        text:
          "Privacy, user control, cost, and latency should stay named as design tradeoffs instead of disappearing behind a polished model response.",
        related_node_ids: ["human-review"],
        related_issue_ids: []
      }
    ]
  };
}

function turn(
  id: string,
  role: "builder" | "reviewer" | "mentor",
  text: string
) {
  return {
    id,
    role,
    speaker: role === "builder" ? "Builder" : role === "reviewer" ? "Reviewer" : "Mentor",
    text,
    related_node_ids: ["retrieval"],
    related_issue_ids: []
  };
}

async function withElevenLabsEnv(
  options: {
    apiKey?: string;
    builderVoiceId?: string;
    reviewerVoiceId?: string;
    mentorVoiceId?: string;
    timeoutMs?: string;
    fetch?: typeof fetch;
  },
  callback: () => Promise<void>
) {
  const previousApiKey = process.env.ELEVENLABS_API_KEY;
  const previousBuilderVoiceId = process.env.ELEVENLABS_BUILDER_VOICE_ID;
  const previousReviewerVoiceId = process.env.ELEVENLABS_REVIEWER_VOICE_ID;
  const previousMentorVoiceId = process.env.ELEVENLABS_MENTOR_VOICE_ID;
  const previousTimeoutMs = process.env.ELEVENLABS_TIMEOUT_MS;
  const previousFetch = globalThis.fetch;

  setOptionalEnv(
    "ELEVENLABS_API_KEY",
    "apiKey" in options ? options.apiKey : "test-elevenlabs-key"
  );
  setOptionalEnv(
    "ELEVENLABS_BUILDER_VOICE_ID",
    "builderVoiceId" in options ? options.builderVoiceId : "builder-voice"
  );
  setOptionalEnv(
    "ELEVENLABS_REVIEWER_VOICE_ID",
    "reviewerVoiceId" in options ? options.reviewerVoiceId : "reviewer-voice"
  );
  setOptionalEnv(
    "ELEVENLABS_MENTOR_VOICE_ID",
    "mentorVoiceId" in options ? options.mentorVoiceId : "mentor-voice"
  );
  setOptionalEnv(
    "ELEVENLABS_TIMEOUT_MS",
    "timeoutMs" in options ? options.timeoutMs : "50"
  );

  if (options.fetch) {
    globalThis.fetch = options.fetch;
  }

  try {
    await callback();
  } finally {
    setOptionalEnv("ELEVENLABS_API_KEY", previousApiKey);
    setOptionalEnv("ELEVENLABS_BUILDER_VOICE_ID", previousBuilderVoiceId);
    setOptionalEnv("ELEVENLABS_REVIEWER_VOICE_ID", previousReviewerVoiceId);
    setOptionalEnv("ELEVENLABS_MENTOR_VOICE_ID", previousMentorVoiceId);
    setOptionalEnv("ELEVENLABS_TIMEOUT_MS", previousTimeoutMs);
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
