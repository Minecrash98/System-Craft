import { Badge } from "@/components/shared/Badge";

const flowKinds = [
  { label: "Data", className: "bg-blue-600" },
  { label: "Control", className: "bg-violet-600" },
  { label: "Review", className: "bg-amber-600" },
  { label: "Fallback", className: "bg-red-600" }
];

const nodeKinds = [
  "input",
  "prompt",
  "llm",
  "retrieval",
  "evaluator",
  "review",
  "output"
];

export function GraphLegend() {
  return (
    <section className="space-y-3 border-t border-slate-200 pt-4">
      <h2 className="text-sm font-semibold text-ink">Legend</h2>

      <div className="flex flex-wrap gap-2">
        {nodeKinds.map((kind) => (
          <Badge key={kind}>{kind}</Badge>
        ))}
      </div>

      <div className="grid gap-2 text-xs text-slate-600">
        {flowKinds.map((kind) => (
          <div key={kind.label} className="flex items-center gap-2">
            <span className={`h-0.5 w-8 rounded ${kind.className}`} />
            <span>{kind.label} flow</span>
          </div>
        ))}
      </div>
    </section>
  );
}
