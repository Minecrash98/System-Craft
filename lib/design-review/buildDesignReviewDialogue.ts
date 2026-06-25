import { designReviewDialogueSchema } from "./schema";
import type {
  DesignReviewBuildInput,
  DesignReviewDialogue,
  DesignReviewLesson,
  DesignReviewReferenceInput,
  DesignReviewTurn,
  DesignReviewValidationResult
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

export function buildDeterministicDesignReviewDialogue(
  input: DesignReviewBuildInput
) {
  const context = buildContext(input.graph, input.validation, input.score);
  const turns: DesignReviewTurn[] = [
    turn(
      "turn-1-builder",
      "builder",
      `I would keep the improved path because ${input.graph.title} turns a vague idea into explicit evidence, generation, verification, and review steps. The naive baseline hides those boundaries.`,
      context.anchorNodeIds
    ),
    turn(
      "turn-2-reviewer",
      "reviewer",
      concreteChallengeText(context),
      context.challengeNodeIds,
      context.challengeIssueIds
    ),
    turn(
      "turn-3-builder",
      "builder",
      groundingDefenseText(context),
      context.groundingNodeIds
    ),
    turn(
      "turn-4-reviewer",
      "reviewer",
      privacyTradeoffText(context),
      context.privacyNodeIds,
      context.privacyIssueIds
    ),
    turn(
      "turn-5-mentor",
      "mentor",
      controlCostLessonText(context),
      context.tradeoffNodeIds,
      context.tradeoffIssueIds
    ),
    turn(
      "turn-6-reviewer",
      "reviewer",
      improvementChallengeText(context),
      context.improvementNodeIds,
      context.improvementIssueIds
    ),
    turn(
      "turn-7-mentor",
      "mentor",
      "Transferable lesson: separate evidence gathering, model drafting, verification, and human judgment. That makes risk inspectable before users trust the final answer.",
      context.lessonNodeIds
    )
  ];
  const lessons: DesignReviewLesson[] = [
    lesson(
      "lesson-evidence-before-answer",
      "Evidence before answers",
      "For source-heavy work, make retrieval and citation checks visible before the output. A polished answer should not be the first evidence the user sees.",
      context.groundingNodeIds
    ),
    lesson(
      "lesson-tradeoffs-stay-visible",
      "Tradeoffs stay visible",
      "Privacy, user control, cost, and latency are design choices, not afterthoughts. Name the boundary and the reason for every added checkpoint.",
      context.tradeoffNodeIds,
      context.tradeoffIssueIds
    )
  ];
  const candidate: DesignReviewDialogue = {
    id: `${slug(input.graph.id)}-design-review`,
    graph_id: input.graph.id,
    version: "1.0.0",
    title: `${input.graph.title} design review`,
    source: "deterministic",
    review_notice:
      "This is a simulated design critique for an architecture graph. It is not a live execution, not proof of correctness, and does not call external systems.",
    turns,
    lessons
  };
  const validated = validateDesignReviewDialogueCandidate(candidate, {
    graph: input.graph,
    validation: input.validation
  });

  if (!validated.success) {
    throw new Error(
      `Deterministic design review failed validation: ${validated.errors.join("; ")}`
    );
  }

  return validated.dialogue;
}

export function validateDesignReviewDialogueCandidate(
  candidate: unknown,
  references: DesignReviewReferenceInput
): DesignReviewValidationResult {
  const parsed = designReviewDialogueSchema.safeParse(unwrapDialogue(candidate));

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "dialogue"}: ${issue.message}`
      )
    };
  }

  const referenceErrors = validateReferences(parsed.data, references);
  return referenceErrors.length > 0
    ? { success: false, errors: referenceErrors }
    : { success: true, dialogue: parsed.data };
}

function buildContext(
  graph: ArchitectureGraph,
  validation: DesignReviewBuildInput["validation"],
  score: DesignReviewBuildInput["score"]
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
  const citationVerifier = findCitationVerifierNode(graph) ?? byType("evaluator")[0];
  const humanReview = byType("human_review")[0];
  const privacyNode =
    byType("privacy_filter")[0] ??
    graph.nodes.find((node) => hasSensitivePort(node) || nodeText(node).includes("privacy"));
  const costNode =
    graph.nodes.find((node) =>
      ["medium", "high"].includes(node.cost_estimate.relative)
    ) ??
    graph.nodes.find((node) =>
      ["medium", "high"].includes(node.latency_estimate.relative)
    ) ??
    llm;
  const highestIssue = selectHighestSignalIssue(validation.issues);
  const topImprovement = selectTopImprovement(
    score.improvements,
    score.dimensions.flatMap((dimension) => dimension.improvements)
  );
  const improvementIssueIds = idsFromImprovement(topImprovement, validation.issues);
  const improvementNodeIds = [
    ...(topImprovement?.related_node_ids ?? []),
    ...issueNodeIds(improvementIssueIds, validation.issues),
    citationVerifier?.id,
    humanReview?.id
  ].filter(isPresent);
  const challengeIssueIds = highestIssue ? [highestIssue.id] : [];

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
    topImprovement,
    anchorNodeIds: uniqueIds([firstInput?.id, finalOutput?.id]),
    challengeNodeIds: uniqueIds([
      llm?.id,
      citationVerifier?.id,
      humanReview?.id,
      finalOutput?.id,
      ...(highestIssue?.affected_node_ids ?? [])
    ]).slice(0, 6),
    challengeIssueIds,
    groundingNodeIds: uniqueIds([
      knowledgeBase?.id,
      retrieval?.id,
      prompt?.id,
      llm?.id,
      citationVerifier?.id
    ]).slice(0, 6),
    privacyNodeIds: uniqueIds([
      privacyNode?.id,
      knowledgeBase?.id,
      firstInput?.id
    ]).slice(0, 6),
    privacyIssueIds: validation.issues
      .filter((issue) => issue.score_impact?.dimension === "privacy")
      .map((issue) => issue.id)
      .slice(0, 4),
    tradeoffNodeIds: uniqueIds([
      costNode?.id,
      citationVerifier?.id,
      humanReview?.id,
      retrieval?.id
    ]).slice(0, 6),
    tradeoffIssueIds: validation.issues
      .filter((issue) =>
        ["cost_efficiency", "user_control", "reliability"].includes(
          issue.score_impact?.dimension ?? ""
        )
      )
      .map((issue) => issue.id)
      .slice(0, 4),
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

function concreteChallengeText(context: ReturnType<typeof buildContext>) {
  if (context.citationVerifier) {
    const generator = context.llm?.name ?? "the answer generator";
    const review = context.humanReview
      ? ` and ${context.humanReview.name} must see the verification result`
      : "";

    return `The concrete choice I challenge is whether ${generator} can be trusted after retrieval alone. ${context.citationVerifier.name} must block unsupported citations${review}.`;
  }

  if (context.highestIssue) {
    return `The concrete choice I challenge is leaving ${context.highestIssue.title.toLowerCase()} unresolved. ${shorten(context.highestIssue.recommendation, 22)}`;
  }

  return "The concrete choice I challenge is treating the model output as final. Add a visible verifier or review step before the user trusts the result.";
}

function groundingDefenseText(context: ReturnType<typeof buildContext>) {
  const parts = [
    context.knowledgeBase?.name,
    context.retrieval?.name,
    context.prompt?.name,
    context.llm?.name
  ].filter(isPresent);

  if (parts.length > 0) {
    return `The defense is the grounded path: ${joinNames(parts)} keep the draft close to approved context before verification. That reduces unsupported answers without pretending retrieval is perfect.`;
  }

  return `The defense is explicit handoff: each node says what it receives, produces, and risks before ${context.finalOutput.name}. That makes the design inspectable.`;
}

function privacyTradeoffText(context: ReturnType<typeof buildContext>) {
  const privacy = context.privacyNode
    ? `${context.privacyNode.name} is the privacy boundary`
    : "the graph still needs a named privacy boundary";
  const storage = context.knowledgeBase
    ? `${context.knowledgeBase.name} stores approved source material`
    : "any source store needs retention rules";

  return `Privacy tradeoff: ${privacy}, while ${storage}. Keep retention, deletion, and sensitive-field handling visible before widening the workflow.`;
}

function controlCostLessonText(context: ReturnType<typeof buildContext>) {
  const verifier = context.citationVerifier
    ? `${context.citationVerifier.name} adds reliability`
    : "a verifier adds reliability";
  const review = context.humanReview
    ? `${context.humanReview.name} adds user control`
    : "human approval adds user control";
  const cost = context.costNode
    ? `${context.costNode.name} is a cost or latency driver`
    : "model and review work are cost or latency drivers";

  return `${verifier}; ${review}; ${cost}. The mentor move is to explain that these costs buy inspectable trust, not automatic correctness.`;
}

function improvementChallengeText(context: ReturnType<typeof buildContext>) {
  if (context.topImprovement) {
    return `Before adding later features, tighten this improvement: ${context.topImprovement.title}. ${shorten(context.topImprovement.description, 24)}`;
  }

  return "Before adding later features, tighten one contract: what happens when evidence is missing, confidence is low, or a reviewer rejects the answer.";
}

function turn(
  id: string,
  role: DesignReviewTurn["role"],
  text: string,
  relatedNodeIds: string[] = [],
  relatedIssueIds: string[] = []
): DesignReviewTurn {
  return {
    id,
    role,
    speaker: roleToSpeaker(role),
    text,
    related_node_ids: uniqueIds(relatedNodeIds).slice(0, 6),
    related_issue_ids: uniqueIds(relatedIssueIds).slice(0, 4)
  };
}

function lesson(
  id: string,
  title: string,
  text: string,
  relatedNodeIds: string[] = [],
  relatedIssueIds: string[] = []
): DesignReviewLesson {
  return {
    id,
    title,
    text,
    related_node_ids: uniqueIds(relatedNodeIds).slice(0, 6),
    related_issue_ids: uniqueIds(relatedIssueIds).slice(0, 4)
  };
}

function findCitationVerifierNode(graph: ArchitectureGraph) {
  const candidates = [
    ...graph.nodes.filter((node) => node.type === "evaluator"),
    ...graph.nodes
  ];

  return candidates.find((node) => {
    const text = nodeText(node);

    return (
      matchesAllTextReferences(text, ["citation", "verifier"]) ||
      matchesAllTextReferences(text, ["citation", "verify"]) ||
      matchesAllTextReferences(text, ["citation", "check"])
    );
  });
}
function validateReferences(
  dialogue: DesignReviewDialogue,
  { graph, validation }: DesignReviewReferenceInput
) {
  const errors: string[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const issueIds = new Set(validation.issues.map((issue) => issue.id));
  const dialogueText = [
    dialogue.title,
    dialogue.review_notice,
    ...dialogue.turns.map((turn) => `${turn.speaker} ${turn.text}`),
    ...dialogue.lessons.map((lesson) => `${lesson.title} ${lesson.text}`)
  ]
    .join(" ")
    .toLowerCase();
  const citationVerifier = findCitationVerifierNode(graph);

  if (dialogue.graph_id !== graph.id) {
    errors.push(`dialogue.graph_id must match graph id ${graph.id}.`);
  }

  for (const turn of dialogue.turns) {
    for (const nodeId of turn.related_node_ids) {
      if (!nodeIds.has(nodeId)) {
        errors.push(`Turn ${turn.id} references unknown node ${nodeId}.`);
      }
    }

    for (const issueId of turn.related_issue_ids) {
      if (!issueIds.has(issueId)) {
        errors.push(`Turn ${turn.id} references unknown issue ${issueId}.`);
      }
    }
  }

  for (const lessonItem of dialogue.lessons) {
    for (const nodeId of lessonItem.related_node_ids) {
      if (!nodeIds.has(nodeId)) {
        errors.push(`Lesson ${lessonItem.id} references unknown node ${nodeId}.`);
      }
    }

    for (const issueId of lessonItem.related_issue_ids) {
      if (!issueIds.has(issueId)) {
        errors.push(`Lesson ${lessonItem.id} references unknown issue ${issueId}.`);
      }
    }
  }

  if (
    graph.nodes.some((node) => node.type === "retrieval") &&
    !matchesTextReference(dialogueText, ["retrieval", "retrieve", "ground"])
  ) {
    errors.push("Dialogue must discuss retrieval or grounding because the graph includes retrieval.");
  }

  if (
    graph.task_profile.requires_citations &&
    !matchesTextReference(dialogueText, ["citation"])
  ) {
    errors.push("Dialogue must mention citations because the graph requires citations.");
  }

  if (
    citationVerifier &&
    !matchesTextReference(dialogueText, [
      citationVerifier.name,
      citationVerifier.id
    ])
  ) {
    errors.push(`Dialogue must name ${citationVerifier.name}.`);
  }

  if (
    (graph.task_profile.requires_human_review ||
      graph.nodes.some((node) => node.type === "human_review")) &&
    !matchesTextReference(dialogueText, [
      "human review",
      "human_review",
      "reviewer",
      "approval",
      "user control"
    ])
  ) {
    errors.push("Dialogue must mention human review or user control.");
  }

  if (
    (graph.task_profile.privacy_sensitivity === "high" || graph.nodes.some(hasSensitivePort)) &&
    !matchesTextReference(dialogueText, [
      "privacy",
      "private",
      "retention",
      "deletion",
      "sensitive"
    ])
  ) {
    errors.push("Dialogue must mention privacy or sensitive-data handling.");
  }

  if (!matchesTextReference(dialogueText, ["cost", "latency", "waiting time"])) {
    errors.push("Dialogue must mention cost or latency tradeoffs.");
  }

  if (!matchesTextReference(dialogueText, ["control", "approval", "review"])) {
    errors.push("Dialogue must mention user control, approval, or review.");
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

function unwrapDialogue(candidate: unknown) {
  return isRecord(candidate) && "dialogue" in candidate ? candidate.dialogue : candidate;
}

function nodeText(node: ArchitectureNode) {
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

function hasSensitivePort(node: ArchitectureNode) {
  return [...node.inputs, ...node.outputs].some((port) => port.sensitive);
}

function roleToSpeaker(role: DesignReviewTurn["role"]) {
  return {
    builder: "Builder",
    reviewer: "Reviewer",
    mentor: "Mentor"
  }[role];
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

function matchesAllTextReferences(value: string, references: string[]) {
  return references.every((reference) => matchesTextReference(value, [reference]));
}
function matchesTextReference(value: string, references: string[]) {
  const lowerValue = value.toLowerCase();
  const normalizedValue = normalizeReferenceText(value);

  return references.some((reference) => {
    const lowerReference = reference.toLowerCase();
    const normalizedReference = normalizeReferenceText(reference);

    return (
      lowerValue.includes(lowerReference) ||
      normalizedValue.includes(normalizedReference)
    );
  });
}

function normalizeReferenceText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
