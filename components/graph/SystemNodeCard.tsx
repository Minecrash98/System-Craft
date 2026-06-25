"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import { Badge } from "@/components/shared/Badge";
import type { SystemFlowNode } from "@/lib/graph/graphAdapters";
import type { NodeType, Severity } from "@/shared/types/graph";

const typeTones: Record<
  NodeType,
  { badge: string; border: string; accent: string; tint: string }
> = {
  input: {
    badge: "INPUT",
    border: "border-sky-200",
    accent: "bg-sky-500",
    tint: "bg-sky-50"
  },
  prompt: {
    badge: "PROMPT",
    border: "border-indigo-200",
    accent: "bg-indigo-500",
    tint: "bg-indigo-50"
  },
  llm: {
    badge: "LLM",
    border: "border-violet-200",
    accent: "bg-violet-500",
    tint: "bg-violet-50"
  },
  knowledge_base: {
    badge: "KB",
    border: "border-emerald-200",
    accent: "bg-emerald-500",
    tint: "bg-emerald-50"
  },
  retrieval: {
    badge: "RETRIEVAL",
    border: "border-cyan-200",
    accent: "bg-cyan-500",
    tint: "bg-cyan-50"
  },
  tool: {
    badge: "TOOL",
    border: "border-orange-200",
    accent: "bg-orange-500",
    tint: "bg-orange-50"
  },
  memory: {
    badge: "MEMORY",
    border: "border-fuchsia-200",
    accent: "bg-fuchsia-500",
    tint: "bg-fuchsia-50"
  },
  human_review: {
    badge: "REVIEW",
    border: "border-amber-200",
    accent: "bg-amber-500",
    tint: "bg-amber-50"
  },
  evaluator: {
    badge: "EVAL",
    border: "border-yellow-200",
    accent: "bg-yellow-500",
    tint: "bg-yellow-50"
  },
  output: {
    badge: "OUTPUT",
    border: "border-lime-200",
    accent: "bg-lime-500",
    tint: "bg-lime-50"
  },
  transform: {
    badge: "TRANSFORM",
    border: "border-blue-200",
    accent: "bg-blue-500",
    tint: "bg-blue-50"
  },
  router: {
    badge: "ROUTER",
    border: "border-purple-200",
    accent: "bg-purple-500",
    tint: "bg-purple-50"
  },
  classifier: {
    badge: "CLASSIFIER",
    border: "border-teal-200",
    accent: "bg-teal-500",
    tint: "bg-teal-50"
  },
  privacy_filter: {
    badge: "PRIVACY",
    border: "border-rose-200",
    accent: "bg-rose-500",
    tint: "bg-rose-50"
  },
  fallback: {
    badge: "FALLBACK",
    border: "border-red-200",
    accent: "bg-red-500",
    tint: "bg-red-50"
  },
  logger: {
    badge: "LOGGER",
    border: "border-slate-200",
    accent: "bg-slate-500",
    tint: "bg-slate-50"
  }
};

export function SystemNodeCard({
  data,
  selected
}: NodeProps<SystemFlowNode>) {
  const node = data.architectureNode;
  const typeTone = typeTones[node.type];
  const isVertical = data.layoutDirection === "vertical";
  const targetPosition = isVertical ? Position.Top : Position.Left;
  const sourcePosition = isVertical ? Position.Bottom : Position.Right;
  const highestIssue = data.validationIssues.reduce<Severity | null>(
    (current, issue) => {
      if (!current || severityRank(issue.severity) > severityRank(current)) {
        return issue.severity;
      }

      return current;
    },
    null
  );
  const highestRisk = node.risks.reduce<Exclude<Severity, "info"> | null>(
    (current, risk) => {
      if (!current || severityRank(risk.severity) > severityRank(current)) {
        return risk.severity;
      }

      return current;
    },
    null
  );

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Select ${node.name}`}
      data-testid={`graph-node-${node.id}`}
      onClick={() => data.onSelectNode(node.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          data.onSelectNode(node.id);
        }
      }}
      className={`relative h-[214px] w-[280px] cursor-pointer overflow-hidden rounded-lg border bg-white shadow-[0_14px_34px_rgba(15,23,42,0.09)] transition focus:outline-none focus:ring-2 focus:ring-slate-900/20 ${
        selected
          ? "border-slate-900 ring-2 ring-slate-900/10"
          : highestIssue === "critical" || highestIssue === "error"
            ? "border-rose-300"
            : highestIssue === "warning"
              ? "border-orange-300"
              : highestIssue === "info"
                ? "border-sky-200"
                : typeTone.border
      }`}
    >
      {data.incomingCount > 0 ? (
        <Handle
          type="target"
          position={targetPosition}
          isConnectable={false}
          className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-500"
        />
      ) : null}
      {data.outgoingCount > 0 ? (
        <Handle
          type="source"
          position={sourcePosition}
          isConnectable={false}
          className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-500"
        />
      ) : null}

      <div className={`h-1.5 ${typeTone.accent}`} />
      <div className="flex h-[206px] flex-col p-4">
        <div className="flex min-h-7 items-start justify-between gap-3">
          <Badge>{typeTone.badge}</Badge>
          {highestRisk ? (
            <Badge tone={highestRisk === "critical" ? "danger" : "warning"}>
              {highestRisk}
            </Badge>
          ) : null}
          {highestIssue ? (
            <Badge
              tone={
                highestIssue === "critical" || highestIssue === "error"
                  ? "danger"
                  : highestIssue === "warning"
                    ? "warning"
                    : "input"
              }
              title={`${data.validationIssues.length} validation issue${
                data.validationIssues.length === 1 ? "" : "s"
              }`}
            >
              {data.validationIssues.length} issue
            </Badge>
          ) : null}
        </div>

        <h3 className="system-node-title mt-3 min-h-10 text-[15px] font-semibold leading-5 text-ink">
          {node.name}
        </h3>
        <p className="system-node-copy mt-2 min-h-9 text-xs leading-[18px] text-slate-600">
          {node.description}
        </p>

        <dl className="mt-auto grid grid-cols-2 gap-3 text-[11px] leading-4 text-slate-600">
          <div className={`min-h-[48px] rounded-md px-3 py-2 ${typeTone.tint}`}>
            <dt className="font-semibold text-slate-500">Cost</dt>
            <dd className="mt-0.5 capitalize text-sm leading-5 text-slate-900">
              {node.cost_estimate.relative}
            </dd>
          </div>
          <div className={`min-h-[48px] rounded-md px-3 py-2 ${typeTone.tint}`}>
            <dt className="font-semibold text-slate-500">Latency</dt>
            <dd className="mt-0.5 capitalize text-sm leading-5 text-slate-900">
              {node.latency_estimate.relative}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

function severityRank(severity: Severity) {
  return {
    info: 0,
    warning: 1,
    error: 2,
    critical: 3
  }[severity];
}
