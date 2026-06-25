import { useState } from "react";

import { Badge } from "@/components/shared/Badge";
import type {
  ArchitectureNode,
  Estimate,
  NodeAlternative,
  NodePort,
  NodeRisk
} from "@/shared/types/graph";

interface NodeInspectorProps {
  node: ArchitectureNode | null;
}

export function NodeInspector({ node }: NodeInspectorProps) {
  if (!node) {
    return (
      <aside className="rounded-lg border border-slate-200 bg-white/95 p-4 shadow-sm">
        <p className="text-sm font-semibold text-ink">No component selected</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Purpose, contracts, risks, cost, latency, and alternatives appear here.
        </p>
      </aside>
    );
  }

  return (
    <aside className="rounded-lg border border-slate-200 bg-white/95 shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{node.type}</Badge>
          <Badge
            tone={
              node.risks.some((risk) => risk.severity === "critical")
                ? "danger"
                : "neutral"
            }
          >
            {node.risks.length} risk{node.risks.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <h2 className="mt-3 text-lg font-semibold leading-6 text-ink">
          {node.name}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {node.description}
        </p>
      </div>

      <div className="grid gap-4 p-4 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
        <InspectorSection title="Purpose">
          <p className="text-sm leading-6 text-slate-700">
            {node.explanation_for_beginner}
          </p>
        </InspectorSection>

        <InspectorSection title="Inputs">
          <PortList ports={node.inputs} emptyText="No upstream inputs." />
        </InspectorSection>

        <InspectorSection title="Outputs">
          <PortList ports={node.outputs} emptyText="No downstream outputs." />
        </InspectorSection>

        <InspectorSection title="Config">
          <ConfigBlock config={node.config} />
        </InspectorSection>

        <InspectorSection title="Risks">
          <RiskList risks={node.risks} />
        </InspectorSection>

        <InspectorSection title="Alternatives">
          <AlternativeList alternatives={node.alternatives} />
        </InspectorSection>

        <InspectorSection title="Cost And Latency">
          <div className="grid gap-2">
            <EstimateBlock label="Cost" estimate={node.cost_estimate} />
            <EstimateBlock label="Latency" estimate={node.latency_estimate} />
          </div>
        </InspectorSection>
      </div>
    </aside>
  );
}

function InspectorSection({
  children,
  title
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ConfigBlock({ config }: { config: Record<string, unknown> }) {
  const [showRawJson, setShowRawJson] = useState(false);
  const entries = Object.entries(config);

  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No config listed.</p>;
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50">
      <dl className="divide-y divide-slate-200">
        {entries.map(([key, value]) => (
          <div key={key} className="grid gap-1 px-3 py-2">
            <dt className="break-words font-mono text-[11px] font-semibold text-slate-500">
              {key}
            </dt>
            <dd className="min-w-0 text-sm leading-5 text-slate-800">
              <ConfigValue value={value} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-slate-200 px-3 py-2">
        <button
          type="button"
          onClick={() => setShowRawJson((current) => !current)}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          {showRawJson ? "Hide raw JSON" : "Show raw JSON"}
        </button>
        {showRawJson ? (
          <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
            {JSON.stringify(config, null, 2)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

function ConfigValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-slate-500">empty list</span>;
    }

    return (
      <span className="flex flex-wrap gap-1.5">
        {value.slice(0, 4).map((item, index) => (
          <Badge key={`${index}-${stringifyCompact(item)}`}>
            {stringifyCompact(item)}
          </Badge>
        ))}
        {value.length > 4 ? <Badge>+{value.length - 4}</Badge> : null}
      </span>
    );
  }

  if (typeof value === "boolean") {
    return <Badge tone={value ? "data" : "neutral"}>{String(value)}</Badge>;
  }

  if (value === null || value === undefined) {
    return <span className="text-slate-500">not set</span>;
  }

  if (typeof value === "object") {
    return (
      <code className="break-words rounded bg-white px-1.5 py-0.5 text-xs text-slate-700">
        {stringifyCompact(value)}
      </code>
    );
  }

  return <span className="break-words">{String(value)}</span>;
}

function PortList({
  emptyText,
  ports
}: {
  emptyText: string;
  ports: NodePort[];
}) {
  if (ports.length === 0) {
    return <p className="text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <ul className="grid gap-2">
      {ports.map((port) => (
        <li
          key={`${port.name}-${port.description}`}
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">{port.name}</p>
            {port.sensitive ? <Badge tone="warning">sensitive</Badge> : null}
            {port.format ? <Badge>{port.format}</Badge> : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {port.description}
          </p>
        </li>
      ))}
    </ul>
  );
}

function RiskList({ risks }: { risks: NodeRisk[] }) {
  if (risks.length === 0) {
    return <p className="text-sm text-slate-500">No risks listed.</p>;
  }

  return (
    <ul className="grid gap-2">
      {risks.map((risk) => (
        <li
          key={`${risk.risk_type}-${risk.description}`}
          className="rounded-md border border-slate-200 bg-white px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">{risk.risk_type}</p>
            <Badge tone={risk.severity === "critical" ? "danger" : "warning"}>
              {risk.severity}
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {risk.description}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            <span className="font-semibold">Mitigation:</span>{" "}
            {risk.mitigation}
          </p>
        </li>
      ))}
    </ul>
  );
}

function AlternativeList({
  alternatives
}: {
  alternatives: NodeAlternative[];
}) {
  if (alternatives.length === 0) {
    return <p className="text-sm text-slate-500">No alternatives listed.</p>;
  }

  return (
    <ul className="grid gap-2">
      {alternatives.map((alternative) => (
        <li
          key={`${alternative.name}-${alternative.tradeoff}`}
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
        >
          <p className="text-sm font-semibold text-ink">{alternative.name}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {alternative.tradeoff}
          </p>
          {alternative.when_to_use ? (
            <p className="mt-1 text-sm leading-6 text-slate-700">
              <span className="font-semibold">Use when:</span>{" "}
              {alternative.when_to_use}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function EstimateBlock({
  estimate,
  label
}: {
  estimate: Estimate;
  label: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <Badge>{estimate.relative}</Badge>
        {estimate.units_per_run !== undefined ? (
          <Badge>{estimate.units_per_run} unit/run</Badge>
        ) : null}
        {estimate.estimated_seconds !== undefined ? (
          <Badge>{estimate.estimated_seconds}s</Badge>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {estimate.notes}
      </p>
    </div>
  );
}

function stringifyCompact(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}