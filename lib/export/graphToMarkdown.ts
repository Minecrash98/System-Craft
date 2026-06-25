import type { DemoTrace } from "@/shared/types/demo";
import type { ArchitectureGraph, ArchitectureNode } from "@/shared/types/graph";
import type { ArchitectureScore, ScoreDimension } from "@/shared/types/scoring";
import type { ValidationResult } from "@/shared/types/validation";

interface MarkdownExportInput {
  graph: ArchitectureGraph;
  validation: ValidationResult;
  score: ArchitectureScore;
  trace?: DemoTrace | null;
}

const dimensionLabels: Record<ScoreDimension, string> = {
  reliability: "Reliability",
  user_control: "User Control",
  privacy: "Privacy",
  cost_efficiency: "Cost Efficiency",
  maintainability: "Maintainability",
  learning_value: "Learning Value",
  task_fit: "Task Fit"
};

export function graphToMarkdown({
  graph,
  validation,
  score,
  trace
}: MarkdownExportInput) {
  const sections = [
    `# ${graph.title}`,
    summarySection(graph),
    assumptionsSection(graph),
    taskProfileSection(graph),
    naiveBaselineSection(graph),
    nodesSection(graph.nodes),
    edgesSection(graph),
    riskSection(graph.nodes),
    validationSection(validation),
    scoreSection(score),
    traceSection(trace),
    nextStepsSection(graph, validation)
  ];

  return sections.filter(Boolean).join("\n\n").trim() + "\n";
}

function summarySection(graph: ArchitectureGraph) {
  return [
    "## Summary",
    graph.description,
    "",
    `User idea: ${graph.user_idea}`,
    `Graph id: ${graph.id}`,
    `Version: ${graph.version}`
  ].join("\n");
}

function assumptionsSection(graph: ArchitectureGraph) {
  return [
    "## Assumptions",
    ...listOrFallback(graph.assumptions, "No assumptions were recorded.")
  ].join("\n");
}

function taskProfileSection(graph: ArchitectureGraph) {
  const profile = graph.task_profile;

  return [
    "## Task Profile",
    `- Task type: ${profile.task_type}`,
    `- Risk level: ${profile.risk_level}`,
    `- Knowledge intensity: ${profile.knowledge_intensity}`,
    `- Requires tools: ${yesNo(profile.requires_tools)}`,
    `- Requires memory: ${yesNo(profile.requires_memory)}`,
    `- Requires human review: ${yesNo(profile.requires_human_review)}`,
    `- Requires citations: ${yesNo(Boolean(profile.requires_citations))}`,
    `- Privacy sensitivity: ${profile.privacy_sensitivity ?? "not specified"}`
  ].join("\n");
}

function naiveBaselineSection(graph: ArchitectureGraph) {
  if (!graph.naive_baseline) {
    return "";
  }

  return [
    "## Naive Baseline",
    graph.naive_baseline.summary,
    "",
    "Likely failure modes:",
    ...listOrFallback(
      graph.naive_baseline.failure_modes,
      "No baseline failure modes were recorded."
    )
  ].join("\n");
}

function nodesSection(nodes: ArchitectureNode[]) {
  return [
    "## Components",
    ...nodes.map((node) =>
      [
        `### ${node.name}`,
        `- Id: ${node.id}`,
        `- Type: ${node.type}`,
        `- Purpose: ${node.description}`,
        `- Inputs: ${formatPorts(node.inputs)}`,
        `- Outputs: ${formatPorts(node.outputs)}`,
        `- Cost: ${node.cost_estimate.relative} - ${node.cost_estimate.notes}`,
        `- Latency: ${node.latency_estimate.relative} - ${node.latency_estimate.notes}`,
        `- Beginner explanation: ${node.explanation_for_beginner}`,
        `- Key config: ${formatConfig(node.config)}`,
        `- Alternatives: ${formatAlternatives(node)}`
      ].join("\n")
    )
  ].join("\n\n");
}

function edgesSection(graph: ArchitectureGraph) {
  return [
    "## Data And Control Flow",
    ...graph.edges.map((edge) => {
      const source = graph.nodes.find((node) => node.id === edge.source);
      const target = graph.nodes.find((node) => node.id === edge.target);

      return `- ${source?.name ?? edge.source} -> ${target?.name ?? edge.target}: ${edge.label} (${edge.kind}${edge.data_contract ? `, ${edge.data_contract}` : ""})`;
    })
  ].join("\n");
}

function riskSection(nodes: ArchitectureNode[]) {
  const risks = nodes.flatMap((node) =>
    node.risks.map((risk) => ({
      node,
      risk
    }))
  );

  return [
    "## Risk Register",
    ...risks.map(
      ({ node, risk }) =>
        `- ${risk.severity.toUpperCase()} ${node.name}: ${risk.description} Mitigation: ${risk.mitigation}`
    )
  ].join("\n");
}

function validationSection(validation: ValidationResult) {
  if (validation.issues.length === 0) {
    return [
      "## Validation Issues",
      "No deterministic validation issues were found for this graph."
    ].join("\n");
  }

  return [
    "## Validation Issues",
    ...validation.issues.map(
      (issue) =>
        `- ${issue.severity.toUpperCase()} ${issue.title}: ${issue.description} Recommendation: ${issue.recommendation}`
    )
  ].join("\n");
}

function scoreSection(score: ArchitectureScore) {
  return [
    "## Heuristic Score",
    `Overall score: ${score.overall}`,
    `Band: ${score.band.replaceAll("_", " ")}`,
    "",
    "Dimension scores:",
    ...score.dimensions.map(
      (dimension) =>
        `- ${dimensionLabels[dimension.dimension]}: ${dimension.score}`
    ),
    "",
    "Top strengths:",
    ...listOrFallback(
      score.strengths.map(
        (strength) => `${strength.title}: ${strength.description}`
      ),
      "No strengths were recorded."
    ),
    "",
    "Top improvements:",
    ...listOrFallback(
      score.improvements.map(
        (improvement) => `${improvement.title}: ${improvement.description}`
      ),
      "No priority improvements were recorded."
    ),
    "",
    score.disclaimer
  ].join("\n");
}

function traceSection(trace?: DemoTrace | null) {
  if (!trace) {
    return [
      "## Demo Trace Summary",
      "No simulated trace was attached to this export yet."
    ].join("\n");
  }

  return [
    "## Demo Trace Summary",
    "This trace is simulated. It does not call external APIs, tools, databases, emails, payments, or production systems.",
    "",
    `Sample task: ${trace.task}`,
    trace.naive_comparison
      ? `Naive comparison: ${trace.naive_comparison.failure_observed}`
      : "",
    "",
    "Trace steps:",
    ...trace.steps.map(
      (step) =>
        `- ${step.node_name} [${step.status}]: ${step.output_summary}${step.mitigation_note ? ` Mitigation: ${step.mitigation_note}` : ""}`
    ),
    "",
    `Final preview: ${trace.final_output_preview}`
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function nextStepsSection(
  graph: ArchitectureGraph,
  validation: ValidationResult
) {
  const criticalIssues = validation.issues.filter(
    (issue) => issue.severity === "critical" || issue.severity === "error"
  );
  const firstNodes = graph.nodes.slice(0, 4).map((node) => node.name).join(", ");

  return [
    "## Next Build Steps",
    "- Build a thin prototype around the first user-visible path.",
    `- Start with these components: ${firstNodes || "the input, model, evaluator, and output path"}.`,
    "- Turn each edge contract into an interface or test fixture.",
    "- Add unit tests for validation rules and failure cases before adding real integrations.",
    criticalIssues.length > 0
      ? `- Resolve these blocking issues before implementation: ${criticalIssues.map((issue) => issue.title).join(", ")}.`
      : "- Keep the current validation checks in the review loop as the graph changes.",
    "- Treat this export as an implementation plan, not generated production code."
  ].join("\n");
}

function listOrFallback(values: string[], fallback: string) {
  return values.length > 0 ? values.map((value) => `- ${value}`) : [`- ${fallback}`];
}

function formatPorts(ports: ArchitectureNode["inputs"]) {
  if (ports.length === 0) {
    return "none";
  }

  return ports
    .map((port) => {
      const format = port.format ? `, format ${port.format}` : "";
      const sensitive = port.sensitive ? ", sensitive" : "";
      return `${port.name} (${port.description}${format}${sensitive})`;
    })
    .join("; ");
}

function formatConfig(config: Record<string, unknown>) {
  const entries = Object.entries(config);

  if (entries.length === 0) {
    return "none";
  }

  return entries
    .map(([key, value]) => `${key}=${formatConfigValue(value)}`)
    .join("; ");
}

function formatConfigValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(formatConfigValue).join(", ");
  }

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatAlternatives(node: ArchitectureNode) {
  if (node.alternatives.length === 0) {
    return "none";
  }

  return node.alternatives
    .map((alternative) => `${alternative.name} (${alternative.tradeoff})`)
    .join("; ");
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}
