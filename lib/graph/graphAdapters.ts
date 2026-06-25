import { MarkerType, type Edge, type Node } from "@xyflow/react";

import {
  getNodePosition,
  type GraphLayoutDirection
} from "@/lib/graph/layout";
import type {
  ArchitectureEdge,
  ArchitectureGraph,
  ArchitectureNode,
  EdgeType
} from "@/shared/types/graph";
import type { ValidationIssue } from "@/shared/types/validation";

export interface SystemNodeData extends Record<string, unknown> {
  architectureNode: ArchitectureNode;
  incomingCount: number;
  outgoingCount: number;
  layoutDirection: GraphLayoutDirection;
  validationIssues: ValidationIssue[];
  onSelectNode: (nodeId: string) => void;
}

export interface SystemEdgeData extends Record<string, unknown> {
  architectureEdge: ArchitectureEdge;
}

export type SystemFlowNode = Node<SystemNodeData, "systemNode">;
export type SystemFlowEdge = Edge<SystemEdgeData>;

export interface GraphAdapterResult {
  nodes: SystemFlowNode[];
  edges: SystemFlowEdge[];
  missingEdgeReferences: ArchitectureEdge[];
}

const edgeStyles: Record<EdgeType, { color: string; dash?: string }> = {
  data_flow: { color: "#2563eb" },
  control_flow: { color: "#7c3aed", dash: "6 4" },
  review_flow: { color: "#b45309" },
  fallback_flow: { color: "#dc2626", dash: "4 4" }
};

export function toReactFlowGraph(
  graph: ArchitectureGraph,
  selectedNodeId?: string | null,
  direction: GraphLayoutDirection = "horizontal",
  validationIssues: ValidationIssue[] = [],
  onSelectNode: (nodeId: string) => void = () => undefined,
  positionScale = 1,
  focusNodeIds: string[] | null = null
): GraphAdapterResult {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const reviewFocusNodeIds = getReviewFocusNodeIds(graph, focusNodeIds);
  const renderedNodeIds = reviewFocusNodeIds ?? nodeIds;
  const renderedEdges = graph.edges.filter(
    (edge) => renderedNodeIds.has(edge.source) && renderedNodeIds.has(edge.target)
  );
  const incomingCounts = countEdgeEnds(renderedEdges, "target");
  const outgoingCounts = countEdgeEnds(renderedEdges, "source");
  const issuesByNodeId = groupIssuesByNode(validationIssues);
  const focusedNodeIds = reviewFocusNodeIds ?? new Set<string>();
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  const nodes: SystemFlowNode[] = graph.nodes
    .filter((node) => renderedNodeIds.has(node.id))
    .map((architectureNode, index) => {
      const position = getNodePosition(architectureNode, index, direction);

      return {
        id: architectureNode.id,
        type: "systemNode",
        position: {
          x: position.x * positionScale,
          y: position.y * positionScale
        },
        selected:
          architectureNode.id === selectedNodeId ||
          focusedNodeIds.has(architectureNode.id),
        data: {
          architectureNode,
          incomingCount: incomingCounts.get(architectureNode.id) ?? 0,
          outgoingCount: outgoingCounts.get(architectureNode.id) ?? 0,
          layoutDirection: direction,
          validationIssues: issuesByNodeId.get(architectureNode.id) ?? [],
          onSelectNode
        }
      };
    });

  const missingEdgeReferences = graph.edges.filter(
    (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
  );

  const edges: SystemFlowEdge[] = renderedEdges
    .map((architectureEdge) => {
      const style = edgeStyles[architectureEdge.kind];
      const isFocusedEdge = Boolean(
        reviewFocusNodeIds &&
          reviewFocusNodeIds.has(architectureEdge.source) &&
          reviewFocusNodeIds.has(architectureEdge.target)
      );
      const isSelectedEdge = Boolean(
        isFocusedEdge ||
          (selectedNodeId &&
            (architectureEdge.source === selectedNodeId ||
              architectureEdge.target === selectedNodeId))
      );
      const isOutgoingSelectedEdge = Boolean(
        selectedNodeId && architectureEdge.source === selectedNodeId
      );
      const touchesHumanReview =
        nodesById.get(architectureEdge.source)?.type === "human_review" ||
        nodesById.get(architectureEdge.target)?.type === "human_review";
      const isReviewEdge = architectureEdge.kind === "review_flow" || touchesHumanReview;
      const selectedColor = isReviewEdge
        ? "#f59e0b"
        : isOutgoingSelectedEdge
          ? "#aef7dc"
          : "#7f9cff";
      const edgeColor = isSelectedEdge ? selectedColor : style.color;

      return {
        id: architectureEdge.id,
        source: architectureEdge.source,
        target: architectureEdge.target,
        type: "smoothstep",
        label: architectureEdge.label,
        animated:
          isSelectedEdge ||
          architectureEdge.kind === "review_flow" ||
          architectureEdge.kind === "fallback_flow",
        className: isSelectedEdge
          ? `architecture-flow-edge-selected ${
              isOutgoingSelectedEdge
                ? "architecture-flow-edge-outgoing"
                : "architecture-flow-edge-incoming"
            }${isReviewEdge ? " architecture-flow-edge-review" : ""}`
          : undefined,
        data: { architectureEdge },
        style: {
          stroke: edgeColor,
          strokeWidth: isSelectedEdge ? 3.4 : 2,
          strokeDasharray: isSelectedEdge ? "10 8" : style.dash
        },
        labelStyle: {
          fill: isSelectedEdge ? "#f8fbff" : "#334155",
          fontSize: 11,
          fontWeight: 700
        },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 4,
        labelBgStyle: {
          fill: isSelectedEdge ? "#11152d" : "#ffffff",
          fillOpacity: isSelectedEdge ? 0.92 : 0.88
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor,
          width: isSelectedEdge ? 24 : 18,
          height: isSelectedEdge ? 24 : 18
        }
      };
    });

  return { nodes, edges, missingEdgeReferences };
}

function getReviewFocusNodeIds(
  graph: ArchitectureGraph,
  focusNodeIds: string[] | null
) {
  if (!focusNodeIds || focusNodeIds.length === 0) {
    return null;
  }

  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  const candidateIds = [...new Set(focusNodeIds)].filter((nodeId) =>
    graphNodeIds.has(nodeId)
  );
  const mainNodeId = candidateIds[0];

  if (!mainNodeId) {
    return null;
  }

  const discussedNodeIds = new Set(candidateIds);
  const visibleNodeIds = new Set<string>([mainNodeId]);

  for (const edge of graph.edges) {
    if (edge.source === mainNodeId && discussedNodeIds.has(edge.target)) {
      visibleNodeIds.add(edge.target);
    }

    if (edge.target === mainNodeId && discussedNodeIds.has(edge.source)) {
      visibleNodeIds.add(edge.source);
    }
  }

  return visibleNodeIds;
}

function countEdgeEnds(
  edges: ArchitectureEdge[],
  end: "source" | "target"
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const edge of edges) {
    counts.set(edge[end], (counts.get(edge[end]) ?? 0) + 1);
  }

  return counts;
}

function groupIssuesByNode(issues: ValidationIssue[]) {
  const grouped = new Map<string, ValidationIssue[]>();

  for (const issue of issues) {
    for (const nodeId of issue.affected_node_ids) {
      grouped.set(nodeId, [...(grouped.get(nodeId) ?? []), issue]);
    }
  }

  return grouped;
}
