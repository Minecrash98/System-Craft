"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useNodesState,
  type OnNodeDrag
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SystemNodeCard } from "@/components/graph/SystemNodeCard";
import { toReactFlowGraph, type SystemFlowNode } from "@/lib/graph/graphAdapters";
import type { GraphLayoutDirection } from "@/lib/graph/layout";
import type { ArchitectureGraph } from "@/shared/types/graph";
import type { ValidationIssue } from "@/shared/types/validation";

const nodeTypes = {
  systemNode: SystemNodeCard
};

type NodePosition = { x: number; y: number };
type NodePositionMap = Record<string, NodePosition>;

interface GraphCanvasProps {
  graph: ArchitectureGraph;
  selectedNodeId: string | null;
  layoutDirection: GraphLayoutDirection;
  validationIssues?: ValidationIssue[];
  focusNodeIds?: string[] | null;
  onLayoutDirectionChange: (direction: GraphLayoutDirection) => void;
  onSelectNode: (nodeId: string | null) => void;
  positionScale?: number;
}

export function GraphCanvas({
  graph,
  selectedNodeId,
  layoutDirection,
  validationIssues = [],
  focusNodeIds = null,
  onLayoutDirectionChange,
  onSelectNode,
  positionScale = 1
}: GraphCanvasProps) {
  const [nodePositionsByGraph, setNodePositionsByGraph] = useState<
    Record<string, NodePositionMap>
  >({});
  const layoutPositionKey = `${graph.id}:${layoutDirection}`;
  const previousLayoutPositionKeyRef = useRef(layoutPositionKey);
  const focusKey = focusNodeIds?.filter(Boolean).join("|") ?? "all";
  const hasReviewFocus = focusKey !== "all";
  const flowGraph = useMemo(
    () =>
      toReactFlowGraph(
        graph,
        selectedNodeId,
        layoutDirection,
        validationIssues,
        onSelectNode,
        positionScale,
        focusNodeIds
      ),
    [graph, selectedNodeId, layoutDirection, validationIssues, onSelectNode, positionScale, focusNodeIds]
  );
  const nodePositions = nodePositionsByGraph[layoutPositionKey];
  const baseNodes = useMemo(
    () =>
      flowGraph.nodes.map((node) => ({
        ...node,
        draggable: true,
        position: nodePositions?.[node.id] ?? node.position
      })),
    [flowGraph.nodes, nodePositions]
  );
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<SystemFlowNode>(baseNodes);

  useEffect(() => {
    const shouldPreserveCurrentPositions =
      previousLayoutPositionKeyRef.current === layoutPositionKey;

    setFlowNodes((currentNodes) => {
      const currentPositions = new Map(
        currentNodes.map((node) => [node.id, node.position])
      );

      return baseNodes.map((node) => ({
        ...node,
        position:
          nodePositions?.[node.id] ??
          (shouldPreserveCurrentPositions
            ? currentPositions.get(node.id)
            : undefined) ??
          node.position
      }));
    });

    previousLayoutPositionKeyRef.current = layoutPositionKey;
  }, [baseNodes, layoutPositionKey, nodePositions, setFlowNodes]);

  const handleNodeDragStop = useCallback<OnNodeDrag<SystemFlowNode>>(
    (_, node) => {
      setNodePositionsByGraph((current) => ({
        ...current,
        [layoutPositionKey]: {
          ...(current[layoutPositionKey] ?? {}),
          [node.id]: node.position
        }
      }));
    },
    [layoutPositionKey]
  );

  return (
    <div className="architecture-graph-canvas relative h-[68vh] min-h-[560px] overflow-hidden rounded-lg border border-slate-200 bg-[#fbfcfe] shadow-sm lg:h-[calc(100vh-92px)] lg:min-h-0">
      <div className="absolute left-3 top-3 z-10 flex rounded-md border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => onLayoutDirectionChange("horizontal")}
          className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
            layoutDirection === "horizontal"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
          aria-pressed={layoutDirection === "horizontal"}
        >
          Horizontal
        </button>
        <button
          type="button"
          onClick={() => onLayoutDirectionChange("vertical")}
          className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
            layoutDirection === "vertical"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100"
          }`}
          aria-pressed={layoutDirection === "vertical"}
        >
          Vertical
        </button>
      </div>

      <ReactFlow
        key={`${graph.id}-${layoutDirection}-${focusKey}`}
        nodes={flowNodes}
        edges={flowGraph.edges}
        nodeTypes={nodeTypes}
        minZoom={0.26}
        maxZoom={hasReviewFocus ? 1.45 : 1.24}
        nodesDraggable
        nodesConnectable={false}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={() => onSelectNode(null)}
        fitView
        fitViewOptions={{
          maxZoom: hasReviewFocus ? 1.18 : 0.9,
          padding: hasReviewFocus ? 0.28 : 0.16
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="#cbd5e1"
        />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor="#64748b"
          maskColor="rgba(241, 245, 249, 0.68)"
        />
      </ReactFlow>

      {flowGraph.missingEdgeReferences.length > 0 ? (
        <div className="absolute bottom-3 left-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 shadow-sm">
          {flowGraph.missingEdgeReferences.length} edge reference cannot be
          rendered.
        </div>
      ) : null}
    </div>
  );
}
