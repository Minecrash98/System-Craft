import { NextResponse } from "next/server";
import { z } from "zod";

import { buildFallbackClarification } from "@/lib/ai/fallbacks";
import { normalizeClarificationCandidate } from "@/lib/ai/normalizeClarification";
import { runJsonPrompt } from "@/lib/ai/openaiClient";
import { loadPrompt } from "@/lib/ai/promptLoader";
import { clarificationResponseSchema } from "@/lib/ai/types";

const clarifyRequestSchema = z.object({
  idea: z.string().trim().min(1).max(2000),
  example_id: z.string().min(1).optional()
});

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = clarifyRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Enter an AI product idea before requesting clarification.",
        details: parsed.error.issues.map((issue) => issue.message)
      },
      { status: 400 }
    );
  }

  const fallback = buildFallbackClarification(
    parsed.data.idea,
    parsed.data.example_id
  );

  try {
    const prompt = await loadPrompt("clarify.md");
    const modelOutput = await runJsonPrompt<unknown>({
      systemPrompt: prompt,
      userPrompt: JSON.stringify(parsed.data),
      maxTokens: 1200
    });
    const questions = clarificationResponseSchema.safeParse(modelOutput);

    if (questions.success) {
      return NextResponse.json({ ...questions.data, source: "model" });
    }

    const normalized = normalizeClarificationCandidate(modelOutput);

    if (normalized) {
      return NextResponse.json({
        ...normalized,
        source: "model",
        normalized: true,
        warning:
          "Model clarification output was normalized to SystemCraft's question format."
      });
    }

    return NextResponse.json({
      ...fallback,
      source: "fallback",
      warning: "Model clarification output was malformed, so cached questions were used."
    });
  } catch (error) {
    return NextResponse.json({
      ...fallback,
      source: "fallback",
      warning: getErrorMessage(error)
    });
  }
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Clarification model call failed.";
}
