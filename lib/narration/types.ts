import type { ArchitectureGraph } from "@/shared/types/graph";
import type { ArchitectureScore } from "@/shared/types/scoring";
import type { ValidationResult } from "@/shared/types/validation";

export const narrationSegmentKinds = [
  "overview",
  "naive_baseline",
  "key_path",
  "risk_checkpoint",
  "tradeoff",
  "improvement",
  "final_lesson"
] as const;

export type NarrationSegmentKind = (typeof narrationSegmentKinds)[number];

export const narrationScriptSources = ["deterministic", "model"] as const;

export type NarrationScriptSource = (typeof narrationScriptSources)[number];

export interface NarrationSegment {
  id: string;
  kind: NarrationSegmentKind;
  title: string;
  text: string;
  related_node_ids: string[];
  related_issue_ids: string[];
  target_duration_seconds: number;
}

export interface NarrationScript {
  id: string;
  graph_id: string;
  version: "1.0.0";
  title: string;
  source: NarrationScriptSource;
  target_duration_seconds: number;
  simulation_notice: string;
  segments: NarrationSegment[];
}

export interface NarrationBuildInput {
  graph: ArchitectureGraph;
  validation: ValidationResult;
  score: ArchitectureScore;
}

export interface NarrationReferenceInput {
  graph: ArchitectureGraph;
  validation: ValidationResult;
}

export type NarrationValidationResult =
  | { success: true; script: NarrationScript }
  | { success: false; errors: string[] };
