"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/components/i18n/LanguageProvider";

import { DemoRunner } from "@/components/demo/DemoRunner";
import { DesignReviewPanel } from "@/components/design-review/DesignReviewPanel";
import { ExportPanel } from "@/components/export/ExportPanel";
import { EditableNodePanel } from "@/components/graph/EditableNodePanel";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { GraphLegend } from "@/components/graph/GraphLegend";
import { NodeInspector } from "@/components/inspector/NodeInspector";
import { ScorePanel } from "@/components/scoring/ScorePanel";
import { Badge } from "@/components/shared/Badge";
import { ValidationPanel } from "@/components/validation/ValidationPanel";
import type { GraphLayoutDirection } from "@/lib/graph/layout";
import { scoreArchitectureGraph } from "@/lib/scoring/scoreArchitecture";
import { validateArchitectureGraph } from "@/lib/validation/validateArchitecture";
import type { DemoTrace } from "@/shared/types/demo";
import type { ArchitectureGraph } from "@/shared/types/graph";

interface ArchitectureWorkspaceProps {
  graphs: ArchitectureGraph[];
  graphGroups?: ArchitectureGraphGroup[];
  initialGraphId?: string;
  editable?: boolean;
  onGraphChange?: (graph: ArchitectureGraph) => void;
}

export interface ArchitectureGraphGroup {
  id: string;
  title: string;
  graphs: ArchitectureGraph[];
  emptyText?: string;
}

type ToolPanel = "validation" | "score" | "demo" | "review" | "export";

const workspaceCopy = {
  zh: {
    examples: "示例",
    nodes: "节点",
    edges: "连线",
    risk: "风险",
    issues: "问题",
    score: "评分",
    traceReady: "trace 已就绪",
    validation: "问题",
    scorePanel: "评分",
    demo: "演示",
    review: "复核",
    export: "导出",
    close: "关闭",
    noBlueprints: "这个分组还没有蓝图。",
    idea: "想法",
    assumptions: "假设",
    naiveBaseline: "朴素基线",
    node: "节点",
    noComponent: "未选择组件"
  },
  en: {
    examples: "Examples",
    nodes: "nodes",
    edges: "edges",
    risk: "risk",
    issues: "issues",
    score: "score",
    traceReady: "trace ready",
    validation: "Issues",
    scorePanel: "Score",
    demo: "Demo",
    review: "Review",
    export: "Export",
    close: "Close",
    noBlueprints: "No blueprints in this group yet.",
    idea: "Idea",
    assumptions: "Assumptions",
    naiveBaseline: "Naive Baseline",
    node: "Node",
    noComponent: "No component selected"
  }
};

type WorkspaceCopy = (typeof workspaceCopy)["en"];
export function ArchitectureWorkspace({
  editable = false,
  graphs,
  graphGroups,
  initialGraphId,
  onGraphChange
}: ArchitectureWorkspaceProps) {
  const { language } = useLanguage();
  const copy = workspaceCopy[language];
  const [activeGraphId, setActiveGraphId] = useState(
    initialGraphId ?? graphs[0]?.id ?? ""
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [layoutDirection, setLayoutDirection] =
    useState<GraphLayoutDirection>("horizontal");
  const [activeToolPanel, setActiveToolPanel] = useState<ToolPanel | null>(null);
  const [latestTrace, setLatestTrace] = useState<DemoTrace | null>(null);
  const [reviewFocusNodeIds, setReviewFocusNodeIds] = useState<string[] | null>(null);
  const syncedInitialGraphIdRef = useRef<string | undefined>(undefined);

  const graph = useMemo(
    () => graphs.find((candidate) => candidate.id === activeGraphId) ?? graphs[0],
    [activeGraphId, graphs]
  );
  const visibleGraphGroups =
    graphGroups ??
    [
      {
        id: "examples",
        title: copy.examples,
        graphs
      }
    ];

  const selectedNode =
    graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const canEditGraph = editable && typeof onGraphChange === "function";
  const validation = useMemo(() => validateArchitectureGraph(graph), [graph]);
  const score = useMemo(
    () => scoreArchitectureGraph(graph, validation),
    [graph, validation]
  );

  useEffect(() => {
    const hasInitialGraph =
      initialGraphId &&
      graphs.some((candidate) => candidate.id === initialGraphId);

    if (
      hasInitialGraph &&
      syncedInitialGraphIdRef.current !== initialGraphId
    ) {
      syncedInitialGraphIdRef.current = initialGraphId;
      setActiveGraphId(initialGraphId);
      return;
    }

    if (!graphs.some((candidate) => candidate.id === activeGraphId)) {
      setActiveGraphId(graphs[0]?.id ?? "");
    }
  }, [activeGraphId, graphs, initialGraphId]);
  useEffect(() => {
    setSelectedNodeId(null);
    setActiveToolPanel(null);
    setLatestTrace(null);
    setReviewFocusNodeIds(null);
  }, [graph.id]);

  useEffect(() => {
    if (activeToolPanel !== "review") {
      setReviewFocusNodeIds(null);
    }
  }, [activeToolPanel]);



  const handleSelectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleReviewFocusNodeIds = useCallback((nodeIds: string[] | null) => {
    setReviewFocusNodeIds(nodeIds && nodeIds.length > 0 ? nodeIds : null);
  }, []);

  function handleSelectGraph(graphId: string) {
    setActiveGraphId(graphId);
    setActiveToolPanel(null);
  }

  function commitGraphChange(nextGraph: ArchitectureGraph) {
    if (!canEditGraph) {
      return;
    }

    onGraphChange?.(nextGraph);
    setLatestTrace(null);
  }

  function handleGraphEditChange(
    nextGraph: ArchitectureGraph,
    nextSelectedNodeId?: string | null
  ) {
    commitGraphChange(nextGraph);
    setSelectedNodeId(nextSelectedNodeId ?? null);
  }


  return (
    <main className="architecture-workspace min-h-screen text-ink">
      <header className="architecture-workspace-hero border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1640px] items-start justify-between gap-4">
          <div className="architecture-workspace-hero-copy min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-signal">
                SystemCraft
              </p>
              <Badge tone="data">{graph.nodes.length} {copy.nodes}</Badge>
              <Badge tone="processing">{graph.edges.length} {copy.edges}</Badge>
              <Badge tone="review">{graph.task_profile.risk_level} {copy.risk}</Badge>
              <Badge tone={validation.issues.some((issue) => issue.severity === "critical") ? "danger" : validation.issues.length > 0 ? "warning" : "data"}>
                {validation.issues.length} {copy.issues}
              </Badge>
              <Badge tone={score.overall >= 80 ? "data" : score.overall >= 65 ? "review" : score.overall >= 45 ? "warning" : "danger"}>
                {score.overall} {copy.score}
              </Badge>
              {latestTrace ? <Badge tone="input">{copy.traceReady}</Badge> : null}
            </div>
            <h1 className="mt-1 max-w-5xl truncate text-xl font-semibold leading-7 text-ink md:text-2xl">
              {graph.title}
            </h1>
            <p className="mt-1 max-w-5xl truncate text-sm leading-6 text-slate-600">
              {graph.description}
            </p>
          </div>
          <HeroToolButtons
            copy={copy}
            activePanel={activeToolPanel}
            issueCount={validation.issues.length}
            score={score.overall}
            onChange={setActiveToolPanel}
          />
          {activeToolPanel ? (
            <section
              className="architecture-tool-popover"
              role="dialog"
              aria-label={`${toolPanelTitle(activeToolPanel, copy)} panel`}
            >
              <div className="architecture-tool-popover-header">
                <span>{toolPanelTitle(activeToolPanel, copy)}</span>
                <button type="button" onClick={() => setActiveToolPanel(null)}>
                  {copy.close}
                </button>
              </div>
              <div className="architecture-tool-popover-body">
                <WorkspaceToolContent
                  graph={graph}
                  latestTrace={latestTrace}
                  onSelectNode={handleSelectNode}
                  onReviewFocusNodeIds={handleReviewFocusNodeIds}
                  onTraceChange={setLatestTrace}
                  panel={activeToolPanel}
                  score={score}
                  selectedNodeId={selectedNodeId}
                  validation={validation}
                />
              </div>
            </section>
          ) : null}
        </div>
      </header>

      <section className="architecture-workspace-grid mx-auto grid max-w-[1640px] gap-3 p-3 lg:grid-cols-[236px_minmax(0,1fr)_380px]">
        <aside className="architecture-workspace-rail order-3 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-white/95 p-3 shadow-sm lg:order-none lg:h-[calc(100vh-92px)]">
          {visibleGraphGroups.map((group) => (
            <section key={group.id} className="space-y-2">
              <h2 className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>{group.title}</span>
                <span>{group.graphs.length}</span>
              </h2>
              {group.graphs.length > 0 ? (
                <div className="grid gap-2">
                  {group.graphs.map((candidate) => (
                    <button
                      key={`${group.id}:${candidate.id}`}
                      type="button"
                      onClick={() => handleSelectGraph(candidate.id)}
                      className={`rounded-md border px-3 py-2 text-left text-xs leading-5 transition ${
                        candidate.id === graph.id
                          ? "border-teal-500 bg-teal-50 text-teal-950 shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className="font-semibold">{candidate.title}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs leading-5 text-slate-600">
                  {group.emptyText ?? copy.noBlueprints}
                </p>
              )}
            </section>
          ))}

          <section className="space-y-2 border-t border-slate-200 pt-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {copy.idea}
            </h2>
            <p className="text-xs leading-5 text-slate-700">{graph.user_idea}</p>
          </section>

          <section className="space-y-2 border-t border-slate-200 pt-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {copy.assumptions}
            </h2>
            <ul className="grid gap-1.5">
              {graph.assumptions.map((assumption) => (
                <li
                  key={assumption}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs leading-5 text-slate-700"
                >
                  {assumption}
                </li>
              ))}
            </ul>
          </section>

          {graph.naive_baseline ? (
            <section className="space-y-2 border-t border-slate-200 pt-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {copy.naiveBaseline}
              </h2>
              <p className="text-xs leading-5 text-slate-700">
                {graph.naive_baseline.summary}
              </p>
              <ul className="grid gap-1.5">
                {graph.naive_baseline.failure_modes.slice(0, 2).map((failure) => (
                  <li
                    key={failure}
                    className="rounded-md border border-orange-200 bg-orange-50 px-2.5 py-2 text-xs leading-5 text-orange-950"
                  >
                    {failure}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <GraphLegend />
        </aside>

        <section className="architecture-workspace-canvas order-1 min-w-0 lg:order-none">
          <GraphCanvas
            graph={graph}
            selectedNodeId={selectedNodeId}
            layoutDirection={layoutDirection}
            onLayoutDirectionChange={setLayoutDirection}
            positionScale={0.92}
            validationIssues={validation.issues}
            focusNodeIds={activeToolPanel === "review" ? reviewFocusNodeIds : null}
            onSelectNode={handleSelectNode}
          />
          {canEditGraph ? (
            <div className="architecture-canvas-edit-dock">
              <EditableNodePanel
                className="architecture-canvas-edit-panel"
                graph={graph}
                selectedNodeId={selectedNodeId}
                onGraphChange={handleGraphEditChange}
              />
            </div>
          ) : null}
        </section>

        <section className="architecture-workspace-inspector order-2 grid content-start gap-3 overflow-hidden lg:order-none lg:h-[calc(100vh-92px)]">
          <div className="architecture-node-panel-header">
            <span>{copy.node}</span>
            <strong>{selectedNode ? selectedNode.name : copy.noComponent}</strong>
          </div>
          <div className="architecture-node-panel-body min-h-0 scroll-mt-3">
            <NodeInspector node={selectedNode} />
          </div>
        </section>
      </section>
    </main>
  );
}

function HeroToolButtons({
  copy,
  activePanel,
  issueCount,
  onChange,
  score
}: {
  copy: WorkspaceCopy;
  activePanel: ToolPanel | null;
  issueCount: number;
  onChange: (panel: ToolPanel | null) => void;
  score: number;
}) {
  return (
    <div className="architecture-hero-tools">
      <HeroToolButton
        active={activePanel === "validation"}
        label={copy.validation}
        value={issueCount}
        onClick={() => onChange(activePanel === "validation" ? null : "validation")}
      />
      <HeroToolButton
        active={activePanel === "score"}
        label={copy.scorePanel}
        value={score}
        onClick={() => onChange(activePanel === "score" ? null : "score")}
      />
      <HeroToolButton
        active={activePanel === "demo"}
        label={copy.demo}
        onClick={() => onChange(activePanel === "demo" ? null : "demo")}
      />
      <HeroToolButton
        active={activePanel === "review"}
        label={copy.review}
        onClick={() => onChange(activePanel === "review" ? null : "review")}
      />
      <HeroToolButton
        active={activePanel === "export"}
        label={copy.export}
        onClick={() => onChange(activePanel === "export" ? null : "export")}
      />
    </div>
  );
}

function HeroToolButton({
  active,
  label,
  onClick,
  value
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  value?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`architecture-hero-tool-button ${
        active ? "architecture-hero-tool-button-active" : ""
      }`}
    >
      <span>{label}</span>
      {typeof value === "number" ? <strong>{value}</strong> : null}
    </button>
  );
}

function WorkspaceToolContent({
  graph,
  latestTrace,
  onSelectNode,
  onReviewFocusNodeIds,
  onTraceChange,
  panel,
  score,
  selectedNodeId,
  validation
}: {
  graph: ArchitectureGraph;
  latestTrace: DemoTrace | null;
  onSelectNode: (nodeId: string) => void;
  onReviewFocusNodeIds: (nodeIds: string[] | null) => void;
  onTraceChange: (trace: DemoTrace | null) => void;
  panel: ToolPanel;
  score: ReturnType<typeof scoreArchitectureGraph>;
  selectedNodeId: string | null;
  validation: ReturnType<typeof validateArchitectureGraph>;
}) {
  if (panel === "validation") {
    return (
      <ValidationPanel
        issues={validation.issues}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
      />
    );
  }

  if (panel === "score") {
    return <ScorePanel score={score} onSelectNode={onSelectNode} />;
  }

  if (panel === "demo") {
    return (
      <DemoRunner
        graph={graph}
        onSelectNode={onSelectNode}
        onTraceChange={onTraceChange}
      />
    );
  }

  if (panel === "review") {
    return (
      <DesignReviewPanel
        graph={graph}
        validation={validation}
        score={score}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
        onFocusNodeIds={onReviewFocusNodeIds}
      />
    );
  }

  return (
    <ExportPanel
      graph={graph}
      validation={validation}
      score={score}
      trace={latestTrace}
    />
  );
}

function toolPanelTitle(panel: ToolPanel, copy: WorkspaceCopy) {
  const titles: Record<ToolPanel, string> = {
    validation: copy.validation,
    score: copy.scorePanel,
    demo: copy.demo,
    review: copy.review,
    export: copy.export
  };

  return titles[panel];
}
