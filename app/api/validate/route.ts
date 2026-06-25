import { NextResponse } from "next/server";

import { validateArchitectureGraph } from "@/lib/validation/validateArchitecture";
import type { ArchitectureGraph } from "@/shared/types/graph";

export async function POST(request: Request) {
  const body = await readJson(request);
  const graph = getGraphCandidate(body);

  if (!isArchitectureGraphLike(graph)) {
    return NextResponse.json(
      {
        error: "Request body must include an architecture graph with id, nodes, edges, and task_profile."
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    validation: validateArchitectureGraph(graph)
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

function isArchitectureGraphLike(value: unknown): value is ArchitectureGraph {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    isRecord(value.task_profile)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
