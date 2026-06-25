import type {
  ArchitectureEdge,
  ArchitectureGraph,
  ArchitectureNode,
  EstimateLevel,
  NodeType,
  RiskLevel,
  Severity
} from "@/shared/types/graph";
import type {
  ValidationIssue,
  ValidationResult,
  ValidationScoreImpact
} from "@/shared/types/validation";

type RuleSeverity = Exclude<Severity, "info"> | "info";

interface RuleContext {
  graph: ArchitectureGraph;
  nodeIds: Set<string>;
  nodesById: Map<string, ArchitectureNode>;
  incoming: Map<string, ArchitectureEdge[]>;
  outgoing: Map<string, ArchitectureEdge[]>;
}

interface RuleIssueInput {
  ruleId: string;
  severity: RuleSeverity;
  title: string;
  description: string;
  affectedNodeIds?: string[];
  recommendation: string;
  scoreImpact?: ValidationScoreImpact;
  autoFixPossible?: boolean;
}

const highEstimate: EstimateLevel[] = ["high"];
const elevatedRisk: RiskLevel[] = ["medium", "high"];
const highRisk: RiskLevel[] = ["high"];

export function validateArchitectureGraph(
  graph: ArchitectureGraph
): ValidationResult {
  const context = buildContext(graph);
  const issues = [
    ...validateStructure(context),
    ...validateModelGuardrails(context),
    ...validateKnowledgeAndCitations(context),
    ...validateRiskReview(context),
    ...validateTools(context),
    ...validatePrivacyAndMemory(context),
    ...validateComplexityAndCost(context),
    ...validateOutputBehavior(context)
  ];

  return {
    graph_id: graph.id,
    issues: dedupeIssues(issues)
  };
}

export function groupIssuesByNode(
  issues: ValidationIssue[]
): Map<string, ValidationIssue[]> {
  const grouped = new Map<string, ValidationIssue[]>();

  for (const issue of issues) {
    for (const nodeId of issue.affected_node_ids) {
      const existing = grouped.get(nodeId) ?? [];
      grouped.set(nodeId, [...existing, issue]);
    }
  }

  return grouped;
}

export function getHighestIssueSeverity(
  issues: ValidationIssue[]
): Severity | null {
  return issues.reduce<Severity | null>((highest, issue) => {
    if (!highest || severityRank(issue.severity) > severityRank(highest)) {
      return issue.severity;
    }

    return highest;
  }, null);
}

function validateStructure(context: RuleContext) {
  const issues: ValidationIssue[] = [];
  const { graph, nodeIds } = context;

  if (!graph.nodes.some((node) => node.type === "input")) {
    issues.push(
      issue({
        ruleId: "missing-input-node",
        severity: "critical",
        title: "Missing input node",
        description:
          "The graph does not show how user data or requests enter the system.",
        recommendation:
          "Add at least one input node for the main user request, document upload, or event source.",
        scoreImpact: { dimension: "maintainability", delta: -16 }
      })
    );
  }

  if (!graph.nodes.some((node) => node.type === "output")) {
    issues.push(
      issue({
        ruleId: "missing-output-node",
        severity: "critical",
        title: "Missing output node",
        description:
          "The graph does not show what final response, decision, or artifact reaches the user.",
        recommendation:
          "Add an output node that names the final user-visible result and its format.",
        scoreImpact: { dimension: "task_fit", delta: -16 }
      })
    );
  }

  for (const edge of graph.edges) {
    const missingSource = !nodeIds.has(edge.source);
    const missingTarget = !nodeIds.has(edge.target);

    if (missingSource || missingTarget) {
      issues.push(
        issue({
          ruleId: "broken-edge-reference",
          severity: "critical",
          title: "Broken edge reference",
          description: `Edge "${edge.label}" references ${
            missingSource && missingTarget
              ? "missing source and target nodes"
              : missingSource
                ? `missing source node "${edge.source}"`
                : `missing target node "${edge.target}"`
          }.`,
          affectedNodeIds: [edge.source, edge.target].filter((id) =>
            nodeIds.has(id)
          ),
          recommendation:
            "Reconnect the edge to existing nodes or remove the stale edge.",
          scoreImpact: { dimension: "maintainability", delta: -20 },
          autoFixPossible: false
        })
      );
    }
  }

  if (graph.nodes.length > 1) {
    for (const node of graph.nodes) {
      const connected =
        validIncoming(context, node.id).length + validOutgoing(context, node.id).length;

      if (connected === 0) {
        issues.push(
          issue({
            ruleId: "isolated-node",
            severity: "error",
            title: "Isolated node",
            description: `${node.name} is not connected to the rest of the architecture.`,
            affectedNodeIds: [node.id],
            recommendation:
              "Connect this node to the data or control flow, or remove it if it is not part of the MVP.",
            scoreImpact: { dimension: "maintainability", delta: -12 }
          })
        );
      }
    }
  }

  return issues;
}

function validateModelGuardrails(context: RuleContext) {
  const issues: ValidationIssue[] = [];
  const llmNodes = nodesOfType(context, "llm");

  for (const node of llmNodes) {
    const hasPromptPredecessor = ancestorsOf(context, node.id).some(
      (ancestor) => ancestor.type === "prompt"
    );
    const describesInstructions = textOf(node).includes("instruction");

    if (!hasPromptPredecessor && !describesInstructions) {
      issues.push(
        issue({
          ruleId: "llm-without-prompt",
          severity: "error",
          title: "LLM has no prompt layer",
          description: `${node.name} receives work without a visible prompt or instruction layer.`,
          affectedNodeIds: [node.id],
          recommendation:
            "Add a prompt node before the LLM that states grounding, output format, and uncertainty behavior.",
          scoreImpact: { dimension: "reliability", delta: -14 }
        })
      );
    }
  }

  return issues;
}

function validateKnowledgeAndCitations(context: RuleContext) {
  const issues: ValidationIssue[] = [];
  const { graph } = context;
  const knowledgeHeavy = highRisk.includes(graph.task_profile.knowledge_intensity);
  const sourceDependent = isSourceDependentTask(graph);

  if (knowledgeHeavy && nodesOfType(context, "retrieval").length === 0) {
    issues.push(
      issue({
        ruleId: "knowledge-task-without-retrieval",
        severity: "error",
        title: "Knowledge-heavy task lacks retrieval",
        description:
          "The task profile says the architecture depends heavily on knowledge, but no retrieval node is present.",
        recommendation:
          "Add retrieval so the LLM can use approved sources instead of relying on general model memory.",
        scoreImpact: { dimension: "reliability", delta: -16 }
      })
    );
  }

  if (knowledgeHeavy && nodesOfType(context, "knowledge_base").length === 0) {
    issues.push(
      issue({
        ruleId: "knowledge-task-without-knowledge-base",
        severity: "error",
        title: "Knowledge-heavy task lacks a knowledge base",
        description:
          "The architecture needs approved source material but has no knowledge base node.",
        recommendation:
          "Add a knowledge base that stores approved source material, metadata, and retention assumptions.",
        scoreImpact: { dimension: "task_fit", delta: -14 }
      })
    );
  }

  if (isCitationTask(graph) && !hasCitationVerifier(context)) {
    issues.push(
      issue({
        ruleId: "citation-task-without-verifier",
        severity: "critical",
        title: "Citation task lacks a citation verifier",
        description:
          "The task requires citations, but the graph has no evaluator that checks claim-source alignment.",
        recommendation:
          "Add a citation verifier after the answer LLM and before final output or human review.",
        scoreImpact: { dimension: "reliability", delta: -22 }
      })
    );
  }

  for (const retrieval of nodesOfType(context, "retrieval")) {
    if (!hasFallbackBehavior(context, retrieval)) {
      issues.push(
        issue({
          ruleId: "retrieval-without-fallback",
          severity: "warning",
          title: "Retrieval has no fallback behavior",
          description: `${retrieval.name} does not say what happens when no relevant source is found.`,
          affectedNodeIds: [retrieval.id],
          recommendation:
            "Add a fallback such as asking for more context, escalating, or answering with uncertainty.",
          scoreImpact: { dimension: "reliability", delta: -8 }
        })
      );
    }
  }

  if (sourceDependent && !finalOutputShowsSources(context)) {
    issues.push(
      issue({
        ruleId: "source-dependent-output-without-source-display",
        severity: "warning",
        title: "Source-dependent answer lacks source display",
        description:
          "This architecture depends on retrieved or cited sources, but the final output does not clearly promise source display.",
        affectedNodeIds: nodesOfType(context, "output").map((node) => node.id),
        recommendation:
          "Update the output format to show citations, source links, verification status, or retrieved evidence labels.",
        scoreImpact: { dimension: "user_control", delta: -8 }
      })
    );
  }

  return issues;
}

function validateRiskReview(context: RuleContext) {
  const issues: ValidationIssue[] = [];
  const { graph } = context;

  if (!highRisk.includes(graph.task_profile.risk_level)) {
    return issues;
  }

  for (const output of nodesOfType(context, "output")) {
    const ancestors = ancestorsOf(context, output.id);

    if (!ancestors.some((node) => node.type === "evaluator")) {
      issues.push(
        issue({
          ruleId: "high-risk-output-without-evaluator",
          severity: "critical",
          title: "High-risk output lacks evaluator",
          description: `${output.name} can be reached without a visible evaluator checkpoint.`,
          affectedNodeIds: [output.id],
          recommendation:
            "Route high-risk drafts through an evaluator that checks policy, evidence, safety, or quality before output.",
          scoreImpact: { dimension: "reliability", delta: -20 }
        })
      );
    }

    if (!ancestors.some((node) => node.type === "human_review")) {
      issues.push(
        issue({
          ruleId: "high-risk-output-without-human-review",
          severity: "critical",
          title: "High-risk output lacks human review",
          description: `${output.name} can be reached without a human approval or escalation step.`,
          affectedNodeIds: [output.id],
          recommendation:
            "Add a human review node before final output for high-trust, sensitive, or irreversible outcomes.",
          scoreImpact: { dimension: "user_control", delta: -20 }
        })
      );
    }
  }

  for (const edge of context.graph.edges) {
    const source = context.nodesById.get(edge.source);
    const target = context.nodesById.get(edge.target);

    if (source?.type === "llm" && target?.type === "output") {
      issues.push(
        issue({
          ruleId: "high-risk-llm-direct-to-output",
          severity: "critical",
          title: "High-risk LLM connects directly to output",
          description: `${source.name} sends content straight to ${target.name}.`,
          affectedNodeIds: [source.id, target.id],
          recommendation:
            "Insert an evaluator, verification step, or human review gate between the LLM and final output.",
          scoreImpact: { dimension: "reliability", delta: -22 }
        })
      );
    }
  }

  return issues;
}

function validateTools(context: RuleContext) {
  const issues: ValidationIssue[] = [];
  const toolNodes = nodesOfType(context, "tool");

  for (const tool of toolNodes) {
    const text = textOf(tool);

    if (!matchesAny(text, ["permission", "approve", "approval", "human", "allow"])) {
      issues.push(
        issue({
          ruleId: "tool-without-permission-gate",
          severity: "error",
          title: "Tool lacks a permission gate",
          description: `${tool.name} does not show how tool use is approved or constrained.`,
          affectedNodeIds: [tool.id],
          recommendation:
            "Add a permission gate, approval setting, or human review path before risky tool actions.",
          scoreImpact: { dimension: "user_control", delta: -14 }
        })
      );
    }

    if (isIrreversibleTool(tool) && !hasHumanReviewNear(context, tool.id)) {
      issues.push(
        issue({
          ruleId: "irreversible-action-without-human-review",
          severity: "critical",
          title: "Irreversible action lacks human review",
          description: `${tool.name} appears able to perform sensitive or irreversible actions without a review gate.`,
          affectedNodeIds: [tool.id],
          recommendation:
            "Require explicit human approval before refunds, account changes, deletions, sends, or external actions.",
          scoreImpact: { dimension: "user_control", delta: -22 }
        })
      );
    }

    if (!hasFailureHandling(context, tool)) {
      issues.push(
        issue({
          ruleId: "tool-without-failure-handling",
          severity: "warning",
          title: "Tool lacks failure handling",
          description: `${tool.name} does not describe retries, fallback, escalation, or timeout behavior.`,
          affectedNodeIds: [tool.id],
          recommendation:
            "Add a tool failure path, timeout, fallback response, or escalation route.",
          scoreImpact: { dimension: "reliability", delta: -8 }
        })
      );
    }

    if (!hasInputValidation(tool)) {
      issues.push(
        issue({
          ruleId: "tool-without-input-validation",
          severity: "warning",
          title: "Tool lacks input validation",
          description: `${tool.name} does not make input validation or allowed action constraints explicit.`,
          affectedNodeIds: [tool.id],
          recommendation:
            "Add schema checks, allowlists, confidence thresholds, or action constraints before the tool executes.",
          scoreImpact: { dimension: "maintainability", delta: -7 }
        })
      );
    }
  }

  return issues;
}

function validatePrivacyAndMemory(context: RuleContext) {
  const issues: ValidationIssue[] = [];
  const { graph } = context;
  const sensitiveTask = elevatedRisk.includes(
    graph.task_profile.privacy_sensitivity ?? "low"
  );
  const hasSensitivePorts = graph.nodes.some(hasSensitivePort);

  for (const memory of nodesOfType(context, "memory")) {
    if (!graph.task_profile.requires_memory) {
      issues.push(
        issue({
          ruleId: "memory-used-when-not-needed",
          severity: "warning",
          title: "Memory is used when task profile says it is not needed",
          description: `${memory.name} adds stored state even though the task profile does not require memory.`,
          affectedNodeIds: [memory.id],
          recommendation:
            "Remove memory for the MVP or update the task profile if persistent personalization is truly required.",
          scoreImpact: { dimension: "cost_efficiency", delta: -7 }
        })
      );
    }

    if ((hasSensitivePort(memory) || sensitiveTask) && !hasRetentionControls(memory)) {
      issues.push(
        issue({
          ruleId: "sensitive-memory-without-retention-controls",
          severity: "critical",
          title: "Sensitive memory lacks retention controls",
          description: `${memory.name} can store sensitive data without clear retention, deletion, or consent controls.`,
          affectedNodeIds: [memory.id],
          recommendation:
            "Add a retention policy, delete/reset control, and explicit consent boundary for memory.",
          scoreImpact: { dimension: "privacy", delta: -22 }
        })
      );
    }
  }

  for (const knowledgeBase of nodesOfType(context, "knowledge_base")) {
    if (hasSensitivePort(knowledgeBase) && !hasRetentionControls(knowledgeBase)) {
      issues.push(
        issue({
          ruleId: "private-knowledge-base-without-retention-policy",
          severity: "error",
          title: "Private knowledge base lacks retention policy",
          description: `${knowledgeBase.name} stores sensitive source material without a visible retention or deletion policy.`,
          affectedNodeIds: [knowledgeBase.id],
          recommendation:
            "Add retention settings, deletion support, or a session-only storage assumption.",
          scoreImpact: { dimension: "privacy", delta: -16 }
        })
      );
    }
  }

  if (sensitiveTask || hasSensitivePorts) {
    const hasMinimization =
      nodesOfType(context, "privacy_filter").length > 0 ||
      graph.nodes.some((node) =>
        matchesAny(textOf(node), ["redact", "redaction", "minimize", "minimization"])
      );

    if (!hasMinimization) {
      issues.push(
        issue({
          ruleId: "sensitive-task-without-minimization",
          severity: "warning",
          title: "Sensitive task lacks data minimization",
          description:
            "Sensitive data appears in the graph, but no redaction, privacy filter, or minimization behavior is visible.",
          recommendation:
            "Add a privacy filter or document how unnecessary sensitive fields are removed before model/tool calls.",
          scoreImpact: { dimension: "privacy", delta: -10 }
        })
      );
    }
  }

  return issues;
}

function validateComplexityAndCost(context: RuleContext) {
  const issues: ValidationIssue[] = [];
  const { graph } = context;
  const llmCount = nodesOfType(context, "llm").length;
  const evaluatorCount = nodesOfType(context, "evaluator").length;
  const toolCount = nodesOfType(context, "tool").length;
  const highCostNodes = graph.nodes.filter(
    (node) => node.cost_estimate.relative === "high"
  );
  const highLatencyNodes = graph.nodes.filter(
    (node) => node.latency_estimate.relative === "high"
  );
  const estimatedSeconds = graph.nodes.reduce(
    (total, node) => total + (node.latency_estimate.estimated_seconds ?? 0),
    0
  );

  if (graph.nodes.length > 12) {
    issues.push(
      issue({
        ruleId: "too-many-nodes-for-mvp",
        severity: "info",
        title: "Graph may be large for an MVP",
        description: `The graph has ${graph.nodes.length} nodes. That may be harder for a beginner to build and explain.`,
        affectedNodeIds: graph.nodes.slice(12).map((node) => node.id),
        recommendation:
          "Keep the improved architecture, but consider marking a simpler MVP slice for first implementation.",
        scoreImpact: { dimension: "cost_efficiency", delta: -5 }
      })
    );
  }

  if (highCostNodes.length > 0 || llmCount + evaluatorCount > 4 || toolCount > 2) {
    issues.push(
      issue({
        ruleId: "excessive-estimated-cost",
        severity: "warning",
        title: "Estimated cost may be high",
        description:
          "The graph uses multiple model, evaluator, tool, or high-cost nodes that can make each run expensive.",
        affectedNodeIds: [
          ...highCostNodes.map((node) => node.id),
          ...nodesOfType(context, "llm").map((node) => node.id),
          ...nodesOfType(context, "evaluator").map((node) => node.id)
        ],
        recommendation:
          "Add caching, batching, lower-cost alternatives, or a simplified MVP path for routine requests.",
        scoreImpact: { dimension: "cost_efficiency", delta: -10 }
      })
    );
  }

  if (highLatencyNodes.length > 1 || estimatedSeconds > 24) {
    issues.push(
      issue({
        ruleId: "high-latency-path",
        severity: "warning",
        title: "Latency path may feel slow",
        description:
          "The estimated latency across the graph is high enough to affect the demo or user experience.",
        affectedNodeIds: highLatencyNodes.map((node) => node.id),
        recommendation:
          "Use parallelizable steps, caching, streaming output, or a shorter MVP path where possible.",
        scoreImpact: { dimension: "cost_efficiency", delta: -8 }
      })
    );
  }

  if (
    graph.task_profile.risk_level === "low" &&
    (llmCount > 2 || evaluatorCount > 1 || nodesOfType(context, "router").length > 0)
  ) {
    issues.push(
      issue({
        ruleId: "unnecessary-multi-agent-complexity",
        severity: "warning",
        title: "Architecture may be overcomplicated",
        description:
          "The task profile is low risk, but the graph adds extra model, evaluator, or routing complexity.",
        recommendation:
          "Prefer a smaller single-path MVP unless the user requirement needs this complexity.",
        scoreImpact: { dimension: "maintainability", delta: -9 }
      })
    );
  }

  return issues;
}

function validateOutputBehavior(context: RuleContext) {
  const issues: ValidationIssue[] = [];
  const { graph } = context;

  for (const output of nodesOfType(context, "output")) {
    if (!hasOutputFormat(output)) {
      issues.push(
        issue({
          ruleId: "unclear-output-format",
          severity: "error",
          title: "Output format is unclear",
          description: `${output.name} does not define a concrete response format.`,
          affectedNodeIds: [output.id],
          recommendation:
            "Specify whether the final output is markdown, JSON, a reviewed answer, a customer reply, a plan, or another clear format.",
          scoreImpact: { dimension: "task_fit", delta: -12 }
        })
      );
    }
  }

  const needsUncertainty =
    highRisk.includes(graph.task_profile.risk_level) ||
    highRisk.includes(graph.task_profile.knowledge_intensity) ||
    Boolean(graph.task_profile.requires_citations);

  if (needsUncertainty && !graph.nodes.some(hasUncertaintyBehavior)) {
    issues.push(
      issue({
        ruleId: "no-uncertainty-behavior",
        severity: "warning",
        title: "No uncertainty behavior",
        description:
          "The architecture does not say what the system should do when evidence is missing, confidence is low, or a check fails.",
        recommendation:
          "Add uncertainty behavior to the prompt, evaluator, retrieval fallback, or final output.",
        scoreImpact: { dimension: "reliability", delta: -9 }
      })
    );
  }

  return issues;
}

function buildContext(graph: ArchitectureGraph): RuleContext {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, ArchitectureEdge[]>();
  const outgoing = new Map<string, ArchitectureEdge[]>();

  for (const edge of graph.edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  }

  return { graph, nodeIds, nodesById, incoming, outgoing };
}

function issue(input: RuleIssueInput): ValidationIssue {
  return {
    id: `${input.ruleId}-${stableId(input.affectedNodeIds ?? [])}`,
    rule_id: input.ruleId,
    severity: input.severity,
    title: input.title,
    description: input.description,
    affected_node_ids: input.affectedNodeIds ?? [],
    recommendation: input.recommendation,
    score_impact: input.scoreImpact,
    auto_fix_possible: input.autoFixPossible ?? false
  };
}

function dedupeIssues(issues: ValidationIssue[]) {
  const seen = new Set<string>();
  const sorted = [...issues].sort(
    (left, right) =>
      severityRank(right.severity) - severityRank(left.severity) ||
      left.rule_id.localeCompare(right.rule_id)
  );

  return sorted.filter((candidate) => {
    const key = `${candidate.rule_id}:${candidate.affected_node_ids.join(",")}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function nodesOfType(context: RuleContext, type: NodeType) {
  return context.graph.nodes.filter((node) => node.type === type);
}

function validIncoming(context: RuleContext, nodeId: string) {
  return (context.incoming.get(nodeId) ?? []).filter((edge) =>
    context.nodeIds.has(edge.source)
  );
}

function validOutgoing(context: RuleContext, nodeId: string) {
  return (context.outgoing.get(nodeId) ?? []).filter((edge) =>
    context.nodeIds.has(edge.target)
  );
}

function ancestorsOf(context: RuleContext, nodeId: string) {
  const visited = new Set<string>();
  const stack = validIncoming(context, nodeId).map((edge) => edge.source);
  const ancestors: ArchitectureNode[] = [];

  while (stack.length > 0) {
    const currentId = stack.pop();

    if (!currentId || visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    const node = context.nodesById.get(currentId);

    if (node) {
      ancestors.push(node);
      stack.push(...validIncoming(context, currentId).map((edge) => edge.source));
    }
  }

  return ancestors;
}

function hasCitationVerifier(context: RuleContext) {
  return nodesOfType(context, "evaluator").some((node) => {
    const text = textOf(node);
    return (
      matchesAny(text, ["citation", "source", "claim"]) &&
      matchesAny(text, ["verify", "verifier", "alignment", "support"])
    );
  });
}

function hasFallbackBehavior(context: RuleContext, node: ArchitectureNode) {
  return (
    matchesAny(textOf(node), ["fallback", "when_empty", "no relevant", "escalate"]) ||
    validOutgoing(context, node.id).some((edge) => edge.kind === "fallback_flow")
  );
}

function hasFailureHandling(context: RuleContext, node: ArchitectureNode) {
  return (
    matchesAny(textOf(node), ["fallback", "failure", "retry", "timeout", "escalate"]) ||
    validOutgoing(context, node.id).some((edge) => edge.kind === "fallback_flow")
  );
}

function hasInputValidation(node: ArchitectureNode) {
  return matchesAny(textOf(node), [
    "validation",
    "validate",
    "schema",
    "allowlist",
    "allowed",
    "confidence",
    "requires_human_for",
    "irreversible_actions_allowed"
  ]);
}

function isIrreversibleTool(node: ArchitectureNode) {
  const text = textOf(node);

  if (node.config.irreversible_actions_allowed === false) {
    return false;
  }

  return matchesAny(text, [
    "irreversible",
    "refund",
    "billing_change",
    "account_change",
    "delete",
    "send",
    "external action"
  ]);
}

function hasHumanReviewNear(context: RuleContext, nodeId: string) {
  return (
    ancestorsOf(context, nodeId).some((node) => node.type === "human_review") ||
    validOutgoing(context, nodeId).some(
      (edge) => context.nodesById.get(edge.target)?.type === "human_review"
    )
  );
}

function hasSensitivePort(node: ArchitectureNode) {
  return [...node.inputs, ...node.outputs].some((port) => port.sensitive);
}

function hasRetentionControls(node: ArchitectureNode) {
  const configText = JSON.stringify(node.config).toLowerCase();

  return matchesAny(configText, [
    "retention",
    "delete",
    "deletion",
    "reset",
    "consent",
    "store_full_notes\":false",
    "session-only",
    "local draft"
  ]);
}

function hasOutputFormat(node: ArchitectureNode) {
  const outputText = [
    node.name,
    node.description,
    ...node.outputs.flatMap((output) => [
      output.name,
      output.description,
      output.format ?? ""
    ]),
    ...collectTextValues(node.config),
    ...node.risks.flatMap((risk) => [
      risk.risk_type,
      risk.description,
      risk.mitigation
    ]),
    ...node.alternatives.flatMap((alternative) => [
      alternative.name,
      alternative.tradeoff,
      alternative.when_to_use ?? ""
    ]),
    node.explanation_for_beginner
  ].join(" ");

  return (
    "output_format" in node.config ||
    node.outputs.some((output) => Boolean(output.format)) ||
    matchesAny(outputText, ["markdown", "json", "format", "reply", "answer", "plan"])
  );
}

function collectTextValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextValues(item));
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => collectTextValues(item));
  }

  return [];
}

function hasUncertaintyBehavior(node: ArchitectureNode) {
  return matchesAny(textOf(node), [
    "uncertainty",
    "confidence",
    "missing",
    "unsupported",
    "could not be found",
    "say when",
    "low-confidence"
  ]);
}

function finalOutputShowsSources(context: RuleContext) {
  return nodesOfType(context, "output").some((node) =>
    matchesAny(textOf(node), [
      "source",
      "sources",
      "citation",
      "citations",
      "reference",
      "verification"
    ])
  );
}

function isCitationTask(graph: ArchitectureGraph) {
  return (
    Boolean(graph.task_profile.requires_citations) ||
    matchesAny(graph.task_profile.task_type, ["research", "citation", "paper"]) ||
    matchesAny(graph.user_idea, ["citation", "cite", "paper", "research"])
  );
}

function isSourceDependentTask(graph: ArchitectureGraph) {
  return (
    graph.task_profile.knowledge_intensity === "high" ||
    Boolean(graph.task_profile.requires_citations) ||
    graph.nodes.some((node) => node.type === "retrieval")
  );
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

function stableId(values: string[]) {
  return values.length > 0 ? values.sort().join("-") : "graph";
}

function severityRank(severity: Severity) {
  return {
    info: 0,
    warning: 1,
    error: 2,
    critical: 3
  }[severity];
}
