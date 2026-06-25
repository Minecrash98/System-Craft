import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { normalizeArchitectureGraphCandidate } from "@/lib/ai/normalizeArchitectureGraph";
import { runJsonPrompt, streamTextPrompt } from "@/lib/ai/openaiClient";
import {
  generationRequestSchema,
  type GenerationRequest
} from "@/lib/ai/types";
import { buildFallbackArchitecture } from "@/lib/graph/graphTemplates";
import {
  architectureGraphSchema,
  architectureNodeSchema
} from "@/shared/schemas/graphSchema";
import type { ArchitectureGraph, ArchitectureNode } from "@/shared/types/graph";

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = generationRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Enter an AI product idea before generating architecture.",
        details: parsed.error.issues.map((issue) => issue.message)
      },
      { status: 400 }
    );
  }

  const fallbackGraph = buildFallbackArchitecture(parsed.data);

  if (isRecord(body) && body.stream === true) {
    return streamArchitectureGeneration(parsed.data, fallbackGraph);
  }

  try {
    const prompt = await loadArchitectureSystemPrompt(parsed.data);
    const firstOutput = await runJsonPrompt<unknown>({
      systemPrompt: prompt,
      userPrompt: "Generate the architecture graph JSON now. Return exactly one JSON object.",
      maxTokens: 9000
    });
    const firstGraph = parseGraphCandidate(firstOutput, parsed.data.idea);

    if (firstGraph.success) {
      return NextResponse.json({
        graph: firstGraph.graph,
        source: "model",
        normalized: firstGraph.normalized
      });
    }

    const repairOutput = await runJsonPrompt<unknown>({
      systemPrompt: `${prompt}\n\nRepair the supplied graph so it matches the schema exactly. Return exactly one JSON object. Do not include markdown or explanatory text.`,
      userPrompt: JSON.stringify({
        request: parsed.data,
        invalid_graph: firstOutput,
        validation_errors: firstGraph.errors
      }),
      maxTokens: 9000
    });
    const repairedGraph = parseGraphCandidate(repairOutput, parsed.data.idea);

    if (repairedGraph.success) {
      return NextResponse.json({
        graph: repairedGraph.graph,
        source: "model",
        repaired: true,
        normalized: repairedGraph.normalized
      });
    }

    return NextResponse.json({
      graph: fallbackGraph,
      source: "fallback",
      warning: "Model graph failed schema validation after one repair attempt.",
      validation_errors: repairedGraph.errors
    });
  } catch (error) {
    return NextResponse.json({
      graph: fallbackGraph,
      source: "fallback",
      warning: getErrorMessage(error)
    });
  }
}

function streamArchitectureGeneration(
  requestData: GenerationRequest,
  fallbackGraph: ArchitectureGraph
) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const emittedNodeIds = new Set<string>();
        const write = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        const emitNode = (node: ArchitectureNode) => {
          if (emittedNodeIds.has(node.id)) {
            return;
          }

          emittedNodeIds.add(node.id);
          write({ type: "node", node });
        };

        try {
          write({ type: "meta", source: "model" });

          const systemPrompt = await loadArchitectureSystemPrompt(requestData);
          let streamedText = "";

          for await (const chunk of streamTextPrompt({
            systemPrompt,
            userPrompt:
              "Generate the architecture graph JSON now. Return exactly one JSON object.",
            maxTokens: 9000
          })) {
            streamedText += chunk;

            for (const candidate of extractNodeCandidates(streamedText)) {
              const parsedNode = architectureNodeSchema.safeParse(candidate);

              if (parsedNode.success) {
                emitNode(parsedNode.data);
              }
            }
          }

          const parsedGraph = parseGraphCandidate(streamedText, requestData.idea);

          if (parsedGraph.success) {
            for (const node of parsedGraph.graph.nodes) {
              emitNode(node);
            }

            write({
              type: "graph",
              graph: parsedGraph.graph,
              source: "model",
              normalized: parsedGraph.normalized
            });
            return;
          }

          emitFallbackGraph(write, fallbackGraph, {
            warning: "Model graph failed schema validation after streaming completed.",
            validationErrors: parsedGraph.errors
          });
        } catch (error) {
          emitFallbackGraph(write, fallbackGraph, {
            warning: getErrorMessage(error)
          });
        } finally {
          controller.close();
        }
      }
    }),
    {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Accel-Buffering": "no"
      }
    }
  );
}

function emitFallbackGraph(
  write: (event: Record<string, unknown>) => void,
  fallbackGraph: ArchitectureGraph,
  options: { warning: string; validationErrors?: string[] }
) {
  write({ type: "reset" });
  write({
    type: "warning",
    warning: options.warning,
    validation_errors: options.validationErrors
  });

  for (const node of fallbackGraph.nodes) {
    write({ type: "node", node });
  }

  write({
    type: "graph",
    graph: fallbackGraph,
    source: "fallback",
    warning: options.warning,
    validation_errors: options.validationErrors
  });
}

async function loadArchitectureSystemPrompt(requestData: GenerationRequest) {
  const template = await readFile(
    path.join(process.cwd(), "systemPrompt", "architec_gem.txt"),
    "utf8"
  );
  const idea = buildPromptIdea(requestData);

  if (template.includes("{{USER_IDEA}}")) {
    return template.replace("{{USER_IDEA}}", idea);
  }

  return `${template}\n\nUser idea:\n${idea}`;
}

function buildPromptIdea(requestData: GenerationRequest) {
  if (requestData.answers.length === 0) {
    return requestData.idea;
  }

  const answers = requestData.answers
    .map(
      (answer) =>
        `- ${answer.question}\n  Answer: ${answer.answer}`
    )
    .join("\n");

  return `${requestData.idea}\n\nClarification answers:\n${answers}`;
}

function extractNodeCandidates(text: string) {
  const nodesKeyIndex = text.indexOf('"nodes"');

  if (nodesKeyIndex < 0) {
    return [];
  }

  const arrayStart = text.indexOf("[", nodesKeyIndex);

  if (arrayStart < 0) {
    return [];
  }

  const candidates: unknown[] = [];
  let arrayDepth = 1;
  let objectDepth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;

  for (let index = arrayStart + 1; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "[") {
      arrayDepth += 1;
      continue;
    }

    if (char === "]") {
      arrayDepth -= 1;

      if (arrayDepth === 0) {
        break;
      }

      continue;
    }

    if (char === "{") {
      if (arrayDepth === 1 && objectDepth === 0) {
        objectStart = index;
      }

      objectDepth += 1;
      continue;
    }

    if (char === "}") {
      objectDepth -= 1;

      if (arrayDepth === 1 && objectDepth === 0 && objectStart >= 0) {
        const parsed = tryParseJson(text.slice(objectStart, index + 1));

        if (parsed.ok) {
          candidates.push(parsed.value);
        }

        objectStart = -1;
      }
    }
  }

  return candidates;
}

function parseGraphCandidate(
  candidate: unknown,
  idea: string
):
  | { success: true; graph: ArchitectureGraph; normalized: boolean }
  | { success: false; errors: string[] } {
  const graph = unwrapGraphCandidate(candidate);
  const parsed = architectureGraphSchema.safeParse(graph);

  if (parsed.success) {
    return { success: true, graph: parsed.data, normalized: false };
  }

  const normalized = normalizeArchitectureGraphCandidate(graph, idea);
  const normalizedParsed = architectureGraphSchema.safeParse(normalized);

  if (normalizedParsed.success) {
    return { success: true, graph: normalizedParsed.data, normalized: true };
  }

  return {
    success: false,
    errors: normalizedParsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "graph"}: ${issue.message}`
    )
  };
}

function unwrapGraphCandidate(candidate: unknown, depth = 0): unknown {
  if (depth > 5) {
    return candidate;
  }

  if (typeof candidate === "string") {
    const parsed = parseJsonString(candidate);
    return parsed === null ? candidate : unwrapGraphCandidate(parsed, depth + 1);
  }

  if (!isRecord(candidate)) {
    return candidate;
  }

  for (const key of [
    "graph_json",
    "architecture_graph_json",
    "architectureJson",
    "graph",
    "architecture_graph",
    "architecture",
    "blueprint",
    "result",
    "json",
    "content"
  ]) {
    if (candidate[key] !== undefined) {
      return unwrapGraphCandidate(candidate[key], depth + 1);
    }
  }

  return candidate;
}

function parseJsonString(value: string) {
  const normalized = stripMarkdownFence(value.trim());

  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    const extracted = extractJsonBlock(normalized);

    if (!extracted) {
      return null;
    }

    try {
      return JSON.parse(extracted) as unknown;
    } catch {
      return null;
    }
  }
}

function stripMarkdownFence(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonBlock(value: string) {
  const objectStart = value.indexOf("{");
  const arrayStart = value.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);

  if (starts.length === 0) {
    return null;
  }

  const start = Math.min(...starts);
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      stack.push("}");
      continue;
    }

    if (char === "[") {
      stack.push("]");
      continue;
    }

    if (char === "}" || char === "]") {
      if (stack.pop() !== char) {
        return null;
      }

      if (stack.length === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return null;
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return { ok: false };
  }
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Architecture generation model call failed.";
}