import type { ArchitectureGraph, ArchitectureNode } from "@/shared/types/graph";
import type { DemoTrace, DemoTraceStatus, DemoTraceStep } from "@/shared/types/demo";

interface StepBuildContext {
  graph: ArchitectureGraph;
  node: ArchitectureNode;
  task: string;
  citationRiskActive: boolean;
  guardNodeId: string | null;
  unsupportedClaimCaught: boolean;
}

export function simulateArchitectureRun(
  graph: ArchitectureGraph,
  task = defaultTaskForGraph(graph)
): DemoTrace {
  const orderedNodes = orderNodesForTrace(graph);
  const citationRiskActive = isCitationOrResearchTask(graph);
  const guardNodeId = citationRiskActive ? findCitationGuardNodeId(graph) : null;
  const steps: DemoTraceStep[] = [];
  let unsupportedClaimCaught = false;

  for (const node of orderedNodes) {
    const step = buildTraceStep({
      graph,
      node,
      task,
      citationRiskActive,
      guardNodeId,
      unsupportedClaimCaught
    });

    steps.push(step);

    if (node.id === guardNodeId) {
      unsupportedClaimCaught = true;
    }
  }

  return {
    graph_id: graph.id,
    task,
    simulated: true,
    steps,
    final_output_preview: buildFinalPreview(graph, unsupportedClaimCaught),
    naive_comparison: graph.naive_baseline
      ? {
          summary: graph.naive_baseline.summary,
          failure_observed: citationRiskActive
            ? "The naive path would present a plausible citation before checking whether the retrieved sources support the claim."
            : graph.naive_baseline.failure_modes[0]
        }
      : undefined
  };
}

function buildTraceStep({
  graph,
  node,
  task,
  citationRiskActive,
  guardNodeId,
  unsupportedClaimCaught
}: StepBuildContext): DemoTraceStep {
  const isGuardNode = node.id === guardNodeId;
  const baseInput = inputSummaryForNode(node, task);
  const baseOutput = outputSummaryForNode(node, graph, task);
  const status = statusForNode(node, isGuardNode);

  if (citationRiskActive && node.type === "llm" && !unsupportedClaimCaught) {
    return {
      id: `step-${node.id}`,
      node_id: node.id,
      node_name: node.name,
      input_summary: baseInput,
      output_summary:
        "Draft answer includes supported evidence plus one simulated unsupported claim: a citation that looks plausible but is not backed by the retrieved passages.",
      status: "simulated",
      risk_note: "This is the hallucination moment the improved architecture is designed to catch.",
      mitigation_note:
        guardNodeId === null
          ? "Add a verifier or review gate before final output."
          : `Route the draft through ${nodeName(graph, guardNodeId)} before final output.`
    };
  }

  if (citationRiskActive && isGuardNode) {
    return {
      id: `step-${node.id}`,
      node_id: node.id,
      node_name: node.name,
      input_summary: baseInput,
      output_summary:
        "Simulated check finds the unsupported citation claim and blocks it from moving forward as-is.",
      status: node.type === "human_review" ? "needs_review" : "blocked",
      risk_note: "Unsupported claims can look polished even when no source passage supports them.",
      mitigation_note:
        node.type === "human_review"
          ? "Reviewer removes the unsupported claim or asks for stronger evidence before approving."
          : "Verifier marks the claim unsupported and sends the draft to review or revision."
    };
  }

  if (citationRiskActive && node.type === "human_review" && unsupportedClaimCaught) {
    return {
      id: `step-${node.id}`,
      node_id: node.id,
      node_name: node.name,
      input_summary: "Verification report with an unsupported claim warning.",
      output_summary:
        "Reviewer approves a revised answer only after the unsupported claim is removed or labeled uncertain.",
      status: "needs_review",
      mitigation_note:
        "Human review keeps high-trust research output from relying only on an automated checker."
    };
  }

  if (citationRiskActive && node.type === "output" && unsupportedClaimCaught) {
    return {
      id: `step-${node.id}`,
      node_id: node.id,
      node_name: node.name,
      input_summary: "Reviewed answer with verification notes.",
      output_summary:
        "Final response shows only supported claims, visible citations, and an uncertainty note for missing evidence.",
      status: "passed",
      mitigation_note:
        "The simulated unsupported claim never reaches the final answer."
    };
  }

  return {
    id: `step-${node.id}`,
    node_id: node.id,
    node_name: node.name,
    input_summary: baseInput,
    output_summary: baseOutput,
    status,
    risk_note: riskNoteForNode(node),
    mitigation_note: mitigationNoteForNode(node)
  };
}

function orderNodesForTrace(graph: ArchitectureGraph) {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const nodeIndex = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }

    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }

  const queue = graph.nodes
    .filter((node) => indegree.get(node.id) === 0)
    .sort((left, right) => (nodeIndex.get(left.id) ?? 0) - (nodeIndex.get(right.id) ?? 0));
  const ordered: ArchitectureNode[] = [];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const node = queue.shift();

    if (!node || seen.has(node.id)) {
      continue;
    }

    seen.add(node.id);
    ordered.push(node);

    const targets = (outgoing.get(node.id) ?? [])
      .map((targetId) => graph.nodes.find((candidate) => candidate.id === targetId))
      .filter((candidate): candidate is ArchitectureNode => Boolean(candidate))
      .sort(
        (left, right) => (nodeIndex.get(left.id) ?? 0) - (nodeIndex.get(right.id) ?? 0)
      );

    for (const target of targets) {
      const nextIndegree = (indegree.get(target.id) ?? 0) - 1;
      indegree.set(target.id, nextIndegree);

      if (nextIndegree === 0) {
        queue.push(target);
      }
    }
  }

  return [
    ...ordered,
    ...graph.nodes.filter((node) => !seen.has(node.id))
  ];
}

function inputSummaryForNode(node: ArchitectureNode, task: string) {
  if (node.type === "input") {
    return `Sample task enters here: "${task}"`;
  }

  if (node.inputs.length === 0) {
    return "Receives the current simulated state from earlier graph steps.";
  }

  return `Receives ${formatPorts(node.inputs)}.`;
}

function outputSummaryForNode(
  node: ArchitectureNode,
  graph: ArchitectureGraph,
  task: string
) {
  switch (node.type) {
    case "input":
      return `Captures user-provided data needed for "${task}".`;
    case "transform":
      return `Produces ${formatPorts(node.outputs, "clean intermediate data")} for the next component.`;
    case "knowledge_base":
      return "Makes approved source material searchable with visible storage assumptions.";
    case "retrieval":
      return "Returns a simulated set of relevant context snippets with source metadata and confidence notes.";
    case "prompt":
      return "Builds task instructions, output format rules, and uncertainty behavior for the model.";
    case "llm":
      return "Drafts a response using the available context and prompt constraints.";
    case "evaluator":
      return "Checks the draft for the graph's stated risk, quality, or policy criteria.";
    case "human_review":
      return "Asks a person to approve, edit, or escalate the simulated result before trust-sensitive output.";
    case "output":
      return `Shows the user-facing ${formatPorts(node.outputs, "result")} for ${graph.title}.`;
    case "tool":
      return "Simulates a constrained tool result without making any real external call.";
    case "memory":
      return "Updates only the simulated memory state described by this graph.";
    case "privacy_filter":
      return "Removes or minimizes sensitive fields before they continue through the trace.";
    case "classifier":
    case "router":
      return "Chooses the next simulated path according to the component's configuration.";
    case "fallback":
      return "Provides a safe alternative path when the primary step cannot continue confidently.";
    case "logger":
      return "Records simulated metadata for debugging without claiming production observability.";
  }
}

function statusForNode(
  node: ArchitectureNode,
  isGuardNode: boolean
): DemoTraceStatus {
  if (isGuardNode) {
    return node.type === "human_review" ? "needs_review" : "blocked";
  }

  if (node.type === "human_review") {
    return "needs_review";
  }

  if (node.type === "llm" || node.type === "tool" || node.type === "memory") {
    return "simulated";
  }

  return "passed";
}

function riskNoteForNode(node: ArchitectureNode) {
  const highestRisk = node.risks[0];
  return highestRisk ? highestRisk.description : undefined;
}

function mitigationNoteForNode(node: ArchitectureNode) {
  const highestRisk = node.risks[0];
  return highestRisk ? highestRisk.mitigation : undefined;
}

function findCitationGuardNodeId(graph: ArchitectureGraph) {
  const evaluator = graph.nodes.find((node) => {
    const text = textOf(node);
    return (
      node.type === "evaluator" &&
      matchesAny(text, ["citation", "source", "claim", "support"]) &&
      matchesAny(text, ["verify", "verifier", "alignment", "check"])
    );
  });

  if (evaluator) {
    return evaluator.id;
  }

  return graph.nodes.find((node) => node.type === "human_review")?.id ?? null;
}

function buildFinalPreview(graph: ArchitectureGraph, unsupportedClaimCaught: boolean) {
  if (isCitationOrResearchTask(graph) && unsupportedClaimCaught) {
    return "Simulated final output: the answer keeps supported claims, removes the unsupported citation claim, and shows citations plus an uncertainty note before final review.";
  }

  const output = graph.nodes.find((node) => node.type === "output");

  if (output) {
    return `Simulated final output: ${output.description}`;
  }

  return "Simulated final output: the trace completes, but this graph should add a clearer output node before implementation.";
}

function defaultTaskForGraph(graph: ArchitectureGraph) {
  const text = `${graph.id} ${graph.title} ${graph.user_idea} ${graph.task_profile.task_type}`.toLowerCase();

  if (matchesAny(text, ["research", "paper", "citation", "cite"])) {
    return "Summarize the evidence for the main finding and include verified citations.";
  }

  if (matchesAny(text, ["study", "student", "quiz", "revision"])) {
    return "Create a weekly revision plan and a short quiz from the student's course notes.";
  }

  if (matchesAny(text, ["support", "customer", "billing", "policy"])) {
    return "Draft a support reply for a billing question that may need escalation.";
  }

  return `Run a representative ${graph.task_profile.task_type.replaceAll("_", " ")} request through the architecture.`;
}

function isCitationOrResearchTask(graph: ArchitectureGraph) {
  const text = `${graph.id} ${graph.title} ${graph.user_idea} ${graph.task_profile.task_type}`.toLowerCase();

  return Boolean(graph.task_profile.requires_citations) || matchesAny(text, [
    "research",
    "paper",
    "citation",
    "cite"
  ]);
}

function nodeName(graph: ArchitectureGraph, nodeId: string) {
  return graph.nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
}

function formatPorts(ports: ArchitectureNode["inputs"], fallback = "data") {
  if (ports.length === 0) {
    return fallback;
  }

  return ports.map((port) => port.name.replaceAll("_", " ")).join(", ");
}

function textOf(node: ArchitectureNode) {
  return JSON.stringify({
    name: node.name,
    description: node.description,
    inputs: node.inputs,
    outputs: node.outputs,
    config: node.config,
    risks: node.risks,
    alternatives: node.alternatives,
    explanation_for_beginner: node.explanation_for_beginner
  }).toLowerCase();
}

function matchesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}
