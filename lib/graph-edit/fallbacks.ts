import type {
  GraphEditPatch,
  NodeAddFallbackInput,
  NodeEditFallbackInput
} from "./types";
import type { ArchitectureGraph, ArchitectureNode } from "@/shared/types/graph";

export function buildNodeAddFallbackPatch({
  graph,
  userRequest,
  preferredAnchorNodeIds = []
}: NodeAddFallbackInput): GraphEditPatch {
  const warnings: string[] = [];
  const requestedRole = inferRequestedRole(userRequest);
  const duplicate = findEquivalentExistingNode(graph, requestedRole, userRequest);
  const [upstreamAnchor, downstreamAnchor] = preferredAnchorNodeIds;

  if (duplicate) {
    warnings.push(
      `The requested ${requestedRole.label} appears duplicative because the existing node ${duplicate.id} already covers an equivalent role.`
    );
  }

  if (upstreamAnchor && !hasNode(graph, upstreamAnchor)) {
    warnings.push(`The preferred upstream anchor ${upstreamAnchor} was not found in graph.nodes.`);
  }

  if (downstreamAnchor && !hasNode(graph, downstreamAnchor)) {
    warnings.push(`The preferred downstream anchor ${downstreamAnchor} was not found in graph.nodes.`);
  }

  if (duplicate) {
    warnings.push(
      `Confirm whether you want to reuse ${duplicate.id}, rename it, or add a separate ${requestedRole.label} despite the existing one.`
    );
  } else {
    warnings.push(
      "No deterministic add-node fallback was applied because creating a complete connected node would require model output or explicit manual fields."
    );
  }

  return {
    graph_id: graph.id,
    version: graph.version,
    mode: "add_node",
    summary: duplicate
      ? `No new ${requestedRole.label} was added because the graph already has ${duplicate.name}.`
      : `No new ${requestedRole.label} was added because the fallback could not safely infer a complete node.`,
    operations: [],
    warnings: uniqueStrings(warnings),
    requires_user_confirmation: true
  };
}

export function buildNodeEditFallbackPatch({
  graph,
  selectedNodeId,
  userRequest
}: NodeEditFallbackInput): GraphEditPatch {
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const possibleTarget = selectedNode
    ? null
    : findLikelyReplacementTarget(graph, selectedNodeId, userRequest);
  const warnings = selectedNode
    ? [
        `No deterministic edit fallback was applied to ${selectedNode.id}; model output or explicit field-level edits are required to avoid overwriting useful node details.`
      ]
    : [
        `The selected_node_id ${selectedNodeId} does not exist in the input graph, so no node update was generated.`,
        possibleTarget
          ? `The graph contains a ${possibleTarget.id} node, but mode edit_node only allows updating the explicitly selected node and does not allow guessing a replacement target.`
          : "No safe replacement target was inferred from the graph."
      ];

  return {
    graph_id: graph.id,
    version: graph.version,
    mode: "edit_node",
    summary: selectedNode
      ? `No deterministic edit was applied to ${selectedNode.name}.`
      : `Cannot edit ${selectedNodeId} because the selected node does not exist.`,
    operations: [],
    warnings,
    requires_user_confirmation: true
  };
}

function inferRequestedRole(userRequest: string) {
  const normalized = normalizeText(userRequest);

  if (matchesAny(normalized, ["privacy", "pii", "redaction", "redact"])) {
    return { label: "privacy filter", nodeType: "privacy_filter" };
  }

  if (matchesAny(normalized, ["citation", "verifier", "verify"])) {
    return { label: "citation verifier", nodeType: "evaluator" };
  }

  if (matchesAny(normalized, ["permission", "approval", "gate"])) {
    return { label: "permission gate", nodeType: "human_review" };
  }

  if (matchesAny(normalized, ["memory", "retention", "personalization"])) {
    return { label: "memory boundary", nodeType: "memory" };
  }

  return { label: "node", nodeType: null };
}

function findEquivalentExistingNode(
  graph: ArchitectureGraph,
  requestedRole: ReturnType<typeof inferRequestedRole>,
  userRequest: string
) {
  const requestText = normalizeText(userRequest);

  return graph.nodes.find((node) => {
    const text = nodeSearchText(node);

    if (requestedRole.nodeType && node.type === requestedRole.nodeType) {
      return true;
    }

    if (requestedRole.label === "privacy filter") {
      return matchesAny(text, ["privacy", "pii", "redaction", "redact", "minimize"]);
    }

    if (requestedRole.label === "citation verifier") {
      return matchesAny(text, ["citation", "verify", "verifier", "claim"]);
    }

    return requestText.length > 0 && text.includes(requestText);
  });
}

function findLikelyReplacementTarget(
  graph: ArchitectureGraph,
  selectedNodeId: string,
  userRequest: string
) {
  const selectedText = normalizeText(selectedNodeId);
  const requestText = normalizeText(userRequest);

  if (matchesAny(selectedText, ["citation", "verifier"]) || requestText.includes("citation")) {
    return graph.nodes.find(
      (node) =>
        node.type === "evaluator" &&
        matchesAny(nodeSearchText(node), ["verifier", "evaluator", "policy", "citation"])
    );
  }

  if (matchesAny(selectedText, ["privacy", "pii", "redaction"])) {
    return graph.nodes.find((node) => node.type === "privacy_filter");
  }

  return graph.nodes.find((node) => requestText.includes(normalizeText(node.id)));
}

function hasNode(graph: ArchitectureGraph, nodeId: string) {
  return graph.nodes.some((node) => node.id === nodeId);
}

function nodeSearchText(node: ArchitectureNode) {
  return normalizeText(
    JSON.stringify({
      id: node.id,
      type: node.type,
      name: node.name,
      description: node.description,
      config: node.config,
      risks: node.risks,
      explanation_for_beginner: node.explanation_for_beginner
    })
  );
}

function matchesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(normalizeText(needle)));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}
