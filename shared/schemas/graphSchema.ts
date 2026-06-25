import { z } from "zod";

export const nodeTypeSchema = z.enum([
  "input",
  "prompt",
  "llm",
  "knowledge_base",
  "retrieval",
  "tool",
  "memory",
  "human_review",
  "evaluator",
  "output",
  "transform",
  "router",
  "classifier",
  "privacy_filter",
  "fallback",
  "logger"
]);

export const edgeTypeSchema = z.enum([
  "data_flow",
  "control_flow",
  "review_flow",
  "fallback_flow"
]);

export const riskLevelSchema = z.enum(["low", "medium", "high"]);
export const estimateLevelSchema = z.enum(["none", "low", "medium", "high"]);
export const severitySchema = z.enum(["info", "warning", "error", "critical"]);
export const nodeRiskSeveritySchema = z.enum(["warning", "error", "critical"]);

export const estimateSchema = z.object({
  relative: estimateLevelSchema,
  notes: z.string().min(1),
  units_per_run: z.number().nonnegative().optional(),
  estimated_seconds: z.number().nonnegative().optional()
});

export const nodePortSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  sensitive: z.boolean().optional(),
  format: z.string().min(1).optional()
});

export const nodeRiskSchema = z.object({
  risk_type: z.string().min(1),
  severity: nodeRiskSeveritySchema,
  description: z.string().min(1),
  mitigation: z.string().min(1)
});

export const nodeAlternativeSchema = z.object({
  name: z.string().min(1),
  tradeoff: z.string().min(1),
  when_to_use: z.string().min(1).optional()
});

export const positionSchema = z.object({
  x: z.number(),
  y: z.number()
});

export const architectureNodeSchema = z.object({
  id: z.string().min(1),
  type: nodeTypeSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  inputs: z.array(nodePortSchema),
  outputs: z.array(nodePortSchema),
  config: z.record(z.unknown()),
  risks: z.array(nodeRiskSchema),
  cost_estimate: estimateSchema,
  latency_estimate: estimateSchema,
  alternatives: z.array(nodeAlternativeSchema),
  explanation_for_beginner: z.string().min(1),
  position: positionSchema.optional()
});

export const architectureEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: edgeTypeSchema,
  label: z.string().min(1),
  data_contract: z.string().min(1).optional(),
  condition: z.string().min(1).optional()
});

export const taskProfileSchema = z.object({
  task_type: z.string().min(1),
  risk_level: riskLevelSchema,
  knowledge_intensity: riskLevelSchema,
  requires_tools: z.boolean(),
  requires_memory: z.boolean(),
  requires_human_review: z.boolean(),
  requires_citations: z.boolean().optional(),
  privacy_sensitivity: riskLevelSchema.optional()
});

export const naiveBaselineSchema = z.object({
  summary: z.string().min(1),
  failure_modes: z.array(z.string().min(1)).min(1)
});

export const architectureGraphSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    version: z.string().min(1),
    user_idea: z.string().min(1),
    assumptions: z.array(z.string().min(1)),
    task_profile: taskProfileSchema,
    nodes: z.array(architectureNodeSchema).min(1),
    edges: z.array(architectureEdgeSchema),
    naive_baseline: naiveBaselineSchema.optional()
  })
  .superRefine((graph, context) => {
    const nodeIds = new Set(graph.nodes.map((node) => node.id));

    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.source)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge ${edge.id} references missing source node ${edge.source}.`,
          path: ["edges", graph.edges.indexOf(edge), "source"]
        });
      }

      if (!nodeIds.has(edge.target)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge ${edge.id} references missing target node ${edge.target}.`,
          path: ["edges", graph.edges.indexOf(edge), "target"]
        });
      }
    }
  });

export type ArchitectureGraphInput = z.infer<typeof architectureGraphSchema>;
