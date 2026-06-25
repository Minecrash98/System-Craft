import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildDeterministicNarrationScript,
  validateNarrationScriptCandidate
} from "./buildNarrationScript";
import { scoreArchitectureGraph } from "../scoring/scoreArchitecture";
import { validateArchitectureGraph } from "../validation/validateArchitecture";
import type { ArchitectureGraph } from "../../shared/types/graph";

test("deterministic research narration is bounded and graph-specific", async () => {
  const graph = await loadExample("research-assistant.graph.json");
  const validation = validateArchitectureGraph(graph);
  const score = scoreArchitectureGraph(graph, validation);
  const script = buildDeterministicNarrationScript({ graph, validation, score });
  const text = script.segments.map((segment) => segment.text).join(" ").toLowerCase();

  assert.equal(script.graph_id, graph.id);
  assert.equal(script.source, "deterministic");
  assert.ok(script.target_duration_seconds <= 90);
  assert.ok(script.segments.length >= 5);
  assert.ok(script.segments.length <= 8);
  assert.match(text, /retrieval|ground/);
  assert.match(text, /citation/);
  assert.match(text, /human review|reviewer|manual review/);
  assert.match(text, /privacy|private|retention|sensitive/);
  assert.match(text, /cost|latency|waiting time/);
  assert.match(text, /reliability|verify|verification|fallback/);
  assert.equal(
    validateNarrationScriptCandidate(script, { graph, validation }).success,
    true
  );
});

test("deterministic generic narration still validates", async () => {
  const graph = await loadExample("study-coach.graph.json");
  const validation = validateArchitectureGraph(graph);
  const score = scoreArchitectureGraph(graph, validation);
  const script = buildDeterministicNarrationScript({ graph, validation, score });

  assert.ok(script.target_duration_seconds <= 90);
  assert.equal(
    validateNarrationScriptCandidate(script, { graph, validation }).success,
    true
  );
});

test("invalid model output fails reference validation", async () => {
  const graph = await loadExample("research-assistant.graph.json");
  const validation = validateArchitectureGraph(graph);
  const score = scoreArchitectureGraph(graph, validation);
  const script = buildDeterministicNarrationScript({ graph, validation, score });
  const invalid = {
    script: {
      ...script,
      source: "model",
      segments: [
        {
          ...script.segments[0],
          related_node_ids: ["missing-node"]
        },
        ...script.segments.slice(1)
      ]
    }
  };
  const result = validateNarrationScriptCandidate(invalid, { graph, validation });

  assert.equal(result.success, false);
  assert.ok(
    !result.success &&
      result.errors.some((error) => error.includes("unknown node missing-node"))
  );
});

test("oversized scripts fail schema validation", async () => {
  const graph = await loadExample("research-assistant.graph.json");
  const validation = validateArchitectureGraph(graph);
  const score = scoreArchitectureGraph(graph, validation);
  const script = buildDeterministicNarrationScript({ graph, validation, score });
  const invalid = {
    ...script,
    source: "model",
    target_duration_seconds: 91,
    segments: script.segments.map((segment) => ({
      ...segment,
      target_duration_seconds: 13
    }))
  };
  const result = validateNarrationScriptCandidate(invalid, { graph, validation });

  assert.equal(result.success, false);
});

async function loadExample(fileName: string): Promise<ArchitectureGraph> {
  const url = new URL(`../../examples/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8")) as ArchitectureGraph;
}
