export type DemoTraceStatus =
  | "simulated"
  | "passed"
  | "needs_review"
  | "blocked"
  | "failed";

export interface DemoTraceStep {
  id: string;
  node_id: string;
  node_name: string;
  input_summary: string;
  output_summary: string;
  status: DemoTraceStatus;
  risk_note?: string;
  mitigation_note?: string;
}

export interface DemoTrace {
  graph_id: string;
  task: string;
  simulated: true;
  steps: DemoTraceStep[];
  final_output_preview: string;
  naive_comparison?: {
    summary: string;
    failure_observed: string;
  };
}
