"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/shared/Badge";
import { graphToJson } from "@/lib/export/graphToJson";
import { graphToMarkdown } from "@/lib/export/graphToMarkdown";
import type { DemoTrace } from "@/shared/types/demo";
import type { ArchitectureGraph } from "@/shared/types/graph";
import type { ArchitectureScore } from "@/shared/types/scoring";
import type { ValidationResult } from "@/shared/types/validation";

interface ExportPanelProps {
  graph: ArchitectureGraph;
  validation: ValidationResult;
  score: ArchitectureScore;
  trace: DemoTrace | null;
}

type ExportKind = "json" | "markdown";

export function ExportPanel({
  graph,
  score,
  trace,
  validation
}: ExportPanelProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jsonExport = useMemo(() => safeGraphToJson(graph), [graph]);
  const markdownExport = useMemo(
    () => graphToMarkdown({ graph, validation, score, trace }),
    [graph, score, trace, validation]
  );

  async function handleCopy(kind: ExportKind) {
    const text = kind === "json" ? jsonExport.value : markdownExport;

    if (!text) {
      setError(jsonExport.error ?? "Nothing to copy yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus(kind === "json" ? "JSON copied" : "Implementation plan copied");
      setError(null);
    } catch {
      setError("Clipboard permission was unavailable. Use download instead.");
      setStatus(null);
    }
  }

  function handleDownload(kind: ExportKind) {
    const text = kind === "json" ? jsonExport.value : markdownExport;

    if (!text) {
      setError(jsonExport.error ?? "Nothing to download yet.");
      return;
    }

    const extension = kind === "json" ? "json" : "md";
    const mimeType = kind === "json" ? "application/json" : "text/markdown";
    const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${slugify(graph.title)}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus(kind === "json" ? "JSON downloaded" : "Implementation plan downloaded");
    setError(null);
  }

  return (
    <aside className="rounded-lg border border-slate-200 bg-white/95 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Export</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Export the current graph as validated JSON or a Markdown implementation plan.
          </p>
        </div>
        <Badge tone={jsonExport.value ? "data" : "danger"}>
          {jsonExport.value ? "Schema valid" : "Invalid JSON"}
        </Badge>
      </div>

      <div className="grid gap-3 p-4">
        <section className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                JSON Graph
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Parses back through the architecture schema before export.
              </p>
            </div>
            <Badge tone="input">{graph.nodes.length} nodes</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleCopy("json")}
              disabled={!jsonExport.value}
              className="min-h-9 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Copy JSON
            </button>
            <button
              type="button"
              onClick={() => handleDownload("json")}
              disabled={!jsonExport.value}
              className="min-h-9 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Download JSON
            </button>
          </div>
        </section>

        <section className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Markdown Plan
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Includes summary, risks, validation, scores, trace, and next build steps.
              </p>
            </div>
            <Badge tone={trace ? "data" : "warning"}>
              {trace ? "Trace attached" : "No trace yet"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleCopy("markdown")}
              className="min-h-9 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
            >
              Copy plan
            </button>
            <button
              type="button"
              onClick={() => handleDownload("markdown")}
              className="min-h-9 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              Download plan
            </button>
          </div>
        </section>

        {status ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-900">
            {error}
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function safeGraphToJson(graph: ArchitectureGraph):
  | { value: string; error: null }
  | { value: null; error: string } {
  try {
    return { value: graphToJson(graph), error: null };
  } catch (error) {
    return {
      value: null,
      error:
        error instanceof Error
          ? error.message
          : "Graph failed schema validation."
    };
  }
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "systemcraft-export"
  );
}
