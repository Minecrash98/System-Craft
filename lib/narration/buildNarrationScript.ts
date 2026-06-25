import { estimateSpeechSeconds, narrationScriptSchema } from "./schema";
import type {
  NarrationBuildInput,
  NarrationReferenceInput,
  NarrationScript,
  NarrationSegment,
  NarrationSegmentKind,
  NarrationValidationResult
} from "./types";
import type {
  ArchitectureGraph,
  ArchitectureNode,
  Severity
} from "@/shared/types/graph";
import type { ScoreReason } from "@/shared/types/scoring";
import type { ValidationIssue } from "@/shared/types/validation";

const severityRank: Record<Severity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3
};

export function buildDeterministicNarrationScript(input: NarrationBuildInput) {
  const context = buildContext(input.graph, input.validation, input.score);
  const segments = [
    segment(
      "overview",
      "What this blueprint is for",
      `${input.graph.title} turns the idea into visible components, checks, and tradeoffs. This simulated walkthrough explains the graph rather than proving runtime behavior.`,
      context.anchorNodeIds
    ),
    segment(
      "naive_baseline",
      "Why the simple version fails",
      naiveBaselineText(input.graph),
      context.anchorNodeIds
    ),
    segment(
      "key_path",
      "The grounded path",
      keyPathText(context),
      context.keyPathNodeIds
    ),
    segment(
      "risk_checkpoint",
      "The checkpoint that matters most",
      riskText(context),
      context.riskNodeIds,
      context.riskIssueIds
    ),
    segment(
      "tradeoff",
      "Privacy, cost, and reliability",
      tradeoffText(context),
      context.tradeoffNodeIds
    ),
    segment(
      "improvement",
      "Next improvement",
      improvementText(context),
      context.improvementNodeIds,
      context.improvementIssueIds
    ),
    segment(
      "final_lesson",
      "The transferable lesson",
      "The lesson is to make trust visible. Use retrieval for evidence, verification for claims, human review for judgment, and honest simulation labels for every demo result.",
      context.lessonNodeIds
    )
  ];
  const candidate: NarrationScript = {
    id: `${slug(input.graph.id)}-mentor-walkthrough`,
    graph_id: input.graph.id,
    version: "1.0.0",
    title: `${input.graph.title} mentor walkthrough`,
    source: "deterministic",
    target_duration_seconds: segments.reduce(
      (sum, current) => sum + current.target_duration_seconds,
      0
    ),
    simulation_notice:
      "This transcript explains an architecture graph. It is not a live execution and does not call external APIs, tools, databases, audio providers, or production systems.",
    segments
  };
  const validated = validateNarrationScriptCandidate(candidate, {
    graph: input.graph,
    validation: input.validation
  });

  if (!validated.success) {
    throw new Error(
      `Deterministic narration script failed validation: ${validated.errors.join("; ")}`
    );
  }

  return validated.script;
}

export function validateNarrationScriptCandidate(
  candidate: unknown,
  references: NarrationReferenceInput
): NarrationValidationResult {
  const parsed = narrationScriptSchema.safeParse(unwrapScript(candidate));

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "script"}: ${issue.message}`
      )
    };
  }

  const referenceErrors = validateReferences(parsed.data, references);
  return referenceErrors.length > 0
    ? { success: false, errors: referenceErrors }
    : { success: true, script: parsed.data };
}

function buildContext(
  graph: ArchitectureGraph,
  validation: NarrationBuildInput["validation"],
  score: NarrationBuildInput["score"]
) {
  const byType = (type: ArchitectureNode["type"]) =>
    graph.nodes.filter((node) => node.type === type);
  const byText = (terms: string[]) =>
    graph.nodes.find((node) =>
      terms.every((term) => nodeText(node).includes(term.toLowerCase()))
    );
  const firstInput = byType("input")[0] ?? graph.nodes[0];
  const finalOutput = byType("output")[0] ?? graph.nodes.at(-1) ?? graph.nodes[0];
  const retrieval = byType("retrieval")[0];
  const knowledgeBase = byType("knowledge_base")[0];
  const prompt = byType("prompt")[0];
  const llm = byType("llm")[0];
  const citationVerifier =
    byText(["citation", "verifier"]) ??
    byText(["citation", "verify"]) ??
    byType("evaluator")[0];
  const humanReview = byType("human_review")[0];
  const privacyNode =
    byType("privacy_filter")[0] ??
    graph.nodes.find((node) => hasSensitivePort(node) || nodeText(node).includes("privacy"));
  const costNode =
    graph.nodes.find((node) =>
      ["medium", "high"].includes(node.cost_estimate.relative)
    ) ?? llm;
  const highestIssue = selectHighestSignalIssue(validation.issues);
  const highestRisk = selectHighestNodeRisk(graph, highestIssue);
  const topImprovement = selectTopImprovement(
    score.improvements,
    score.dimensions.flatMap((dimension) => dimension.improvements)
  );
  const improvementIssueIds = idsFromImprovement(topImprovement, validation.issues);
  const improvementNodeIds = [
    ...(topImprovement?.related_node_ids ?? []),
    ...issueNodeIds(improvementIssueIds, validation.issues),
    highestRisk.node?.id
  ].filter(isPresent);

  return {
    graph,
    firstInput,
    finalOutput,
    retrieval,
    knowledgeBase,
    prompt,
    llm,
    citationVerifier,
    humanReview,
    privacyNode,
    costNode,
    highestIssue,
    highestRisk,
    topImprovement,
    anchorNodeIds: uniqueIds([firstInput?.id, finalOutput?.id]),
    keyPathNodeIds: uniqueIds([
      knowledgeBase?.id,
      retrieval?.id,
      prompt?.id,
      llm?.id,
      citationVerifier?.id,
      finalOutput?.id
    ]).slice(0, 6),
    riskNodeIds: uniqueIds([
      ...(highestIssue?.affected_node_ids ?? []),
      highestRisk.node?.id,
      citationVerifier?.id,
      humanReview?.id
    ]).slice(0, 6),
    riskIssueIds: highestIssue ? [highestIssue.id] : [],
    tradeoffNodeIds: uniqueIds([
      privacyNode?.id,
      costNode?.id,
      retrieval?.id,
      citationVerifier?.id,
      humanReview?.id
    ]).slice(0, 6),
    improvementNodeIds: uniqueIds(improvementNodeIds).slice(0, 6),
    improvementIssueIds,
    lessonNodeIds: uniqueIds([
      retrieval?.id,
      citationVerifier?.id,
      humanReview?.id,
      finalOutput?.id
    ]).slice(0, 6)
  };
}

function naiveBaselineText(graph: ArchitectureGraph) {
  if (!graph.naive_baseline) {
    return "The naive version sends the request straight to one model. It hides grounding, review, fallback, and privacy boundaries before the user sees an answer.";
  }

  const summary = shorten(graph.naive_baseline.summary, 22);
  const failure = shorten(
    graph.naive_baseline.failure_modes[0] ?? "important checks can be skipped before trust.",
    16
  );
  return `${summary} Key failure: ${failure}`;
}

function keyPathText(context: ReturnType<typeof buildContext>) {
  const groundingParts = [
    context.knowledgeBase?.name,
    context.retrieval?.name,
    context.prompt?.name,
    context.llm?.name
  ].filter(isPresent);

  if (groundingParts.length > 0) {
    return `The improved path grounds the answer through ${joinNames(
      groundingParts
    )}. That keeps the drafting step close to approved context before any final answer appears.`;
  }

  return `The improved path makes each handoff explicit before ${context.finalOutput.name}. Even without retrieval, the graph still teaches where input, model work, and output checks belong.`;
}

function riskText(context: ReturnType<typeof buildContext>) {
  if (context.highestIssue) {
    return `Highest-signal issue: ${context.highestIssue.title}. ${shorten(
      context.highestIssue.recommendation,
      20
    )} This names the risk before trust.`;
  }

  const riskNode = context.highestRisk.node;
  const risk = context.highestRisk.risk;
  const checkpoint = context.citationVerifier ?? context.humanReview;

  if (riskNode && risk) {
    return `Highest-signal risk: ${riskNode.name} can face ${shorten(risk.description, 18)} ${
      checkpoint
        ? `${checkpoint.name} is the checkpoint that keeps that risk visible.`
        : "The graph should keep that risk visible."
    }`;
  }

  return "Highest-signal risk: the user may overtrust a polished result. The graph reduces that by keeping checks and review visible before final output.";
}

function tradeoffText(context: ReturnType<typeof buildContext>) {
  const reliability = context.citationVerifier
    ? `${context.citationVerifier.name} strengthens reliability`
    : "Visible checkpoints strengthen reliability";
  const privacy = context.privacyNode
    ? `${context.privacyNode.name} carries the privacy boundary`
    : "privacy still needs an explicit data boundary";
  const cost = context.costNode
    ? `${context.costNode.name} is a cost or latency driver`
    : "model and review steps drive cost";
  const review = context.humanReview
    ? `${context.humanReview.name} adds judgment but can add waiting time`
    : "manual review can add judgment when risk rises";

  return `${reliability}. ${privacy}. ${cost}. ${review}.`;
}

function improvementText(context: ReturnType<typeof buildContext>) {
  if (context.topImprovement) {
    return `Next improvement: ${context.topImprovement.title}. ${shorten(
      context.topImprovement.description,
      22
    )} Keep it narrow before later automation layers.`;
  }

  return "Next improvement: strengthen one contract, fallback, or review rule. Keep the graph useful as a text walkthrough before adding later automation layers.";
}

function segment(
  kind: NarrationSegmentKind,
  title: string,
  text: string,
  relatedNodeIds: string[] = [],
  relatedIssueIds: string[] = []
): NarrationSegment {
  return {
    id: kind.replaceAll("_", "-"),
    kind,
    title,
    text,
    related_node_ids: uniqueIds(relatedNodeIds).slice(0, 6),
    related_issue_ids: uniqueIds(relatedIssueIds).slice(0, 4),
    target_duration_seconds: Math.min(20, Math.max(6, estimateSpeechSeconds(text)))
  };
}

function validateReferences(
  script: NarrationScript,
  { graph, validation }: NarrationReferenceInput
) {
  const errors: string[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const issueIds = new Set(validation.issues.map((issue) => issue.id));
  const scriptText = [
    script.title,
    script.simulation_notice,
    ...script.segments.map((segment) => `${segment.title} ${segment.text}`)
  ]
    .join(" ")
    .toLowerCase();

  if (script.graph_id !== graph.id) {
    errors.push(`script.graph_id must match graph id ${graph.id}.`);
  }

  for (const segment of script.segments) {
    for (const nodeId of segment.related_node_ids) {
      if (!nodeIds.has(nodeId)) {
        errors.push(`Segment ${segment.id} references unknown node ${nodeId}.`);
      }
    }

    for (const issueId of segment.related_issue_ids) {
      if (!issueIds.has(issueId)) {
        errors.push(`Segment ${segment.id} references unknown issue ${issueId}.`);
      }
    }
  }

  if (
    graph.nodes.some((node) => node.type === "retrieval") &&
    !matchesAny(scriptText, ["retrieval", "retrieve", "ground"])
  ) {
    errors.push("Script must explain retrieval or grounding because the graph includes retrieval.");
  }

  if (graph.task_profile.requires_citations && !scriptText.includes("citation")) {
    errors.push("Script must mention citations because the graph requires citations.");
  }

  if (
    (graph.task_profile.requires_human_review ||
      graph.nodes.some((node) => node.type === "human_review")) &&
    !matchesAny(scriptText, ["human review", "reviewer", "manual review"])
  ) {
    errors.push("Script must mention human review because the graph includes review requirements.");
  }

  if (
    (graph.task_profile.privacy_sensitivity === "high" || graph.nodes.some(hasSensitivePort)) &&
    !matchesAny(scriptText, ["privacy", "private", "retention", "deletion", "sensitive"])
  ) {
    errors.push("Script must mention privacy or sensitive-data handling.");
  }

  if (!matchesAny(scriptText, ["cost", "latency", "waiting time"])) {
    errors.push("Script must mention cost or latency tradeoffs.");
  }

  if (!matchesAny(scriptText, ["reliability", "reliable", "verify", "verification", "fallback"])) {
    errors.push("Script must mention reliability, verification, or fallback behavior.");
  }

  return errors;
}

function selectHighestSignalIssue(issues: ValidationIssue[]) {
  return [...issues].sort(
    (left, right) =>
      severityRank[right.severity] - severityRank[left.severity] ||
      Math.abs(right.score_impact?.delta ?? 0) -
        Math.abs(left.score_impact?.delta ?? 0) ||
      left.title.localeCompare(right.title)
  )[0];
}

function selectHighestNodeRisk(graph: ArchitectureGraph, highestIssue?: ValidationIssue) {
  const issueNode = highestIssue?.affected_node_ids
    .map((id) => graph.nodes.find((node) => node.id === id))
    .find(isPresent);

  if (issueNode?.risks[0]) {
    return { node: issueNode, risk: issueNode.risks[0] };
  }

  return (
    graph.nodes
      .flatMap((node) => node.risks.map((risk) => ({ node, risk })))
      .sort(
        (left, right) =>
          severityRank[right.risk.severity] - severityRank[left.risk.severity] ||
          left.node.name.localeCompare(right.node.name)
      )[0] ?? { node: undefined, risk: undefined }
  );
}

function selectTopImprovement(primary: ScoreReason[], secondary: ScoreReason[]) {
  return [...primary, ...secondary].find((reason) => reason.title && reason.description);
}

function idsFromImprovement(improvement: ScoreReason | undefined, issues: ValidationIssue[]) {
  const ids = improvement?.related_issue_ids ?? [];
  const validIssueIds = new Set(issues.map((issue) => issue.id));
  return ids.filter((id) => validIssueIds.has(id));
}

function issueNodeIds(issueIds: string[], issues: ValidationIssue[]) {
  const issueMap = new Map(issues.map((issue) => [issue.id, issue]));
  return issueIds.flatMap((id) => issueMap.get(id)?.affected_node_ids ?? []);
}

function unwrapScript(candidate: unknown) {
  return isRecord(candidate) && "script" in candidate ? candidate.script : candidate;
}

function nodeText(node: ArchitectureNode) {
  return JSON.stringify({
    name: node.name,
    description: node.description,
    config: node.config,
    risks: node.risks,
    explanation_for_beginner: node.explanation_for_beginner
  }).toLowerCase();
}

function hasSensitivePort(node: ArchitectureNode) {
  return [...node.inputs, ...node.outputs].some((port) => port.sensitive);
}

function joinNames(names: string[]) {
  return names.length <= 1
    ? names[0] ?? "the visible nodes"
    : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function uniqueIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(isPresent))];
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function shorten(value: string, maxWords: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? value.trim() : `${words.slice(0, maxWords).join(" ")}.`;
}

function matchesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
