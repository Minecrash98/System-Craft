import assert from "node:assert/strict";
import test from "node:test";

import researchGraphJson from "../../examples/research-assistant.graph.json";
import studyCoachGraphJson from "../../examples/study-coach.graph.json";
import supportTriageGraphJson from "../../examples/support-triage.graph.json";
import { scoreArchitectureGraph } from "@/lib/scoring/scoreArchitecture";
import {
  makeBrokenEdgeFixture,
  makeHighCostLatencyFixture,
  makeHighRiskWithoutReviewFixture,
  makeLlmWithoutPromptFixture,
  makeMissingCitationVerifierFixture,
  makeMissingRetrievalFixture,
  makeNoUncertaintyBehaviorFixture,
  makeSensitiveMemoryWithoutRetentionFixture,
  makeToolWithoutPermissionFixture,
  makeUnclearOutputFormatFixture
} from "@/lib/validation/validationFixtures";
import { validateArchitectureGraph } from "@/lib/validation/validateArchitecture";
import type { ArchitectureGraph, ArchitectureNode } from "@/shared/types/graph";
import type { ValidationIssue } from "@/shared/types/validation";

const researchGraph = researchGraphJson as ArchitectureGraph;
const studyCoachGraph = studyCoachGraphJson as ArchitectureGraph;
const supportTriageGraph = supportTriageGraphJson as ArchitectureGraph;

test("structure rules catch missing inputs, outputs, broken edges, and isolated nodes", () => {
  assertIssue(withoutNodes(researchGraph, (node) => node.type === "input"), {
    ruleId: "missing-input-node",
    severity: "critical"
  });
  assertIssue(withoutNodes(researchGraph, (node) => node.type === "output"), {
    ruleId: "missing-output-node",
    severity: "critical"
  });
  assertIssue(makeBrokenEdgeFixture(researchGraph), {
    ruleId: "broken-edge-reference",
    severity: "critical",
    affectedNodeIds: ["document_upload"]
  });
  assertIssue(withIsolatedLogger(researchGraph), {
    ruleId: "isolated-node",
    severity: "error",
    affectedNodeIds: ["fixture_isolated_logger"]
  });
});

test("model and grounding rules catch missing prompt and retrieval support", () => {
  assertIssue(makeLlmWithoutPromptFixture(researchGraph), {
    ruleId: "llm-without-prompt",
    severity: "error",
    affectedNodeIds: ["answer_generator"]
  });
  assertIssue(makeMissingRetrievalFixture(researchGraph), {
    ruleId: "knowledge-task-without-retrieval",
    severity: "error"
  });
});

test("citation and high-risk review rules protect the primary judge story", () => {
  assertIssue(makeMissingCitationVerifierFixture(researchGraph), {
    ruleId: "citation-task-without-verifier",
    severity: "critical"
  });
  assertIssue(makeHighRiskWithoutReviewFixture(researchGraph), {
    ruleId: "high-risk-output-without-human-review",
    severity: "critical",
    affectedNodeIds: ["final_answer"]
  });
  assertIssue(withLlmDirectToOutput(researchGraph), {
    ruleId: "high-risk-llm-direct-to-output",
    severity: "critical",
    affectedNodeIds: ["answer_generator", "final_answer"]
  });
});

test("tool, memory, cost, output, and uncertainty rules stay covered", () => {
  assertIssue(makeToolWithoutPermissionFixture(supportTriageGraph), {
    ruleId: "tool-without-permission-gate",
    severity: "error",
    affectedNodeIds: ["tool_permission_gate"]
  });
  assertIssue(makeSensitiveMemoryWithoutRetentionFixture(studyCoachGraph), {
    ruleId: "sensitive-memory-without-retention-controls",
    severity: "critical",
    affectedNodeIds: ["progress_memory"]
  });
  assertIssue(makeHighCostLatencyFixture(researchGraph), {
    ruleId: "excessive-estimated-cost",
    severity: "warning"
  });
  assertIssue(makeHighCostLatencyFixture(researchGraph), {
    ruleId: "high-latency-path",
    severity: "warning"
  });
  assertIssue(makeUnclearOutputFormatFixture(researchGraph), {
    ruleId: "unclear-output-format",
    severity: "error",
    affectedNodeIds: ["final_answer"]
  });
  assertIssue(makeNoUncertaintyBehaviorFixture(researchGraph), {
    ruleId: "no-uncertainty-behavior",
    severity: "warning"
  });
});

test("score improvements reference demo-critical validation issues", () => {
  assertScoreReferencesIssue(
    makeMissingCitationVerifierFixture(researchGraph),
    "citation-task-without-verifier"
  );
  assertScoreReferencesIssue(
    makeHighRiskWithoutReviewFixture(researchGraph),
    "high-risk-output-without-human-review"
  );
});

function assertIssue(
  graph: ArchitectureGraph,
  expected: {
    ruleId: string;
    severity: ValidationIssue["severity"];
    affectedNodeIds?: string[];
  }
) {
  const issue = findIssue(graph, expected.ruleId);

  assert.equal(
    issue.severity,
    expected.severity,
    `${expected.ruleId} should have severity ${expected.severity}`
  );

  if (expected.affectedNodeIds) {
    assert.deepEqual(
      issue.affected_node_ids,
      expected.affectedNodeIds,
      `${expected.ruleId} should point at the expected nodes`
    );
  }
}

function assertScoreReferencesIssue(graph: ArchitectureGraph, ruleId: string) {
  const validation = validateArchitectureGraph(graph);
  const issue = validation.issues.find((candidate) => candidate.rule_id === ruleId);

  assert.ok(issue, `${ruleId} should be present before scoring`);

  const score = scoreArchitectureGraph(graph, validation);
  const improvementReasons = score.dimensions.flatMap(
    (dimension) => dimension.improvements
  );

  assert.equal(score.issues_considered.some((candidate) => candidate.id === issue.id), true);
  assert.equal(
    improvementReasons.some((reason) =>
      reason.related_issue_ids?.includes(issue.id)
    ),
    true,
    `score improvements should reference ${ruleId}`
  );
}

function findIssue(graph: ArchitectureGraph, ruleId: string) {
  const issue = validateArchitectureGraph(graph).issues.find(
    (candidate) => candidate.rule_id === ruleId
  );

  assert.ok(issue, `${ruleId} should be reported`);
  return issue;
}

function withoutNodes(
  graph: ArchitectureGraph,
  predicate: (node: ArchitectureNode) => boolean
): ArchitectureGraph {
  const next = cloneGraph(graph);
  const removedIds = new Set(
    next.nodes.filter(predicate).map((node) => node.id)
  );

  next.nodes = next.nodes.filter((node) => !removedIds.has(node.id));
  next.edges = next.edges.filter(
    (edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target)
  );

  return next;
}

function withIsolatedLogger(graph: ArchitectureGraph): ArchitectureGraph {
  const next = cloneGraph(graph);

  next.nodes.push({
    id: "fixture_isolated_logger",
    type: "logger",
    name: "Isolated Logger",
    description: "Records debug events but is not connected to the architecture.",
    inputs: [],
    outputs: [],
    config: {},
    risks: [
      {
        risk_type: "dead_component",
        severity: "warning",
        description: "A disconnected logger can confuse implementation scope.",
        mitigation: "Connect it to the flow or remove it."
      }
    ],
    cost_estimate: { relative: "low", notes: "Small storage cost." },
    latency_estimate: { relative: "none", notes: "No user-facing latency." },
    alternatives: [
      {
        name: "Use platform logs",
        tradeoff: "Less custom behavior but simpler MVP scope."
      }
    ],
    explanation_for_beginner:
      "This fixture node is intentionally disconnected so the structure rule has something to catch."
  });

  return next;
}

function withLlmDirectToOutput(graph: ArchitectureGraph): ArchitectureGraph {
  const keepIds = new Set(["user_question", "grounded_prompt", "answer_generator", "final_answer"]);
  const next = cloneGraph(graph);

  next.nodes = next.nodes.filter((node) => keepIds.has(node.id));
  next.edges = [
    {
      id: "fixture_question_prompt",
      source: "user_question",
      target: "grounded_prompt",
      kind: "data_flow",
      label: "question",
      data_contract: "text"
    },
    {
      id: "fixture_prompt_llm",
      source: "grounded_prompt",
      target: "answer_generator",
      kind: "data_flow",
      label: "prompt",
      data_contract: "prompt"
    },
    {
      id: "fixture_llm_output",
      source: "answer_generator",
      target: "final_answer",
      kind: "data_flow",
      label: "draft answer",
      data_contract: "markdown"
    }
  ];
  next.task_profile.risk_level = "high";
  next.task_profile.requires_human_review = true;

  return next;
}

function cloneGraph(graph: ArchitectureGraph): ArchitectureGraph {
  return JSON.parse(JSON.stringify(graph)) as ArchitectureGraph;
}
