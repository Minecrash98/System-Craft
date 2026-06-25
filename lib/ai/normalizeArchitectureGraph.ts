import type {
  ArchitectureEdge,
  ArchitectureGraph,
  ArchitectureNode,
  EdgeType,
  EstimateLevel,
  NodeType,
  RiskLevel
} from "@/shared/types/graph";

const nodeTypes: NodeType[] = [
  "input",
  "prompt",
  "llm",
  "knowledge_base",
  "retrieval",
  "tool",
  "memory",
  "human_review",
  "evaluator",
  "output",
  "transform",
  "router",
  "classifier",
  "privacy_filter",
  "fallback",
  "logger"
];

const edgeTypes: EdgeType[] = [
  "data_flow",
  "control_flow",
  "review_flow",
  "fallback_flow"
];

const riskLevels: RiskLevel[] = ["low", "medium", "high"];
const estimateLevels: EstimateLevel[] = ["none", "low", "medium", "high"];

export function normalizeArchitectureGraphCandidate(
  candidate: unknown,
  idea: string
): unknown {
  const graph = unwrapGraph(candidate);
  const graphRecord = Array.isArray(graph) ? { nodes: graph } : graph;

  if (!isRecord(graphRecord)) {
    return candidate;
  }

  const rawNodes =
    firstArray(graphRecord, ["nodes", "components", "services", "steps", "modules"]) ??
    [];
  const nodeIdMap = new Map<string, string>();
  const usedNodeIds = new Set<string>();
  const nodes = rawNodes.map((rawNode, index) => {
    const baseNode = normalizeNode(rawNode, index);
    const normalized = {
      ...baseNode,
      id: uniqueNodeId(baseNode.id, index, usedNodeIds)
    };

    if (isRecord(rawNode)) {
      for (const key of candidateNodeKeys(rawNode)) {
        if (typeof key === "string" && key.trim()) {
          nodeIdMap.set(key, normalized.id);
          nodeIdMap.set(slugify(key), normalized.id);
        }
      }
    }

    nodeIdMap.set(normalized.id, normalized.id);
    return normalized;
  });

  const rawEdges =
    firstArray(graphRecord, ["edges", "connections", "links", "flows", "data_flows"]) ??
    [];
  const edges = rawEdges
    .map((rawEdge, index) => normalizeEdge(rawEdge, index, nodeIdMap))
    .filter((edge): edge is ArchitectureEdge => edge !== null);

  return {
    id: stringOr(graphRecord.id, slugify(stringOr(graphRecord.title, "generated architecture"))),
    title: stringOr(firstValue(graphRecord, ["title", "name", "label"]), "Generated AI Architecture"),
    description: stringOr(
      firstValue(graphRecord, ["description", "summary", "overview"]),
      "AI application architecture generated from the submitted idea."
    ),
    version: stringOr(graphRecord.version, "1.0.0"),
    user_idea: stringOr(firstValue(graphRecord, ["user_idea", "idea", "userIdea"]), idea),
    assumptions: normalizeStringArray(firstValue(graphRecord, ["assumptions", "constraints", "defaults"]), [
      "Generated from the supplied idea and clarification answers."
    ]),
    task_profile: normalizeTaskProfile(firstValue(graphRecord, ["task_profile", "taskProfile", "profile"])),
    nodes,
    edges: edges.length > 0 ? edges : buildSequentialEdges(nodes),
    naive_baseline: normalizeNaiveBaseline(firstValue(graphRecord, ["naive_baseline", "naiveBaseline", "baseline"]))
  } satisfies ArchitectureGraph;
}

function unwrapGraph(candidate: unknown) {
  if (isRecord(candidate) && "graph" in candidate) {
    return candidate.graph;
  }

  if (!isRecord(candidate)) {
    return candidate;
  }

  for (const key of ["architecture", "architecture_graph", "system", "blueprint", "result"]) {
    if (candidate[key] !== undefined) {
      return candidate[key];
    }
  }

  return candidate;
}

function normalizeNode(rawNode: unknown, index: number): ArchitectureNode {
  const node = isRecord(rawNode) ? rawNode : {};
  const name = stringOr(
    firstValue(node, ["name", "label", "title", "component", "service"]),
    `Node ${index + 1}`
  );
  const id = stringOr(
    firstValue(node, ["id", "key", "name", "label", "title"]),
    slugify(name) || `node_${index + 1}`
  );
  const type = normalizeNodeType(
    firstValue(node, ["type", "kind", "role", "category"]),
    name
  );
  const position = normalizePosition(firstValue(node, ["position", "layout_position"]));

  return {
    id: slugify(id) || `node_${index + 1}`,
    type,
    name,
    description: stringOr(
      firstValue(node, ["description", "purpose", "responsibility", "summary", "details"]),
      `Handles the ${name.toLowerCase()} step in the architecture.`
    ),
    inputs: normalizePorts(firstValue(node, ["inputs", "input", "input_ports", "receives"])),
    outputs: normalizePorts(firstValue(node, ["outputs", "output", "output_ports", "emits"])),
    config: normalizeConfig(firstValue(node, ["config", "settings", "parameters"])),
    risks: normalizeRisks(firstValue(node, ["risks", "risk", "failure_modes", "failureModes"])),
    cost_estimate: normalizeEstimate(firstValue(node, ["cost_estimate", "costEstimate", "cost"])),
    latency_estimate: normalizeEstimate(firstValue(node, ["latency_estimate", "latencyEstimate", "latency"])),
    alternatives: normalizeAlternatives(firstValue(node, ["alternatives", "tradeoffs", "options"])),
    explanation_for_beginner: stringOr(
      firstValue(node, ["explanation_for_beginner", "beginner_explanation", "explanation", "rationale"]),
      `This component is responsible for ${name.toLowerCase()} in the system flow.`
    ),
    ...(position ? { position } : {})
  };
}

function normalizeEdge(
  rawEdge: unknown,
  index: number,
  nodeIdMap: Map<string, string>
): ArchitectureEdge | null {
  const edge = isRecord(rawEdge) ? rawEdge : {};
  const source = mapNodeId(
    firstValue(edge, ["source", "from", "start", "source_id", "sourceNode", "source_node"]),
    nodeIdMap
  );
  const target = mapNodeId(
    firstValue(edge, ["target", "to", "end", "target_id", "targetNode", "target_node"]),
    nodeIdMap
  );

  if (!source || !target) {
    return null;
  }

  const dataContract = firstValue(edge, ["data_contract", "dataContract", "contract"]);
  const condition = firstValue(edge, ["condition", "when"]);

  return {
    id: stringOr(edge.id, `edge_${source}_${target}_${index + 1}`),
    source,
    target,
    kind: normalizeEdgeType(firstValue(edge, ["kind", "type", "flow_type", "flowType"])),
    label: stringOr(firstValue(edge, ["label", "name", "data", "description"]), "data"),
    ...(typeof dataContract === "string" && dataContract.trim()
      ? { data_contract: dataContract.trim() }
      : {}),
    ...(typeof condition === "string" && condition.trim()
      ? { condition: condition.trim() }
      : {})
  };
}

function normalizePorts(value: unknown) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];

  return values.map((port, index) => {
    if (typeof port === "string") {
      return {
        name: slugify(port) || `port_${index + 1}`,
        description: port.trim()
      };
    }

    if (isRecord(port)) {
      const description = stringOr(port.description, stringOr(port.name, "Data"));

      return {
        name: stringOr(port.name, slugify(description) || `port_${index + 1}`),
        description,
        ...(typeof port.sensitive === "boolean" ? { sensitive: port.sensitive } : {}),
        ...(typeof port.format === "string" && port.format.trim()
          ? { format: port.format.trim() }
          : {})
      };
    }

    return {
      name: `port_${index + 1}`,
      description: "Data passed through this component."
    };
  });
}

function normalizeRisks(value: unknown) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const risks = values.map((risk, index) => {
    if (typeof risk === "string") {
      return {
        risk_type: slugify(risk).slice(0, 40) || `risk_${index + 1}`,
        severity: "warning" as const,
        description: risk.trim(),
        mitigation: "Add an explicit safeguard or review step for this risk."
      };
    }

    if (isRecord(risk)) {
      return {
        risk_type: stringOr(risk.risk_type, `risk_${index + 1}`),
        severity: normalizeRiskSeverity(risk.severity),
        description: stringOr(risk.description, "This component may fail or be misused."),
        mitigation: stringOr(
          risk.mitigation,
          "Add an explicit safeguard, fallback, or review step."
        )
      };
    }

    return {
      risk_type: `risk_${index + 1}`,
      severity: "warning" as const,
      description: "This component may fail or be misused.",
      mitigation: "Add an explicit safeguard, fallback, or review step."
    };
  });

  return risks.length > 0
    ? risks
    : [
        {
          risk_type: "unknown_failure_mode",
          severity: "warning" as const,
          description: "The model did not specify component risks.",
          mitigation: "Review this node and add concrete failure modes before implementation."
        }
      ];
}

function normalizeAlternatives(value: unknown) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const alternatives = values.map((alternative, index) => {
    if (typeof alternative === "string") {
      return {
        name: titleFromText(alternative) || `Alternative ${index + 1}`,
        tradeoff: alternative.trim()
      };
    }

    if (isRecord(alternative)) {
      return {
        name: stringOr(alternative.name, `Alternative ${index + 1}`),
        tradeoff: stringOr(alternative.tradeoff, "Different cost, reliability, or complexity tradeoff."),
        ...(typeof alternative.when_to_use === "string" && alternative.when_to_use.trim()
          ? { when_to_use: alternative.when_to_use.trim() }
          : {})
      };
    }

    return {
      name: `Alternative ${index + 1}`,
      tradeoff: "Different cost, reliability, or complexity tradeoff."
    };
  });

  return alternatives.length > 0
    ? alternatives
    : [
        {
          name: "Simpler manual step",
          tradeoff: "Lower automation and cost, but more user effort."
        }
      ];
}

function normalizeEstimate(value: unknown) {
  if (typeof value === "string") {
    return {
      relative: estimateFromText(value),
      notes: value.trim()
    };
  }

  if (isRecord(value)) {
    return {
      relative: normalizeEstimateLevel(value.relative, value.notes),
      notes: stringOr(value.notes, "Estimated from the generated architecture."),
      ...(typeof value.units_per_run === "number" && value.units_per_run >= 0
        ? { units_per_run: value.units_per_run }
        : {}),
      ...(typeof value.estimated_seconds === "number" && value.estimated_seconds >= 0
        ? { estimated_seconds: value.estimated_seconds }
        : {})
    };
  }

  return {
    relative: "medium" as const,
    notes: "Estimated from the generated architecture."
  };
}

function normalizeTaskProfile(value: unknown) {
  const profile = isRecord(value) ? value : {};
  const requiresCitations = firstValue(profile, [
    "requires_citations",
    "requiresCitations",
    "citations"
  ]);
  const privacySensitivity = firstValue(profile, [
    "privacy_sensitivity",
    "privacySensitivity",
    "privacy"
  ]);

  return {
    task_type: stringOr(firstValue(profile, ["task_type", "taskType", "type"]), "ai_application"),
    risk_level: normalizeRiskLevel(firstValue(profile, ["risk_level", "riskLevel", "risk"])),
    knowledge_intensity: normalizeRiskLevel(firstValue(profile, ["knowledge_intensity", "knowledgeIntensity", "knowledge"])),
    requires_tools: booleanOr(firstValue(profile, ["requires_tools", "requiresTools", "tools"]), false),
    requires_memory: booleanOr(firstValue(profile, ["requires_memory", "requiresMemory", "memory"]), false),
    requires_human_review: booleanOr(firstValue(profile, ["requires_human_review", "requiresHumanReview", "human_review"]), false),
    ...(typeof requiresCitations === "boolean" ? { requires_citations: requiresCitations } : {}),
    ...(riskLevels.includes(privacySensitivity as RiskLevel)
      ? { privacy_sensitivity: privacySensitivity as RiskLevel }
      : {}),
  };
}

function normalizeNaiveBaseline(value: unknown) {
  const baseline = isRecord(value) ? value : {};

  return {
    summary: stringOr(
      firstValue(baseline, ["summary", "description"]),
      "A single prompt is sent directly to one LLM, which returns a final answer without safeguards."
    ),
    failure_modes: normalizeStringArray(firstValue(baseline, ["failure_modes", "failureModes", "risks"]), [
      "The model can hallucinate or omit important safeguards.",
      "There is no explicit verification or review step."
    ])
  };
}

function normalizeConfig(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    return { notes: value.trim() };
  }

  return {};
}

function normalizePosition(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const x = typeof value.x === "number" ? value.x : null;
  const y = typeof value.y === "number" ? value.y : null;

  return x === null || y === null ? null : { x, y };
}

function buildSequentialEdges(nodes: ArchitectureNode[]) {
  return nodes.slice(0, -1).map((node, index) => ({
    id: `edge_${node.id}_${nodes[index + 1].id}`,
    source: node.id,
    target: nodes[index + 1].id,
    kind: "data_flow" as const,
    label: "next step"
  }));
}

function firstArray(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function firstValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key];
    }
  }

  return undefined;
}

function candidateNodeKeys(node: Record<string, unknown>) {
  return [
    node.id,
    node.key,
    node.name,
    node.label,
    node.title,
    node.component,
    node.service
  ];
}

function uniqueNodeId(id: string, index: number, usedNodeIds: Set<string>) {
  const baseId = slugify(id) || `node_${index + 1}`;
  let candidate = baseId;
  let suffix = 2;

  while (usedNodeIds.has(candidate)) {
    candidate = `${baseId}_${suffix}`;
    suffix += 1;
  }

  usedNodeIds.add(candidate);
  return candidate;
}

function mapNodeId(value: unknown, nodeIdMap: Map<string, string>) {
  if (isRecord(value)) {
    return mapNodeId(
      firstValue(value, ["id", "name", "label", "title"]),
      nodeIdMap
    );
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return nodeIdMap.get(trimmed) ?? nodeIdMap.get(slugify(trimmed)) ?? null;
}

function normalizeNodeType(value: unknown, name: string): NodeType {
  if (nodeTypes.includes(value as NodeType)) {
    return value as NodeType;
  }

  const lower = name.toLowerCase();

  if (lower.includes("input") || lower.includes("upload") || lower.includes("message")) return "input";
  if (lower.includes("prompt")) return "prompt";
  if (lower.includes("llm") || lower.includes("model") || lower.includes("generator")) return "llm";
  if (lower.includes("knowledge") || lower.includes("database") || lower.includes("corpus")) return "knowledge_base";
  if (lower.includes("retrieval") || lower.includes("search")) return "retrieval";
  if (lower.includes("tool") || lower.includes("api")) return "tool";
  if (lower.includes("memory")) return "memory";
  if (lower.includes("review") || lower.includes("approval")) return "human_review";
  if (lower.includes("verifier") || lower.includes("evaluator") || lower.includes("check")) return "evaluator";
  if (lower.includes("output") || lower.includes("final")) return "output";
  if (lower.includes("classif")) return "classifier";
  if (lower.includes("privacy") || lower.includes("redact")) return "privacy_filter";
  if (lower.includes("fallback")) return "fallback";
  if (lower.includes("log")) return "logger";

  return "transform";
}

function normalizeEdgeType(value: unknown): EdgeType {
  return edgeTypes.includes(value as EdgeType) ? (value as EdgeType) : "data_flow";
}

function normalizeRiskLevel(value: unknown): RiskLevel {
  return riskLevels.includes(value as RiskLevel) ? (value as RiskLevel) : "medium";
}

function normalizeRiskSeverity(value: unknown): "warning" | "error" | "critical" {
  return value === "critical" || value === "error" || value === "warning"
    ? value
    : "warning";
}

function normalizeEstimateLevel(value: unknown, notes: unknown): EstimateLevel {
  if (estimateLevels.includes(value as EstimateLevel)) {
    return value as EstimateLevel;
  }

  return estimateFromText(typeof notes === "string" ? notes : "medium");
}

function estimateFromText(value: string): EstimateLevel {
  const lower = value.toLowerCase();

  if (lower.includes("none") || lower.includes("no ")) return "none";
  if (lower.includes("low") || lower.includes("cheap") || lower.includes("fast")) return "low";
  if (lower.includes("high") || lower.includes("expensive") || lower.includes("slow")) return "high";

  return "medium";
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  if (!Array.isArray(value)) {
    return fallback;
  }

  const strings = value
    .map((item) => (typeof item === "string" ? item.trim() : JSON.stringify(item)))
    .filter((item) => item.length > 0);

  return strings.length > 0 ? strings : fallback;
}

function stringOr(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function booleanOr(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();

    if (["true", "yes", "required", "requires", "needed"].includes(lower)) {
      return true;
    }

    if (["false", "no", "none", "not_required", "not required"].includes(lower)) {
      return false;
    }
  }

  return fallback;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function titleFromText(value: string) {
  return value
    .trim()
    .split(/[.:;-]/)[0]
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}