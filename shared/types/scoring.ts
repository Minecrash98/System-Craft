import type { ValidationIssue } from "./validation";

export type ScoreDimension =
  | "reliability"
  | "user_control"
  | "privacy"
  | "cost_efficiency"
  | "maintainability"
  | "learning_value"
  | "task_fit";

export type ScoreBand =
  | "strong_starting_point"
  | "good_but_review_issues"
  | "needs_architectural_work"
  | "risky_or_incomplete";

export interface ScoreReason {
  title: string;
  description: string;
  related_node_ids?: string[];
  related_issue_ids?: string[];
}

export interface DimensionScore {
  dimension: ScoreDimension;
  score: number;
  reasons: ScoreReason[];
  improvements: ScoreReason[];
}

export interface ArchitectureScore {
  graph_id: string;
  overall: number;
  band: ScoreBand;
  dimensions: DimensionScore[];
  strengths: ScoreReason[];
  improvements: ScoreReason[];
  issues_considered: ValidationIssue[];
  disclaimer: string;
}
