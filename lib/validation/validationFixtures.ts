import type { ArchitectureGraph } from "@/shared/types/graph";

export function makeBrokenEdgeFixture(
  graph: ArchitectureGraph
): ArchitectureGraph {
  return {
    ...cloneGraph(graph),
    edges: [
      ...graph.edges,
      {
        id: "fixture_broken_edge",
        source: graph.nodes[0]?.id ?? "missing_source",
        target: "missing_fixture_node",
        kind: "data_flow",
        label: "broken fixture edge"
      }
    ]
  };
}

export function makeMissingCitationVerifierFixture(
  graph: ArchitectureGraph
): ArchitectureGraph {
  const next = cloneGraph(graph);
  const verifierIds = new Set(
    next.nodes
      .filter(
        (node) =>
          node.type === "evaluator" &&
          `${node.name} ${node.description}`.toLowerCase().includes("citation")
      )
      .map((node) => node.id)
  );

  next.nodes = next.nodes.filter((node) => !verifierIds.has(node.id));
  next.edges = next.edges.filter(
    (edge) => !verifierIds.has(edge.source) && !verifierIds.has(edge.target)
  );
  next.task_profile.requires_citations = true;

  return next;
}

export function makeHighRiskWithoutReviewFixture(
  graph: ArchitectureGraph
): ArchitectureGraph {
  const next = cloneGraph(graph);
  const reviewIds = new Set(
    next.nodes
      .filter((node) => node.type === "human_review")
      .map((node) => node.id)
  );
  const replacementEdges: ArchitectureGraph["edges"] = [];

  for (const reviewId of reviewIds) {
    const incoming = next.edges.filter(
      (edge) => edge.target === reviewId && !reviewIds.has(edge.source)
    );
    const outgoing = next.edges.filter(
      (edge) => edge.source === reviewId && !reviewIds.has(edge.target)
    );

    for (const inEdge of incoming) {
      for (const outEdge of outgoing) {
        replacementEdges.push({
          id: `fixture_without_review_${inEdge.source}_${outEdge.target}`,
          source: inEdge.source,
          target: outEdge.target,
          kind: "review_flow",
          label: "review bypass",
          data_contract: outEdge.data_contract ?? inEdge.data_contract
        });
      }
    }
  }

  next.nodes = next.nodes.filter((node) => !reviewIds.has(node.id));
  next.edges = next.edges.filter(
    (edge) => !reviewIds.has(edge.source) && !reviewIds.has(edge.target)
  );
  next.edges.push(...replacementEdges);
  next.task_profile.risk_level = "high";
  next.task_profile.requires_human_review = true;

  return next;
}

export function makeMissingRetrievalFixture(
  graph: ArchitectureGraph
): ArchitectureGraph {
  const next = cloneGraph(graph);
  const retrievalIds = new Set(
    next.nodes.filter((node) => node.type === "retrieval").map((node) => node.id)
  );

  next.nodes = next.nodes.filter((node) => !retrievalIds.has(node.id));
  next.edges = next.edges.filter(
    (edge) => !retrievalIds.has(edge.source) && !retrievalIds.has(edge.target)
  );
  next.task_profile.knowledge_intensity = "high";

  return next;
}

export function makeLlmWithoutPromptFixture(
  graph: ArchitectureGraph
): ArchitectureGraph {
  const next = cloneGraph(graph);
  const promptIds = new Set(
    next.nodes.filter((node) => node.type === "prompt").map((node) => node.id)
  );

  next.nodes = next.nodes.filter((node) => !promptIds.has(node.id));
  next.edges = next.edges.filter(
    (edge) => !promptIds.has(edge.source) && !promptIds.has(edge.target)
  );

  for (const node of next.nodes) {
    if (node.type !== "llm") {
      continue;
    }

    node.name = "Answer Model";
    node.description = "Drafts a response from provided context.";
    node.inputs = [
      {
        name: "context",
        description: "Context selected for the answer."
      }
    ];
    node.outputs = [
      {
        name: "draft",
        description: "Draft response for downstream checks.",
        format: "markdown"
      }
    ];
    node.config = {
      model_role: "writer",
      temperature: 0.2
    };
    node.risks = [
      {
        risk_type: "unguided_model",
        severity: "error",
        description: "The model may draft content without a visible control layer.",
        mitigation: "Add a prompt layer before generation."
      }
    ];
    node.alternatives = [
      {
        name: "Template writer",
        tradeoff: "More predictable but less flexible."
      }
    ];
    node.explanation_for_beginner =
      "This model writes a draft after receiving context.";
  }

  return next;
}

export function makeToolWithoutPermissionFixture(
  graph: ArchitectureGraph
): ArchitectureGraph {
  const next = cloneGraph(graph);
  const tool = next.nodes.find((node) => node.type === "tool");

  if (!tool) {
    return next;
  }

  tool.name = "Action Executor";
  tool.description = "Runs a support action from the routing decision.";
  tool.inputs = [
    {
      name: "intent",
      description: "Detected support intent."
    },
    {
      name: "reviewed_response",
      description: "Policy-reviewed response."
    }
  ];
  tool.outputs = [
    {
      name: "action_result",
      description: "Next support action.",
      format: "action_decision"
    }
  ];
  tool.config = {
    action_type: "send_customer_update"
  };
  tool.risks = [
    {
      risk_type: "external_action",
      severity: "critical",
      description: "The action could affect customer records.",
      mitigation: "Route sensitive cases through escalation."
    }
  ];
  tool.alternatives = [
    {
      name: "Internal draft only",
      tradeoff: "Safer early on but less automated."
    }
  ];
  tool.explanation_for_beginner =
    "This component turns a routing decision into a support action.";

  return next;
}

export function makeSensitiveMemoryWithoutRetentionFixture(
  graph: ArchitectureGraph
): ArchitectureGraph {
  const next = cloneGraph(graph);
  const memory = next.nodes.find((node) => node.type === "memory");

  if (memory) {
    memory.config = { stores_sensitive_state: true };
    memory.inputs = memory.inputs.map((input) => ({ ...input, sensitive: true }));
    memory.outputs = memory.outputs.map((output) => ({ ...output, sensitive: true }));
    return next;
  }

  next.nodes.push({
    id: "fixture_sensitive_memory",
    type: "memory",
    name: "Sensitive Memory",
    description: "Stores user-provided sensitive state for later use.",
    inputs: [
      {
        name: "private_state",
        description: "Sensitive personal state.",
        sensitive: true
      }
    ],
    outputs: [
      {
        name: "remembered_state",
        description: "Stored sensitive state.",
        sensitive: true
      }
    ],
    config: {
      stores_sensitive_state: true
    },
    risks: [
      {
        risk_type: "sensitive_memory",
        severity: "error",
        description: "Sensitive state can persist longer than expected.",
        mitigation: "Add retention and deletion controls."
      }
    ],
    cost_estimate: { relative: "low", notes: "Small storage cost." },
    latency_estimate: { relative: "none", notes: "Immediate memory lookup." },
    alternatives: [
      {
        name: "No memory",
        tradeoff: "More private but less personalized."
      }
    ],
    explanation_for_beginner:
      "Memory is where a system keeps information for future requests."
  });

  return next;
}

export function makeHighCostLatencyFixture(
  graph: ArchitectureGraph
): ArchitectureGraph {
  const next = cloneGraph(graph);
  const expensiveTypes = new Set(["llm", "evaluator"]);

  for (const node of next.nodes) {
    if (!expensiveTypes.has(node.type)) {
      continue;
    }

    node.cost_estimate = {
      relative: "high",
      notes: "Fixture marks this model step as expensive."
    };
    node.latency_estimate = {
      relative: "high",
      notes: "Fixture marks this model step as slow.",
      estimated_seconds: 20
    };
  }

  return next;
}

export function makeUnclearOutputFormatFixture(
  graph: ArchitectureGraph
): ArchitectureGraph {
  const next = cloneGraph(graph);

  for (const node of next.nodes) {
    if (node.type !== "output") {
      continue;
    }

    node.name = "Final Screen";
    node.description = "Shows the result to the user.";
    node.inputs = [
      {
        name: "reviewed_content",
        description: "Reviewed content."
      }
    ];
    node.outputs = [];
    node.config = {};
    node.risks = [
      {
        risk_type: "unclear_result",
        severity: "warning",
        description: "The result may be hard to use.",
        mitigation: "Name the result shape before shipping."
      }
    ];
    node.alternatives = [
      {
        name: "Detailed result view",
        tradeoff: "Clearer for users but more work."
      }
    ];
    node.explanation_for_beginner =
      "This is the final screen the user sees.";
  }

  return next;
}

export function makeNoUncertaintyBehaviorFixture(
  graph: ArchitectureGraph
): ArchitectureGraph {
  const next = scrubUnknownStrings(
    cloneGraph(graph),
    sanitizeUncertaintyText
  ) as ArchitectureGraph;

  next.task_profile.risk_level = "high";
  next.task_profile.knowledge_intensity = "high";
  next.task_profile.requires_citations = true;

  return next;
}

function cloneGraph(graph: ArchitectureGraph): ArchitectureGraph {
  return JSON.parse(JSON.stringify(graph)) as ArchitectureGraph;
}

function scrubUnknownStrings(
  value: unknown,
  replaceString: (value: string) => string
): unknown {
  if (typeof value === "string") {
    return replaceString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubUnknownStrings(item, replaceString));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        replaceString(key),
        scrubUnknownStrings(item, replaceString)
      ])
    );
  }

  return value;
}

function sanitizeUncertaintyText(value: string) {
  return value
    .replace(/low-confidence/gi, "low trust")
    .replace(/could not be found/gi, "not located")
    .replace(/uncertainty/gi, "limits")
    .replace(/confidence/gi, "certainty")
    .replace(/missing/gi, "absent")
    .replace(/unsupported/gi, "flagged")
    .replace(/say when/gi, "state if");
}
