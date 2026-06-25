import { z } from "zod";

import type {
  GraphEditPatch,
  GraphEditPatchValidationResult
} from "./types";
import {
  architectureEdgeSchema,
  architectureNodeSchema,
  edgeTypeSchema,
  estimateSchema,
  naiveBaselineSchema,
  nodeAlternativeSchema,
  nodePortSchema,
  nodeRiskSchema,
  nodeTypeSchema,
  positionSchema,
  taskProfileSchema
} from "@/shared/schemas/graphSchema";
import type { ArchitectureGraph } from "@/shared/types/graph";

const graphEditModes = [
  "edit_node",
  "add_node",
  "delete_node",
  "edit_edge",
  "add_edge",
  "delete_edge",
  "batch_edit",
  "improve_graph",
  "fix_validation",
  "improve_score"
] as const;

const nodeUpdateChangesSchema = z
  .object({
    type: nodeTypeSchema.optional(),
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    inputs: z.array(nodePortSchema).optional(),
    outputs: z.array(nodePortSchema).optional(),
    config: z.record(z.unknown()).optional(),
    risks: z.array(nodeRiskSchema).optional(),
    cost_estimate: estimateSchema.optional(),
    latency_estimate: estimateSchema.optional(),
    alternatives: z.array(nodeAlternativeSchema).optional(),
    explanation_for_beginner: z.string().min(1).optional(),
    position: positionSchema.optional()
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "update_node changes must include at least one node field."
  });

const edgeUpdateChangesSchema = z
  .object({
    source: z.string().min(1).optional(),
    target: z.string().min(1).optional(),
    kind: edgeTypeSchema.optional(),
    label: z.string().min(1).optional(),
    data_contract: z.string().min(1).optional(),
    condition: z.string().min(1).optional()
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "update_edge changes must include at least one edge field."
  });

const graphMetadataChangesSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    assumptions: z.array(z.string().min(1)).optional(),
    task_profile: taskProfileSchema.partial().optional(),
    naive_baseline: naiveBaselineSchema.optional()
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "update_graph_metadata changes must include at least one metadata field."
  });

export const updateNodeOperationSchema = z.object({
  op: z.literal("update_node"),
  node_id: z.string().min(1),
  changes: nodeUpdateChangesSchema
});

export const addNodeOperationSchema = z.object({
  op: z.literal("add_node"),
  node: architectureNodeSchema
});

export const deleteNodeOperationSchema = z.object({
  op: z.literal("delete_node"),
  node_id: z.string().min(1),
  delete_connected_edges: z.boolean(),
  reason: z.string().min(1)
});

export const updateEdgeOperationSchema = z.object({
  op: z.literal("update_edge"),
  edge_id: z.string().min(1),
  changes: edgeUpdateChangesSchema
});

export const addEdgeOperationSchema = z.object({
  op: z.literal("add_edge"),
  edge: architectureEdgeSchema
});

export const deleteEdgeOperationSchema = z.object({
  op: z.literal("delete_edge"),
  edge_id: z.string().min(1),
  reason: z.string().min(1)
});

export const updateGraphMetadataOperationSchema = z.object({
  op: z.literal("update_graph_metadata"),
  changes: graphMetadataChangesSchema
});

export const repositionNodeOperationSchema = z.object({
  op: z.literal("reposition_node"),
  node_id: z.string().min(1),
  position: positionSchema
});

export const graphEditOperationSchema = z.discriminatedUnion("op", [
  updateNodeOperationSchema,
  addNodeOperationSchema,
  deleteNodeOperationSchema,
  updateEdgeOperationSchema,
  addEdgeOperationSchema,
  deleteEdgeOperationSchema,
  updateGraphMetadataOperationSchema,
  repositionNodeOperationSchema
]);

export const graphEditPatchSchema = z
  .object({
    graph_id: z.string().min(1),
    version: z.string().min(1),
    mode: z.enum(graphEditModes),
    summary: z.string().min(1).max(220),
    operations: z.array(graphEditOperationSchema),
    warnings: z.array(z.string().min(1).max(320)),
    requires_user_confirmation: z.boolean()
  })
  .superRefine((patch, context) => {
    for (const [index, operation] of patch.operations.entries()) {
      if (!isOperationAllowedForMode(patch.mode, operation.op)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${patch.mode} patches may not include ${operation.op} operations.`,
          path: ["operations", index, "op"]
        });
      }
    }

    if (patch.mode === "batch_edit" && patch.operations.length > 8) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "batch_edit patches must include 8 operations or fewer.",
        path: ["operations"]
      });
    }

    if (hasDestructiveOperation(patch) && !patch.requires_user_confirmation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "delete operations require user confirmation.",
        path: ["requires_user_confirmation"]
      });
    }

    const serialized = JSON.stringify(patch);
    if (hasUnsupportedClaim(serialized)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Patch must not claim live execution, external execution, audio, transcription, deployment, testing results, or production readiness.",
        path: ["summary"]
      });
    }
  });

export const graphEditPatchEnvelopeSchema = z.object({
  patch: graphEditPatchSchema
});

export function validateGraphEditPatchCandidate(
  candidate: unknown,
  graph: ArchitectureGraph
): GraphEditPatchValidationResult {
  const parsed = graphEditPatchEnvelopeSchema.safeParse(wrapPatch(candidate));

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "patch"}: ${issue.message}`
      )
    };
  }

  const referenceErrors = validatePatchReferences(parsed.data.patch, graph);
  return referenceErrors.length > 0
    ? { success: false, errors: referenceErrors }
    : { success: true, patch: parsed.data.patch };
}

function validatePatchReferences(patch: GraphEditPatch, graph: ArchitectureGraph) {
  const errors: string[] = [];
  const existingNodeIds = new Set(graph.nodes.map((node) => node.id));
  const existingEdgeIds = new Set(graph.edges.map((edge) => edge.id));
  const addedNodeIds = new Set<string>();
  const addedEdgeIds = new Set<string>();

  if (patch.graph_id !== graph.id) {
    errors.push(`patch.graph_id must match graph id ${graph.id}.`);
  }

  if (patch.version !== graph.version) {
    errors.push(`patch.version must match graph version ${graph.version}.`);
  }

  for (const operation of patch.operations) {
    if (operation.op === "update_node" && !existingNodeIds.has(operation.node_id)) {
      errors.push(`update_node references unknown node ${operation.node_id}.`);
    }

    if (operation.op === "delete_node" && !existingNodeIds.has(operation.node_id)) {
      errors.push(`delete_node references unknown node ${operation.node_id}.`);
    }

    if (operation.op === "reposition_node" && !existingNodeIds.has(operation.node_id)) {
      errors.push(`reposition_node references unknown node ${operation.node_id}.`);
    }

    if (operation.op === "add_node") {
      if (existingNodeIds.has(operation.node.id)) {
        errors.push(`add_node id ${operation.node.id} already exists in the graph.`);
      }

      if (addedNodeIds.has(operation.node.id)) {
        errors.push(`add_node id ${operation.node.id} is duplicated in this patch.`);
      }

      addedNodeIds.add(operation.node.id);
    }

    if (operation.op === "update_edge" && !existingEdgeIds.has(operation.edge_id)) {
      errors.push(`update_edge references unknown edge ${operation.edge_id}.`);
    }

    if (operation.op === "delete_edge" && !existingEdgeIds.has(operation.edge_id)) {
      errors.push(`delete_edge references unknown edge ${operation.edge_id}.`);
    }

    if (operation.op === "add_edge") {
      if (existingEdgeIds.has(operation.edge.id)) {
        errors.push(`add_edge id ${operation.edge.id} already exists in the graph.`);
      }

      if (addedEdgeIds.has(operation.edge.id)) {
        errors.push(`add_edge id ${operation.edge.id} is duplicated in this patch.`);
      }

      addedEdgeIds.add(operation.edge.id);
    }
  }

  const availableNodeIds = new Set([...existingNodeIds, ...addedNodeIds]);

  for (const operation of patch.operations) {
    if (operation.op === "add_edge") {
      if (!availableNodeIds.has(operation.edge.source)) {
        errors.push(`add_edge ${operation.edge.id} references unknown source ${operation.edge.source}.`);
      }

      if (!availableNodeIds.has(operation.edge.target)) {
        errors.push(`add_edge ${operation.edge.id} references unknown target ${operation.edge.target}.`);
      }
    }

    if (operation.op === "update_edge") {
      if (operation.changes.source && !availableNodeIds.has(operation.changes.source)) {
        errors.push(`update_edge ${operation.edge_id} references unknown source ${operation.changes.source}.`);
      }

      if (operation.changes.target && !availableNodeIds.has(operation.changes.target)) {
        errors.push(`update_edge ${operation.edge_id} references unknown target ${operation.changes.target}.`);
      }
    }
  }

  return errors;
}

function isOperationAllowedForMode(mode: GraphEditPatch["mode"], operation: string) {
  const allowed: Record<GraphEditPatch["mode"], string[]> = {
    edit_node: ["update_node"],
    add_node: ["add_node", "add_edge"],
    delete_node: ["delete_node", "delete_edge"],
    edit_edge: ["update_edge"],
    add_edge: ["add_edge"],
    delete_edge: ["delete_edge"],
    batch_edit: [
      "add_node",
      "update_node",
      "add_edge",
      "update_edge",
      "reposition_node",
      "delete_edge",
      "delete_node",
      "update_graph_metadata"
    ],
    improve_graph: [
      "update_node",
      "add_node",
      "delete_node",
      "update_edge",
      "add_edge",
      "delete_edge",
      "update_graph_metadata",
      "reposition_node"
    ],
    fix_validation: [
      "update_node",
      "add_node",
      "delete_node",
      "update_edge",
      "add_edge",
      "delete_edge",
      "update_graph_metadata",
      "reposition_node"
    ],
    improve_score: [
      "update_node",
      "add_node",
      "delete_node",
      "update_edge",
      "add_edge",
      "delete_edge",
      "update_graph_metadata",
      "reposition_node"
    ]
  };

  return allowed[mode].includes(operation);
}

function hasDestructiveOperation(patch: GraphEditPatch) {
  return patch.operations.some(
    (operation) => operation.op === "delete_node" || operation.op === "delete_edge"
  );
}

function wrapPatch(candidate: unknown) {
  return isRecord(candidate) && "patch" in candidate ? candidate : { patch: candidate };
}

function hasUnsupportedClaim(value: string) {
  return [
    /\bactually (?:ran|run|executed|called|queried|uploaded|retrieved|verified|tested|deployed)\b/i,
    /\blive (?:api|provider|database|retrieval|execution|run|tool)\b/i,
    /\bproduction ready\b/i,
    /\bdeployed\b/i,
    /\btesting results\b/i,
    /\baudio\b/i,
    /\brecording\b/i,
    /\btranscription\b/i
  ].some((pattern) => pattern.test(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}