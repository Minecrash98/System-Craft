export type NodeType =
  | "input"
  | "prompt"
  | "llm"
  | "knowledge_base"
  | "retrieval"
  | "tool"
  | "memory"
  | "human_review"
  | "evaluator"
  | "output"
  | "transform"
  | "router"
  | "classifier"
  | "privacy_filter"
  | "fallback"
  | "logger";

export type EdgeType =
  | "data_flow"
  | "control_flow"
  | "review_flow"
  | "fallback_flow";

export type RiskLevel = "low" | "medium" | "high";
export type EstimateLevel = "none" | "low" | "medium" | "high";
export type Severity = "info" | "warning" | "error" | "critical";

export interface Estimate {
  relative: EstimateLevel;
  notes: string;
  units_per_run?: number;
  estimated_seconds?: number;
}

export interface NodePort {
  name: string;
  description: string;
  sensitive?: boolean;
  format?: string;
}

export interface NodeRisk {
  risk_type: string;
  severity: Exclude<Severity, "info">;
  description: string;
  mitigation: string;
}

export interface NodeAlternative {
  name: string;
  tradeoff: string;
  when_to_use?: string;
}

export interface ArchitectureNode {
  id: string;
  type: NodeType;
  name: string;
  description: string;
  inputs: NodePort[];
  outputs: NodePort[];
  config: Record<string, unknown>;
  risks: NodeRisk[];
  cost_estimate: Estimate;
  latency_estimate: Estimate;
  alternatives: NodeAlternative[];
  explanation_for_beginner: string;
  position?: { x: number; y: number };
}

export interface ArchitectureEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeType;
  label: string;
  data_contract?: string;
  condition?: string;
}

export interface TaskProfile {
  task_type: string;
  risk_level: RiskLevel;
  knowledge_intensity: RiskLevel;
  requires_tools: boolean;
  requires_memory: boolean;
  requires_human_review: boolean;
  requires_citations?: boolean;
  privacy_sensitivity?: RiskLevel;
}

export interface NaiveBaseline {
  summary: string;
  failure_modes: string[];
}

export interface ArchitectureGraph {
  id: string;
  title: string;
  description: string;
  version: string;
  user_idea: string;
  assumptions: string[];
  task_profile: TaskProfile;
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  naive_baseline?: NaiveBaseline;
}
