import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { runJsonPrompt } from "@/lib/ai/openaiClient";
import { applyGraphEditPatch } from "@/lib/graph-edit/applyPatch";
import {
  buildNodeAddFallbackPatch,
  buildNodeEditFallbackPatch
} from "@/lib/graph-edit/fallbacks";
import { validateGraphEditPatchCandidate } from "@/lib/graph-edit/schema";
import type { GraphEditMode, GraphEditPatch } from "@/lib/graph-edit/types";
import { scoreArchitectureGraph } from "@/lib/scoring/scoreArchitecture";
import { validateArchitectureGraph } from "@/lib/validation/validateArchitecture";
import { architectureGraphSchema } from "@/shared/schemas/graphSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const graphEditRequestSchema = z.object({
  graph: architectureGraphSchema,
  mode: z.enum(["add_node", "edit_node"]),
  selected_node_id: z.string().min(1).optional(),
  user_request: z.string().trim().min(3).max(1200),
  preferred_anchor_node_ids: z.array(z.string().min(1)).max(2).optional()
});

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = graphEditRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Request body must include a valid graph edit request.",
        details: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "request"}: ${issue.message}`
        )
      },
      { status: 400 }
    );
  }

  const { graph, mode, user_request: userRequest } = parsed.data;
  const validation = validateArchitectureGraph(graph);
  const score = scoreArchitectureGraph(graph, validation);

  if (mode === "edit_node" && !parsed.data.selected_node_id) {
    return NextResponse.json(
      {
        error: "selected_node_id is required when mode is edit_node."
      },
      { status: 400 }
    );
  }

  const fallbackPatch = buildFallbackPatch({
    graph,
    mode,
    preferredAnchorNodeIds: parsed.data.preferred_anchor_node_ids,
    selectedNodeId: parsed.data.selected_node_id,
    userRequest
  });

  try {
    const prompt = await readGraphEditPrompt(mode);
    const input = {
      mode,
      graph,
      selected_node_id: parsed.data.selected_node_id,
      user_request: userRequest,
      preferred_anchor_node_ids: parsed.data.preferred_anchor_node_ids ?? [],
      validation,
      score,
      constraints:
        mode === "edit_node"
          ? {
              preserve_existing_nodes: true,
              preserve_existing_edges: true,
              do_not_execute_external_tools: true
            }
          : {
              preserve_existing_nodes: false,
              preserve_existing_edges: false,
              do_not_execute_external_tools: true
            }
    };
    const modelOutput = await runJsonPrompt<unknown>({
      systemPrompt: prompt.replace("{{INPUT_JSON}}", JSON.stringify(input)),
      userPrompt: "Return exactly one valid JSON object shaped as {\"patch\": GraphEditPatch}.",
      temperature: 0.1,
      maxTokens: mode === "add_node" ? 3600 : 2600
    });
    const validated = validateGraphEditPatchCandidate(modelOutput, graph);

    if (validated.success) {
      return graphEditResponse({
        graph,
        patch: validated.patch,
        source: "model"
      });
    }

    return graphEditResponse({
      graph,
      patch: fallbackPatch,
      source: "fallback",
      warning: "Model graph edit patch failed validation; deterministic fallback was used.",
      validationErrors: validated.errors
    });
  } catch (error) {
    return graphEditResponse({
      graph,
      patch: fallbackPatch,
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

function readGraphEditPrompt(mode: GraphEditMode) {
  return readFile(
    path.join(
      process.cwd(),
      "systemPrompt",
      mode === "add_node" ? "node_add.txt" : "node_edit.txt"
    ),
    "utf8"
  );
}

function buildFallbackPatch({
  graph,
  mode,
  preferredAnchorNodeIds,
  selectedNodeId,
  userRequest
}: {
  graph: z.infer<typeof architectureGraphSchema>;
  mode: "add_node" | "edit_node";
  preferredAnchorNodeIds?: string[];
  selectedNodeId?: string;
  userRequest: string;
}): GraphEditPatch {
  if (mode === "add_node") {
    return buildNodeAddFallbackPatch({
      graph,
      userRequest,
      preferredAnchorNodeIds
    });
  }

  return buildNodeEditFallbackPatch({
    graph,
    selectedNodeId: selectedNodeId ?? "",
    userRequest
  });
}

function graphEditResponse({
  graph,
  patch,
  source,
  validationErrors,
  warning
}: {
  graph: z.infer<typeof architectureGraphSchema>;
  patch: GraphEditPatch;
  source: "model" | "fallback";
  validationErrors?: string[];
  warning?: string;
}) {
  try {
    return NextResponse.json({
      graph: applyGraphEditPatch(graph, patch),
      patch,
      source,
      validation_errors: validationErrors,
      warning
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Graph edit patch could not be applied safely.",
        patch,
        source,
        validation_errors: validationErrors,
        warning,
        details: [getErrorMessage(error)]
      },
      { status: 422 }
    );
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Graph edit request failed.";
}
