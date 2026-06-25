import type {
  ArchitectureEdge,
  ArchitectureGraph,
  ArchitectureNode
} from "@/shared/types/graph";
import type { ArchitectureScore } from "@/shared/types/scoring";
import type { ValidationResult } from "@/shared/types/validation";

export type GraphEditMode =
  | "edit_node"
  | "add_node"
  | "delete_node"
  | "edit_edge"
  | "add_edge"
  | "delete_edge"
  | "batch_edit"
  | "improve_graph"
  | "fix_validation"
  | "improve_score";

export type NodeUpdateChanges = Partial<Omit<ArchitectureNode, "id">>;
export type EdgeUpdateChanges = Partial<Omit<ArchitectureEdge, "id">>;
export interface GraphMetadataChanges {
  title?: string;
  description?: string;
  assumptions?: string[];
  task_profile?: Partial<ArchitectureGraph["task_profile"]>;
  naive_baseline?: ArchitectureGraph["naive_baseline"];
}

export interface UpdateNodeOperation {
  op: "update_node";
  node_id: string;
  changes: NodeUpdateChanges;
}

export interface AddNodeOperation {
  op: "add_node";
  node: ArchitectureNode;
}

export interface DeleteNodeOperation {
  op: "delete_node";
  node_id: string;
  delete_connected_edges: boolean;
  reason: string;
}

export interface UpdateEdgeOperation {
  op: "update_edge";
  edge_id: string;
  changes: EdgeUpdateChanges;
}

export interface AddEdgeOperation {
  op: "add_edge";
  edge: ArchitectureEdge;
}

export interface DeleteEdgeOperation {
  op: "delete_edge";
  edge_id: string;
  reason: string;
}

export interface UpdateGraphMetadataOperation {
  op: "update_graph_metadata";
  changes: GraphMetadataChanges;
}

export interface RepositionNodeOperation {
  op: "reposition_node";
  node_id: string;
  position: NonNullable<ArchitectureNode["position"]>;
}

export type GraphEditOperation =
  | UpdateNodeOperation
  | AddNodeOperation
  | DeleteNodeOperation
  | UpdateEdgeOperation
  | AddEdgeOperation
  | DeleteEdgeOperation
  | UpdateGraphMetadataOperation
  | RepositionNodeOperation;

export interface GraphEditPatch {
  graph_id: string;
  version: string;
  mode: GraphEditMode;
  summary: string;
  operations: GraphEditOperation[];
  warnings: string[];
  requires_user_confirmation: boolean;
}

export interface GraphEditPatchEnvelope {
  patch: GraphEditPatch;
}

export interface GraphEditReferenceInput {
  graph: ArchitectureGraph;
}

export type GraphEditPatchValidationResult =
  | { success: true; patch: GraphEditPatch }
  | { success: false; errors: string[] };

export interface NodeAddFallbackInput {
  graph: ArchitectureGraph;
  userRequest: string;
  preferredAnchorNodeIds?: string[];
  validation?: ValidationResult;
  score?: ArchitectureScore;
}

export interface NodeEditFallbackInput {
  graph: ArchitectureGraph;
  selectedNodeId: string;
  userRequest: string;
  validation?: ValidationResult;
  score?: ArchitectureScore;
}
