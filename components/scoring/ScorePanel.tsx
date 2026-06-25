import { Badge } from "@/components/shared/Badge";
import type {
  ArchitectureScore,
  ScoreBand,
  ScoreDimension,
  ScoreReason
} from "@/shared/types/scoring";

interface ScorePanelProps {
  score: ArchitectureScore;
  onSelectNode: (nodeId: string) => void;
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

const bandLabels: Record<ScoreBand, string> = {
  strong_starting_point: "Strong Starting Point",
  good_but_review_issues: "Good But Review Issues",
  needs_architectural_work: "Needs Architectural Work",
  risky_or_incomplete: "Risky Or Incomplete"
};

export function ScorePanel({ score, onSelectNode }: ScorePanelProps) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-white/95 shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Score</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Heuristic quality checks across seven architecture dimensions.
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold leading-9 text-ink">
              {score.overall}
            </p>
            <Badge tone={score.overall >= 80 ? "data" : score.overall >= 65 ? "review" : score.overall >= 45 ? "warning" : "danger"}>
              {bandLabels[score.band]}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4">
        <section className="grid gap-2">
          {score.dimensions.map((dimension) => (
            <div key={dimension.dimension} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-700">
                  {dimensionLabels[dimension.dimension]}
                </span>
                <span className="font-semibold text-slate-900">
                  {dimension.score}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={barClassName(dimension.score)}
                  style={{ width: dimension.score + "%" }}
                />
              </div>
            </div>
          ))}
        </section>

        <ReasonList
          title="Top Strengths"
          reasons={score.strengths}
          emptyText="Strengths will appear after scoring."
          onSelectNode={onSelectNode}
        />

        <ReasonList
          title="Top Improvements"
          reasons={score.improvements}
          emptyText="No priority improvements found."
          onSelectNode={onSelectNode}
        />

        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
          {score.disclaimer}
        </p>
      </div>
    </aside>
  );
}

function ReasonList({
  emptyText,
  onSelectNode,
  reasons,
  title
}: {
  emptyText: string;
  onSelectNode: (nodeId: string) => void;
  reasons: ScoreReason[];
  title: string;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      {reasons.length === 0 ? (
        <p className="text-xs leading-5 text-slate-500">{emptyText}</p>
      ) : (
        <ul className="grid gap-2">
          {reasons.map((reason) => {
            const targetNodeId = reason.related_node_ids?.[0];

            return (
              <li
                key={reason.title + reason.description}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <p className="text-sm font-semibold leading-5 text-ink">
                  {reason.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {reason.description}
                </p>
                {targetNodeId ? (
                  <button
                    type="button"
                    onClick={() => onSelectNode(targetNodeId)}
                    aria-label={`Select related node ${targetNodeId}`}
                    className="mt-2 text-xs font-semibold text-teal-700 hover:text-teal-900"
                  >
                    Select related node
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function barClassName(score: number) {
  const color =
    score >= 80
      ? "bg-emerald-500"
      : score >= 65
        ? "bg-amber-500"
        : score >= 45
          ? "bg-orange-500"
          : "bg-rose-500";

  return "h-full rounded-full transition-all " + color;
}
