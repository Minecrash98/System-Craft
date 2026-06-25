import { NextResponse } from "next/server";
import { z } from "zod";

import { simulateArchitectureRun } from "@/lib/demo/simulateRun";
import { graphToJson } from "@/lib/export/graphToJson";
import { graphToMarkdown } from "@/lib/export/graphToMarkdown";
import { scoreArchitectureGraph } from "@/lib/scoring/scoreArchitecture";
import { validateArchitectureGraph } from "@/lib/validation/validateArchitecture";
import { architectureGraphSchema } from "@/shared/schemas/graphSchema";

const exportRequestSchema = z.object({
  graph: architectureGraphSchema,
  format: z.enum(["json", "markdown", "both"]).default("both"),
  task: z.string().trim().min(1).optional()
});

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = exportRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Request body must include a valid architecture graph and export format.",
        details: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "request"}: ${issue.message}`
        )
      },
      { status: 400 }
    );
  }

  const { graph, format, task } = parsed.data;
  const validation = validateArchitectureGraph(graph);
  const score = scoreArchitectureGraph(graph, validation);
  const trace = simulateArchitectureRun(graph, task);

  return NextResponse.json({
    export: {
      json: format === "json" || format === "both" ? graphToJson(graph) : undefined,
      markdown:
        format === "markdown" || format === "both"
          ? graphToMarkdown({ graph, validation, score, trace })
          : undefined
    },
    validation,
    score,
    trace
  });
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
