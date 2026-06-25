import { validateArchitectureGraph } from "@/lib/validation/validateArchitecture";
import type { ArchitectureGraph, ArchitectureNode } from "@/shared/types/graph";
import type {
  ArchitectureScore,
  DimensionScore,
  ScoreBand,
  ScoreDimension,
  ScoreReason
} from "@/shared/types/scoring";
import type {
  ValidationIssue,
  ValidationResult
} from "@/shared/types/validation";

const disclaimer =
  "These scores are heuristic design checks for learning and prototyping. They are not a guarantee of correctness, safety, compliance, or production readiness.";

const dimensions: ScoreDimension[] = [
  "reliability",
  "user_control",
  "privacy",
  "cost_efficiency",
  "maintainability",
  "learning_value",
  "task_fit"
];

const severityPenalty = {
  info: 2,
  warning: 6,
  error: 12,
  critical: 20
};

export function scoreArchitectureGraph(
  graph: ArchitectureGraph,
  validationResult: ValidationResult = validateArchitectureGraph(graph)
): ArchitectureScore {
  const dimensionScores = dimensions.map((dimension) =>
    scoreDimension(graph, validationResult.issues, dimension)
  );
  const overall = Math.round(
    dimensionScores.reduce((sum, dimension) => sum + dimension.score, 0) /
      dimensionScores.length
  );

  return {
    graph_id: graph.id,
    overall,
    band: scoreBand(overall),
    dimensions: dimensionScores,
    strengths: topReasons(dimensionScores.flatMap((score) => score.reasons), 4),
    improvements: topReasons(
      dimensionScores.flatMap((score) => score.improvements),
      4
    ),
    issues_considered: validationResult.issues,
    disclaimer
  };
}

function scoreDimension(
  graph: ArchitectureGraph,
  issues: ValidationIssue[],
  dimension: ScoreDimension
): DimensionScore {
  const reasons: ScoreReason[] = [];
  const improvements: ScoreReason[] = [];
  let score = 68;

  for (const signal of positiveSignals(graph, dimension)) {
    score += signal.delta;
    reasons.push(signal.reason);
  }

  const dimensionIssues = issues.filter(
    (issue) => issue.score_impact?.dimension === dimension
  );

  for (const issue of dimensionIssues) {
    const penalty = Math.abs(issue.score_impact?.delta ?? severityPenalty[issue.severity]);
    score -= Math.max(penalty, severityPenalty[issue.severity]);
    improvements.push({
      title: issue.title,
      description: issue.recommendation,
      related_node_ids: issue.affected_node_ids,
      related_issue_ids: [issue.id]
    });
  }

  const globalCriticals = issues.filter(
    (issue) => issue.severity === "critical" && issue.score_impact?.dimension !== dimension
  );

  if (globalCriticals.length > 0 && dimension !== "cost_efficiency") {
    score -= Math.min(10, globalCriticals.length * 4);
  }

  if (improvements.length === 0) {
    improvements.push(defaultImprovement(graph, dimension));
  }

  return {
    dimension,
    score: clamp(Math.round(score)),
    reasons: topReasons(reasons, 3),
    improvements: topReasons(improvements, 3)
  };
}

function positiveSignals(
  graph: ArchitectureGraph,
  dimension: ScoreDimension
): Array<{ delta: number; reason: ScoreReason }> {
  switch (dimension) {
    case "reliability":
      return [
        signal(
          hasNode(graph, "retrieval") && hasNode(graph, "knowledge_base"),
          8,
          "Grounded knowledge path",
          "Retrieval and a knowledge base help keep answers tied to approved context.",
          nodesOfTypes(graph, ["retrieval", "knowledge_base"])
        ),
        signal(
          hasNode(graph, "evaluator"),
          8,
          "Evaluator checkpoint",
          "An evaluator can catch unsupported, unsafe, or low-quality drafts before output.",
          nodesOfTypes(graph, ["evaluator"])
        ),
        signal(
          hasCitationVerifier(graph),
          7,
          "Citation verification",
          "Citation-oriented answers have a visible claim-source checking step.",
          nodesOfTypes(graph, ["evaluator"])
        ),
        signal(
          graph.nodes.some((node) => textOf(node).includes("fallback")),
          5,
          "Fallback behavior is visible",
          "At least one component describes what happens when evidence or execution fails."
        )
      ].filter(isPresent);
    case "user_control":
      return [
        signal(
          hasNode(graph, "human_review"),
          10,
          "Human review gate",
          "A person can approve or edit important output before it becomes final.",
          nodesOfTypes(graph, ["human_review"])
        ),
        signal(
          graph.nodes.some((node) => matchesAny(textOf(node), ["approve", "edit"])),
          6,
          "Approval or edit path",
          "The graph gives the user a way to approve, edit, or escalate outcomes."
        ),
        signal(
          graph.nodes.some((node) => matchesAny(textOf(node), ["source", "citation"])),
          5,
          "Source visibility",
          "Sources or citation status are visible enough for users to inspect."
        )
      ].filter(isPresent);
    case "privacy":
      return [
        signal(
          graph.nodes.some(hasRetentionPolicy),
          9,
          "Retention policy exists",
          "Sensitive storage nodes describe deletion, reset, consent, or retention assumptions."
        ),
        signal(
          hasNode(graph, "privacy_filter") ||
            graph.nodes.some((node) => matchesAny(textOf(node), ["redact", "minimize"])),
          8,
          "Data minimization is represented",
          "The graph shows a privacy filter or minimization behavior before sensitive data spreads.",
          nodesOfTypes(graph, ["privacy_filter"])
        ),
        signal(
          graph.nodes.some((node) =>
            [...node.inputs, ...node.outputs].some((port) => port.sensitive)
          ),
          4,
          "Sensitive ports are labeled",
          "The graph marks sensitive inputs or outputs instead of hiding privacy risk."
        )
      ].filter(isPresent);
    case "cost_efficiency":
      return [
        signal(
          graph.nodes.some((node) => matchesAny(textOf(node), ["batch", "cache"])),
          7,
          "Caching or batching signal",
          "The architecture includes a way to avoid repeated work where possible."
        ),
        signal(
          graph.nodes.every((node) => node.cost_estimate.relative !== "high"),
          6,
          "No high-cost node estimates",
          "Node cost estimates stay below high for the current MVP graph."
        ),
        signal(
          graph.nodes.length <= 12,
          5,
          "MVP-sized graph",
          "The graph is small enough for a beginner to scan and build incrementally."
        )
      ].filter(isPresent);
    case "maintainability":
      return [
        signal(
          graph.nodes.every((node) => node.inputs && node.outputs),
          6,
          "Explicit interfaces",
          "Nodes define their inputs and outputs, making handoff between components easier."
        ),
        signal(
          hasNode(graph, "prompt") && hasNode(graph, "llm"),
          7,
          "Prompt separated from LLM",
          "Keeping prompt construction separate from generation makes behavior easier to test.",
          nodesOfTypes(graph, ["prompt", "llm"])
        ),
        signal(
          graph.edges.some((edge) => Boolean(edge.data_contract)),
          5,
          "Data contracts are present",
          "Edges include contracts that clarify what moves between nodes."
        )
      ].filter(isPresent);
    case "learning_value":
      return [
        signal(
          graph.nodes.every((node) => node.explanation_for_beginner.trim().length > 0),
          8,
          "Beginner explanations",
          "Every node explains its role in beginner-friendly language."
        ),
        signal(
          graph.nodes.every((node) => node.risks.length > 0),
          7,
          "Risks are visible",
          "Each component teaches what can go wrong and how to mitigate it."
        ),
        signal(
          Boolean(graph.naive_baseline),
          7,
          "Naive baseline comparison",
          "The graph includes a baseline failure story to show why the improved design matters."
        )
      ].filter(isPresent);
    case "task_fit":
      return [
        signal(
          !graph.task_profile.requires_citations || hasCitationVerifier(graph),
          8,
          "Citation need is represented",
          "The architecture includes a citation-specific safeguard when the task requires citations."
        ),
        signal(
          graph.task_profile.knowledge_intensity !== "high" ||
            (hasNode(graph, "retrieval") && hasNode(graph, "knowledge_base")),
          9,
          "Knowledge need is represented",
          "The graph includes retrieval and approved knowledge storage for a knowledge-heavy task.",
          nodesOfTypes(graph, ["retrieval", "knowledge_base"])
        ),
        signal(
          graph.task_profile.risk_level !== "high" ||
            (hasNode(graph, "evaluator") && hasNode(graph, "human_review")),
          9,
          "Risk level is reflected",
          "High-risk tasks include both automated review and human review.",
          nodesOfTypes(graph, ["evaluator", "human_review"])
        )
      ].filter(isPresent);
  }
}

function defaultImprovement(
  graph: ArchitectureGraph,
  dimension: ScoreDimension
): ScoreReason {
  const title = {
    reliability: "Document expected failures",
    user_control: "Make user choices explicit",
    privacy: "Name storage boundaries",
    cost_efficiency: "Identify the simplest MVP path",
    maintainability: "Tighten contracts",
    learning_value: "Keep tradeoffs visible",
    task_fit: "Connect assumptions to components"
  }[dimension];

  const description = {
    reliability:
      "Add one more explicit failure mode or fallback path for the most important model step.",
    user_control:
      "Clarify where the user can approve, edit, retry, or reject the system output.",
    privacy:
      "Keep retention, deletion, and sensitive-field handling visible wherever data is stored.",
    cost_efficiency:
      "Mark which nodes are needed for the first demo and which can wait until later.",
    maintainability:
      "Use edge contracts and node configs to make component boundaries easier to test.",
    learning_value:
      "Keep alternatives and beginner explanations concrete enough to teach the design choice.",
    task_fit:
      `Check that the graph still directly supports "${graph.task_profile.task_type.replaceAll(
        "_",
        " "
      )}".`
  }[dimension];

  return { title, description };
}

function topReasons(reasons: ScoreReason[], count: number) {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    const key = `${reason.title}:${reason.description}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  }).slice(0, count);
}

function signal(
  condition: boolean,
  delta: number,
  title: string,
  description: string,
  relatedNodes: ArchitectureNode[] = []
) {
  if (!condition) {
    return null;
  }

  return {
    delta,
    reason: {
      title,
      description,
      related_node_ids: relatedNodes.map((node) => node.id)
    }
  };
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function hasNode(graph: ArchitectureGraph, type: ArchitectureNode["type"]) {
  return graph.nodes.some((node) => node.type === type);
}

function nodesOfTypes(graph: ArchitectureGraph, types: ArchitectureNode["type"][]) {
  return graph.nodes.filter((node) => types.includes(node.type));
}

function hasCitationVerifier(graph: ArchitectureGraph) {
  return graph.nodes.some((node) => {
    const text = textOf(node);
    return (
      node.type === "evaluator" &&
      matchesAny(text, ["citation", "source", "claim"]) &&
      matchesAny(text, ["verify", "verifier", "alignment", "support"])
    );
  });
}

function hasRetentionPolicy(node: ArchitectureNode) {
  const configText = JSON.stringify(node.config).toLowerCase();

  return matchesAny(configText, [
    "retention",
    "delete",
    "deletion",
    "reset",
    "consent",
    "session-only",
    "local draft"
  ]);
}

function textOf(node: ArchitectureNode) {
  return JSON.stringify({
    name: node.name,
    description: node.description,
    inputs: node.inputs,
    outputs: node.outputs,
    config: node.config,
    risks: node.risks,
    alternatives: node.alternatives,
    explanation_for_beginner: node.explanation_for_beginner
  }).toLowerCase();
}

function matchesAny(value: string, needles: string[]) {
  const lowerValue = value.toLowerCase();
  return needles.some((needle) => lowerValue.includes(needle.toLowerCase()));
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function scoreBand(score: number): ScoreBand {
  if (score >= 80) {
    return "strong_starting_point";
  }

  if (score >= 65) {
    return "good_but_review_issues";
  }

  if (score >= 45) {
    return "needs_architectural_work";
  }

  return "risky_or_incomplete";
}
