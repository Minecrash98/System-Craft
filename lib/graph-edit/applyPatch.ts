import { architectureGraphSchema } from "@/shared/schemas/graphSchema";
import type { ArchitectureGraph } from "@/shared/types/graph";
import type { GraphEditPatch } from "./types";

export function applyGraphEditPatch(
  graph: ArchitectureGraph,
  patch: GraphEditPatch
): ArchitectureGraph {
  const nextGraph = patch.operations.reduce<ArchitectureGraph>(
    (current, operation) => {
      if (operation.op === "update_node") {
        return {
          ...current,
          nodes: current.nodes.map((node) =>
            node.id === operation.node_id
              ? { ...node, ...operation.changes }
              : node
          )
        };
      }

      if (operation.op === "add_node") {
        return {
          ...current,
          nodes: [...current.nodes, operation.node]
        };
      }

      if (operation.op === "delete_node") {
        return {
          ...current,
          nodes: current.nodes.filter((node) => node.id !== operation.node_id),
          edges: operation.delete_connected_edges
            ? current.edges.filter(
                (edge) =>
                  edge.source !== operation.node_id &&
                  edge.target !== operation.node_id
              )
            : current.edges
        };
      }

      if (operation.op === "update_edge") {
        return {
          ...current,
          edges: current.edges.map((edge) =>
            edge.id === operation.edge_id
              ? { ...edge, ...operation.changes }
              : edge
          )
        };
      }

      if (operation.op === "add_edge") {
        return {
          ...current,
          edges: [...current.edges, operation.edge]
        };
      }

      if (operation.op === "delete_edge") {
        return {
          ...current,
          edges: current.edges.filter((edge) => edge.id !== operation.edge_id)
        };
      }

      if (operation.op === "update_graph_metadata") {
        return {
          ...current,
          ...operation.changes,
          task_profile: operation.changes.task_profile
            ? {
                ...current.task_profile,
                ...operation.changes.task_profile
              }
            : current.task_profile
        };
      }

      if (operation.op === "reposition_node") {
        return {
          ...current,
          nodes: current.nodes.map((node) =>
            node.id === operation.node_id
              ? { ...node, position: operation.position }
              : node
          )
        };
      }

      return current;
    },
    graph
  );

  const parsed = architectureGraphSchema.safeParse(nextGraph);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "graph"}: ${issue.message}`)
        .join("; ")
    );
  }

  return parsed.data;
}
