import type { ArchitectureGraph } from "@/shared/types/graph";
import type { ArchitectureScore } from "@/shared/types/scoring";
import type { ValidationResult } from "@/shared/types/validation";

export const designReviewRoles = ["builder", "reviewer", "mentor"] as const;

export type DesignReviewRole = (typeof designReviewRoles)[number];

export const designReviewSources = ["deterministic", "model"] as const;

export type DesignReviewSource = (typeof designReviewSources)[number];

export interface DesignReviewTurn {
  id: string;
  role: DesignReviewRole;
  speaker: string;
  text: string;
  related_node_ids: string[];
  related_issue_ids: string[];
}

export interface DesignReviewLesson {
  id: string;
  title: string;
  text: string;
  related_node_ids: string[];
  related_issue_ids: string[];
}

export interface DesignReviewDialogue {
  id: string;
  graph_id: string;
  version: "1.0.0";
  title: string;
  source: DesignReviewSource;
  review_notice: string;
  turns: DesignReviewTurn[];
  lessons: DesignReviewLesson[];
}

export interface DesignReviewBuildInput {
  graph: ArchitectureGraph;
  validation: ValidationResult;
  score: ArchitectureScore;
}

export interface DesignReviewReferenceInput {
  graph: ArchitectureGraph;
  validation: ValidationResult;
}

export type DesignReviewValidationResult =
  | { success: true; dialogue: DesignReviewDialogue }
  | { success: false; errors: string[] };
