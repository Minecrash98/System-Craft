import { NextResponse } from "next/server";

import { simulateArchitectureRun } from "@/lib/demo/simulateRun";
import { architectureGraphSchema } from "@/shared/schemas/graphSchema";

export async function POST(request: Request) {
  const body = await readJson(request);
  const graphCandidate = getGraphCandidate(body);
  const parsed = architectureGraphSchema.safeParse(graphCandidate);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Request body must include a valid architecture graph.",
        details: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "graph"}: ${issue.message}`
        )
      },
      { status: 400 }
    );
  }

  const task =
    isRecord(body) && typeof body.task === "string" && body.task.trim()
      ? body.task.trim()
      : undefined;

  return NextResponse.json({
    trace: simulateArchitectureRun(parsed.data, task)
  });
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function getGraphCandidate(body: unknown) {
  if (isRecord(body) && "graph" in body) {
    return body.graph;
  }

  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
