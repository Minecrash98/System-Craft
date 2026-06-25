import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { runJsonPrompt } from "@/lib/ai/openaiClient";
import {
  buildDeterministicDesignReviewDialogue,
  validateDesignReviewDialogueCandidate
} from "@/lib/design-review/buildDesignReviewDialogue";
import {
  maxDesignReviewTotalCharacters,
  maxDesignReviewTurnCharacters
} from "@/lib/design-review/schema";
import { scoreArchitectureGraph } from "@/lib/scoring/scoreArchitecture";
import { validateArchitectureGraph } from "@/lib/validation/validateArchitecture";
import { architectureGraphSchema, severitySchema } from "@/shared/schemas/graphSchema";

const validationIssueSchema = z.object({
  id: z.string().min(1),
  rule_id: z.string().min(1),
  severity: severitySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  affected_node_ids: z.array(z.string().min(1)),
  recommendation: z.string().min(1),
  score_impact: z
    .object({
      dimension: z.string().min(1),
      delta: z.number()
    })
    .optional(),
  auto_fix_possible: z.boolean()
});

const validationResultSchema = z.object({
  graph_id: z.string().min(1),
  issues: z.array(validationIssueSchema),
  checked_at: z.string().min(1).optional()
});

const scoreReasonSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  related_node_ids: z.array(z.string().min(1)).optional(),
  related_issue_ids: z.array(z.string().min(1)).optional()
});

const dimensionScoreSchema = z.object({
  dimension: z.enum([
    "reliability",
    "user_control",
    "privacy",
    "cost_efficiency",
    "maintainability",
    "learning_value",
    "task_fit"
  ]),
  score: z.number().min(0).max(100),
  reasons: z.array(scoreReasonSchema),
  improvements: z.array(scoreReasonSchema)
});

const architectureScoreSchema = z.object({
  graph_id: z.string().min(1),
  overall: z.number().min(0).max(100),
  band: z.enum([
    "strong_starting_point",
    "good_but_review_issues",
    "needs_architectural_work",
    "risky_or_incomplete"
  ]),
  dimensions: z.array(dimensionScoreSchema),
  strengths: z.array(scoreReasonSchema),
  improvements: z.array(scoreReasonSchema),
  issues_considered: z.array(validationIssueSchema),
  disclaimer: z.string().min(1)
});

const designReviewScriptRequestSchema = z.object({
  graph: architectureGraphSchema,
  validation: validationResultSchema.optional(),
  score: architectureScoreSchema.optional(),
  refine_with_model: z.boolean().default(false)
});

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = designReviewScriptRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Request body must include a valid architecture graph for design review.",
        details: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "request"}: ${issue.message}`
        )
      },
      { status: 400 }
    );
  }

  const { graph, refine_with_model: refineWithModel } = parsed.data;
  const validation = parsed.data.validation ?? validateArchitectureGraph(graph);

  if (validation.graph_id !== graph.id) {
    return NextResponse.json(
      {
        error: "Validation result graph_id must match the submitted graph id."
      },
      { status: 400 }
    );
  }

  const score = parsed.data.score ?? scoreArchitectureGraph(graph, validation);

  if (score.graph_id !== graph.id) {
    return NextResponse.json(
      {
        error: "Score result graph_id must match the submitted graph id."
      },
      { status: 400 }
    );
  }

  const fallbackDialogue = buildDeterministicDesignReviewDialogue({
    graph,
    validation,
    score
  });

  if (!refineWithModel) {
    return NextResponse.json({
      dialogue: fallbackDialogue,
      source: "deterministic",
      validation,
      score
    });
  }

  try {
    const prompt = await readDesignReviewPrompt();
    const modelOutput = await runJsonPrompt<unknown>({
      systemPrompt: prompt,
      userPrompt: JSON.stringify({
        graph,
        validation,
        score,
        deterministic_dialogue: fallbackDialogue,
        constraints: {
          roles: ["builder", "reviewer", "mentor"],
          turn_count: "exactly_7",
          max_total_characters: maxDesignReviewTotalCharacters,
          max_turn_characters: maxDesignReviewTurnCharacters,
          audio_generation: "out_of_scope",
          must_use_existing_node_ids: true,
          must_use_existing_issue_ids: true
        }
      }),
      temperature: 0.1,
      maxTokens: 3600
    });
    const refined = validateDesignReviewDialogueCandidate(modelOutput, {
      graph,
      validation
    });

    const refinedErrors = getModelDialogueValidationErrors(refined);

    if (refined.success && refinedErrors.length === 0) {
      return NextResponse.json({
        dialogue: refined.dialogue,
        source: "model",
        validation,
        score
      });
    }

    return NextResponse.json({
      dialogue: fallbackDialogue,
      source: "deterministic",
      warning:
        "Model design review dialogue failed validation; deterministic fallback was used.",
      validation_errors: refinedErrors,
      validation,
      score
    });
  } catch (error) {
    return NextResponse.json({
      dialogue: fallbackDialogue,
      source: "deterministic",
      warning: getErrorMessage(error),
      validation,
      score
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

function readDesignReviewPrompt() {
  return readFile(
    path.join(process.cwd(), "systemPrompt", "review_gen.txt"),
    "utf8"
  );
}

function getModelDialogueValidationErrors(
  result: ReturnType<typeof validateDesignReviewDialogueCandidate>
) {
  if (!result.success) {
    return result.errors;
  }

  const errors: string[] = [];

  if (result.dialogue.source !== "model") {
    errors.push("dialogue.source must be model for refined output.");
  }

  if (result.dialogue.turns.length !== 7) {
    errors.push(
      `dialogue.turns must include exactly 7 turns; received ${result.dialogue.turns.length}.`
    );
  }

  return errors;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Design review dialogue model refinement failed.";
}
