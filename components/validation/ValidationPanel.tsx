import { Badge } from "@/components/shared/Badge";
import type { Severity } from "@/shared/types/graph";
import type { ValidationIssue } from "@/shared/types/validation";

interface ValidationPanelProps {
  issues: ValidationIssue[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onFocusNodeIds?: (nodeIds: string[] | null) => void;
}

const severityOrder: Severity[] = ["critical", "error", "warning", "info"];

const severityLabels: Record<Severity, string> = {
  critical: "Critical",
  error: "Error",
  warning: "Warning",
  info: "Info"
};

export function ValidationPanel({
  issues,
  selectedNodeId,
  onSelectNode,
  onFocusNodeIds
}: ValidationPanelProps) {
  const issueGroups = severityOrder
    .map((severity) => ({
      severity,
      issues: issues.filter((issue) => issue.severity === severity)
    }))
    .filter((group) => group.issues.length > 0);

  return (
    <aside className="rounded-lg border border-slate-200 bg-white/95 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Validation</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Deterministic checks for structure, safeguards, privacy, and output behavior.
          </p>
        </div>
        <Badge tone={summaryTone(issues)}>
          {issues.length} issue{issues.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {issues.length === 0 ? (
        <div className="p-4">
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
            No deterministic validation issues found for this graph.
          </p>
        </div>
      ) : (
        <div className="grid max-h-[420px] gap-4 overflow-y-auto p-4">
          {issueGroups.map((group) => (
            <section key={group.severity} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge tone={toneForSeverity(group.severity)}>
                  {severityLabels[group.severity]}
                </Badge>
                <p className="text-xs font-semibold text-slate-500">
                  {group.issues.length}
                </p>
              </div>
              <ul className="grid gap-2">
                {group.issues.map((issue) => (
                  <li key={issue.id}>
                    <IssueCard
                      issue={issue}
                      selectedNodeId={selectedNodeId}
                      onSelectNode={onSelectNode}
                      onFocusNodeIds={onFocusNodeIds}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </aside>
  );
}

function IssueCard({
  issue,
  onFocusNodeIds,
  onSelectNode,
  selectedNodeId
}: {
  issue: ValidationIssue;
  onFocusNodeIds?: (nodeIds: string[] | null) => void;
  onSelectNode: (nodeId: string) => void;
  selectedNodeId: string | null;
}) {
  const targetNodeId = issue.affected_node_ids[0];
  const selected = Boolean(
    selectedNodeId && issue.affected_node_ids.includes(selectedNodeId)
  );
  const className = selected
    ? "w-full rounded-md border border-slate-900 bg-slate-50 px-3 py-2 text-left shadow-sm transition"
    : targetNodeId
      ? "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50"
      : "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left";
  const content = <IssueCardContent issue={issue} />;

  if (!targetNodeId) {
    return <article className={className}>{content}</article>;
  }

  return (
    <button
      type="button"
      onClick={() => onSelectNode(targetNodeId)}
      onMouseEnter={() => onFocusNodeIds?.(issue.affected_node_ids)}
      onMouseLeave={() => onFocusNodeIds?.(null)}
      onFocus={() => onFocusNodeIds?.(issue.affected_node_ids)}
      onBlur={() => onFocusNodeIds?.(null)}
      className={className}
      aria-label={`Select ${targetNodeId} for issue: ${issue.title}`}
    >
      {content}
    </button>
  );
}

function IssueCardContent({ issue }: { issue: ValidationIssue }) {
  return (
    <>
      <span className="block text-sm font-semibold leading-5 text-ink">
        {issue.title}
      </span>
      <span className="mt-1 block text-xs leading-5 text-slate-600">
        {issue.description}
      </span>
      <span className="mt-2 block text-xs leading-5 text-slate-700">
        <span className="font-semibold">Recommendation:</span>{" "}
        {issue.recommendation}
      </span>
      {issue.affected_node_ids.length > 0 ? (
        <span className="mt-2 flex flex-wrap gap-1.5">
          {issue.affected_node_ids.map((nodeId) => (
            <Badge key={nodeId}>{nodeId}</Badge>
          ))}
        </span>
      ) : null}
    </>
  );
}

function summaryTone(
  issues: ValidationIssue[]
): "neutral" | "input" | "processing" | "model" | "data" | "review" | "warning" | "danger" {
  if (issues.some((issue) => issue.severity === "critical")) {
    return "danger";
  }

  if (issues.length > 0) {
    return "warning";
  }

  return "data";
}

function toneForSeverity(
  severity: Severity
): "neutral" | "input" | "processing" | "model" | "data" | "review" | "warning" | "danger" {
  if (severity === "critical" || severity === "error") {
    return "danger";
  }

  if (severity === "warning") {
    return "warning";
  }

  return "input";
}
