import type { Severity } from "./graph";

export type ValidationSeverity = Severity;

export interface ValidationScoreImpact {
  dimension: string;
  delta: number;
}

export interface ValidationIssue {
  id: string;
  rule_id: string;
  severity: ValidationSeverity;
  title: string;
  description: string;
  affected_node_ids: string[];
  recommendation: string;
  score_impact?: ValidationScoreImpact;
  auto_fix_possible: boolean;
}

export interface ValidationResult {
  graph_id: string;
  issues: ValidationIssue[];
  checked_at?: string;
}
