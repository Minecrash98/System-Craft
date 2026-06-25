import { NextResponse } from "next/server";
import { z } from "zod";

import { runJsonPrompt } from "@/lib/ai/openaiClient";
import { loadPrompt } from "@/lib/ai/promptLoader";
import {
  buildDeterministicNarrationScript,
  validateNarrationScriptCandidate
} from "@/lib/narration/buildNarrationScript";
import { maxNarrationTargetSeconds } from "@/lib/narration/schema";
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

const narrationScriptRequestSchema = z.object({
  graph: architectureGraphSchema,
  validation: validationResultSchema.optional(),
  score: architectureScoreSchema.optional(),
  refine_with_model: z.boolean().default(true)
});

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = narrationScriptRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Request body must include a valid architecture graph for narration.",
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

  const fallbackScript = buildDeterministicNarrationScript({
    graph,
    validation,
    score
  });

  if (!refineWithModel) {
    return NextResponse.json({
      script: fallbackScript,
      source: "deterministic",
      validation,
      score
    });
  }

  try {
    const prompt = await loadPrompt("narrationScript.md");
    const modelOutput = await runJsonPrompt<unknown>({
      systemPrompt: prompt,
      userPrompt: JSON.stringify({
        graph,
        validation,
        score,
        deterministic_script: fallbackScript,
        constraints: {
          max_target_duration_seconds: maxNarrationTargetSeconds,
          segment_count: "5-8",
          audio_generation: "out_of_scope"
        }
      }),
      temperature: 0.1,
      maxTokens: 3500
    });
    const refined = validateNarrationScriptCandidate(modelOutput, {
      graph,
      validation
    });

    if (refined.success) {
      return NextResponse.json({
        script: refined.script,
        source: "model",
        validation,
        score
      });
    }

    return NextResponse.json({
      script: fallbackScript,
      source: "deterministic",
      warning: "Model narration script failed validation; deterministic fallback was used.",
      validation_errors: refined.errors,
      validation,
      score
    });
  } catch (error) {
    return NextResponse.json({
      script: fallbackScript,
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

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Narration script model refinement failed.";
}
