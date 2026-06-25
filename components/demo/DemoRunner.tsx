"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/shared/Badge";
import { simulateArchitectureRun } from "@/lib/demo/simulateRun";
import type { DemoTrace, DemoTraceStatus, DemoTraceStep } from "@/shared/types/demo";
import type { ArchitectureGraph } from "@/shared/types/graph";

interface DemoRunnerProps {
  graph: ArchitectureGraph;
  onSelectNode: (nodeId: string) => void;
  onTraceChange?: (trace: DemoTrace | null) => void;
}

const statusLabels: Record<DemoTraceStatus, string> = {
  simulated: "Simulated",
  passed: "Passed",
  needs_review: "Needs Review",
  blocked: "Blocked",
  failed: "Failed"
};

export function DemoRunner({
  graph,
  onSelectNode,
  onTraceChange
}: DemoRunnerProps) {
  const defaultTask = useMemo(() => defaultTaskForGraph(graph), [graph]);
  const [task, setTask] = useState(defaultTask);
  const [trace, setTrace] = useState<DemoTrace | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTask(defaultTask);
    setTrace(null);
    setError(null);
    onTraceChange?.(null);
  }, [defaultTask, graph.id, onTraceChange]);

  async function handleRunTrace() {
    const sampleTask = task.trim() || defaultTask;
    setIsRunning(true);
    setError(null);

    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          graph,
          task: sampleTask
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.trace) {
        throw new Error(payload.error ?? "Simulation route returned no trace.");
      }

      setTrace(payload.trace);
      onTraceChange?.(payload.trace);
    } catch (caughtError) {
      const fallbackTrace = simulateArchitectureRun(graph, sampleTask);
      setTrace(fallbackTrace);
      onTraceChange?.(fallbackTrace);
      setError(
        caughtError instanceof Error
          ? `Route failed, so a local simulated trace was generated. ${caughtError.message}`
          : "Route failed, so a local simulated trace was generated."
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <aside className="rounded-lg border border-slate-200 bg-white/95 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Demo Runner</h2>
            <Badge tone="input">Simulated</Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Runs a sample task through existing graph nodes without real tool or API execution.
          </p>
        </div>
        {trace ? (
          <Badge tone={trace.steps.some((step) => step.status === "blocked") ? "warning" : "data"}>
            {trace.steps.length} steps
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-3 p-4">
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sample Task
          </span>
          <textarea
            value={task}
            onChange={(event) => setTask(event.target.value)}
            rows={3}
            className="min-h-[84px] resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-ink outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </label>

        <button
          type="button"
          onClick={handleRunTrace}
          disabled={isRunning}
          className="min-h-10 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isRunning ? "Running simulated trace" : "Run simulated trace"}
        </button>

        {error ? (
          <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-900">
            {error}
          </p>
        ) : null}

        {trace?.naive_comparison ? (
          <section className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-900">
              Naive Comparison
            </h3>
            <p className="mt-1 text-xs leading-5 text-orange-950">
              {trace.naive_comparison.failure_observed}
            </p>
          </section>
        ) : null}

        {trace ? (
          <>
            <TraceTimeline trace={trace} onSelectNode={onSelectNode} />
            <section className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                Final Preview
              </h3>
              <p className="mt-1 text-xs leading-5 text-emerald-950">
                {trace.final_output_preview}
              </p>
            </section>
          </>
        ) : (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            Run the trace to see each simulated node input, output, failure, and mitigation.
          </p>
        )}
      </div>
    </aside>
  );
}

function TraceTimeline({
  onSelectNode,
  trace
}: {
  onSelectNode: (nodeId: string) => void;
  trace: DemoTrace;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Timeline
        </h3>
        <Badge tone="input">Simulated trace</Badge>
      </div>
      <ol className="grid max-h-[420px] gap-2 overflow-y-auto pr-1">
        {trace.steps.map((step, index) => (
          <li key={step.id}>
            <TraceStepCard
              index={index}
              step={step}
              onSelectNode={onSelectNode}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function TraceStepCard({
  index,
  onSelectNode,
  step
}: {
  index: number;
  onSelectNode: (nodeId: string) => void;
  step: DemoTraceStep;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectNode(step.node_id)}
      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50"
    >
      <span className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Step {index + 1}
          </span>
          <span className="mt-0.5 block text-sm font-semibold leading-5 text-ink">
            {step.node_name}
          </span>
        </span>
        <Badge tone={toneForStatus(step.status)}>
          {statusLabels[step.status]}
        </Badge>
      </span>
      <span className="mt-2 block text-xs leading-5 text-slate-600">
        <span className="font-semibold text-slate-700">Input:</span>{" "}
        {step.input_summary}
      </span>
      <span className="mt-1 block text-xs leading-5 text-slate-700">
        <span className="font-semibold">Output:</span> {step.output_summary}
      </span>
      {step.risk_note ? (
        <span className="mt-2 block text-xs leading-5 text-orange-900">
          <span className="font-semibold">Risk:</span> {step.risk_note}
        </span>
      ) : null}
      {step.mitigation_note ? (
        <span className="mt-1 block text-xs leading-5 text-teal-900">
          <span className="font-semibold">Mitigation:</span>{" "}
          {step.mitigation_note}
        </span>
      ) : null}
    </button>
  );
}

function defaultTaskForGraph(graph: ArchitectureGraph) {
  const text = `${graph.id} ${graph.title} ${graph.user_idea} ${graph.task_profile.task_type}`.toLowerCase();

  if (matchesAny(text, ["research", "paper", "citation", "cite"])) {
    return "Summarize the evidence for the main finding and include verified citations.";
  }

  if (matchesAny(text, ["study", "student", "quiz", "revision"])) {
    return "Create a weekly revision plan and a short quiz from the student's course notes.";
  }

  if (matchesAny(text, ["support", "customer", "billing", "policy"])) {
    return "Draft a support reply for a billing question that may need escalation.";
  }

  return `Run a representative ${graph.task_profile.task_type.replaceAll("_", " ")} request through the architecture.`;
}

function toneForStatus(
  status: DemoTraceStatus
): "neutral" | "input" | "processing" | "model" | "data" | "review" | "warning" | "danger" {
  if (status === "blocked" || status === "failed") {
    return "danger";
  }

  if (status === "needs_review") {
    return "review";
  }

  if (status === "simulated") {
    return "input";
  }

  return "data";
}

function matchesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}
