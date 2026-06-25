import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildDeterministicDesignReviewDialogue,
  validateDesignReviewDialogueCandidate
} from "./buildDesignReviewDialogue";
import { scoreArchitectureGraph } from "../scoring/scoreArchitecture";
import { validateArchitectureGraph } from "../validation/validateArchitecture";
import type { ArchitectureGraph } from "../../shared/types/graph";

test("deterministic research design review is bounded and evidence-specific", async () => {
  const graph = await loadExample("research-assistant.graph.json");
  const validation = validateArchitectureGraph(graph);
  const score = scoreArchitectureGraph(graph, validation);
  const dialogue = buildDeterministicDesignReviewDialogue({
    graph,
    validation,
    score
  });
  const text = [
    ...dialogue.turns.map((turn) => turn.text),
    ...dialogue.lessons.map((lesson) => lesson.text)
  ]
    .join(" ")
    .toLowerCase();

  assert.equal(dialogue.graph_id, graph.id);
  assert.equal(dialogue.source, "deterministic");
  assert.ok(dialogue.turns.length >= 6);
  assert.ok(dialogue.turns.length <= 10);
  assert.ok(dialogue.lessons.length >= 2);
  assert.deepEqual(
    [...new Set(dialogue.turns.map((turn) => turn.role))].sort(),
    ["builder", "mentor", "reviewer"]
  );
  assert.match(text, /citation verifier/);
  assert.match(text, /privacy|private|retention|sensitive/);
  assert.match(text, /control|approval|review/);
  assert.match(text, /cost|latency|waiting time/);
  assert.equal(
    validateDesignReviewDialogueCandidate(dialogue, { graph, validation }).success,
    true
  );
});

test("deterministic generic design review still validates", async () => {
  const graph = await loadExample("study-coach.graph.json");
  const validation = validateArchitectureGraph(graph);
  const score = scoreArchitectureGraph(graph, validation);
  const dialogue = buildDeterministicDesignReviewDialogue({
    graph,
    validation,
    score
  });

  assert.equal(
    validateDesignReviewDialogueCandidate(dialogue, { graph, validation }).success,
    true
  );
});

test("invalid design review output fails reference validation", async () => {
  const graph = await loadExample("research-assistant.graph.json");
  const validation = validateArchitectureGraph(graph);
  const score = scoreArchitectureGraph(graph, validation);
  const dialogue = buildDeterministicDesignReviewDialogue({
    graph,
    validation,
    score
  });
  const invalid = {
    dialogue: {
      ...dialogue,
      source: "model",
      turns: [
        {
          ...dialogue.turns[0],
          related_node_ids: ["missing-node"]
        },
        ...dialogue.turns.slice(1)
      ]
    }
  };
  const result = validateDesignReviewDialogueCandidate(invalid, {
    graph,
    validation
  });

  assert.equal(result.success, false);
  assert.ok(
    !result.success &&
      result.errors.some((error) => error.includes("unknown node missing-node"))
  );
});

test("model text references tolerate case, spaces, underscores, and hyphens", async () => {
  const graph = await loadExample("research-assistant.graph.json");
  const validation = validateArchitectureGraph(graph);
  const score = scoreArchitectureGraph(graph, validation);
  const dialogue = buildDeterministicDesignReviewDialogue({
    graph,
    validation,
    score
  });
  const variant = {
    dialogue: {
      ...dialogue,
      source: "model",
      turns: dialogue.turns.map((turn) => ({
        ...turn,
        text: turn.text.replaceAll("Citation Verifier", "citation_verifier")
      })),
      lessons: dialogue.lessons.map((lesson) => ({
        ...lesson,
        text: lesson.text.replaceAll("citation checks", "citation-checks")
      }))
    }
  };
  const result = validateDesignReviewDialogueCandidate(variant, {
    graph,
    validation
  });

  assert.equal(result.success, true);
});
test("malformed design review output fails schema validation", async () => {
  const graph = await loadExample("research-assistant.graph.json");
  const validation = validateArchitectureGraph(graph);
  const score = scoreArchitectureGraph(graph, validation);
  const dialogue = buildDeterministicDesignReviewDialogue({
    graph,
    validation,
    score
  });
  const invalid = {
    ...dialogue,
    source: "model",
    turns: dialogue.turns.map((turn) => ({
      ...turn,
      text: `${turn.text} Curtain rises for a dramatic pause.`
    }))
  };
  const result = validateDesignReviewDialogueCandidate(invalid, {
    graph,
    validation
  });

  assert.equal(result.success, false);
});

async function loadExample(fileName: string): Promise<ArchitectureGraph> {
  const url = new URL(`../../examples/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8")) as ArchitectureGraph;
}
