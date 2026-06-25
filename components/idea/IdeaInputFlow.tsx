"use client";

import Link from "next/link";
import { LanguageToggle, useLanguage, useLocalizedText, type Language } from "@/components/i18n/LanguageProvider";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DesignReviewPanel } from "@/components/design-review/DesignReviewPanel";
import { ExportPanel } from "@/components/export/ExportPanel";
import { saveGraphToWorkstation } from "@/lib/workstation/browserStorage";
import { scoreArchitectureGraph } from "@/lib/scoring/scoreArchitecture";
import { validateArchitectureGraph } from "@/lib/validation/validateArchitecture";
import type { ClarificationQuestion } from "@/lib/ai/types";
import type { DemoTrace } from "@/shared/types/demo";
import type { ArchitectureGraph, ArchitectureNode } from "@/shared/types/graph";

interface ClarifyResponse {
  questions: ClarificationQuestion[];
  assumptions: string[];
  source: "model" | "fallback";
  warning?: string;
  normalized?: boolean;
}

interface GenerateResponse {
  graph: ArchitectureGraph;
  source: "model" | "fallback";
  warning?: string;
  repaired?: boolean;
  normalized?: boolean;
  validation_errors?: string[];
}

type FlowStatus =
  | "idle"
  | "clarifying"
  | "ready"
  | "generating"
  | "done"
  | "error";

type DetailPanel = "component" | "validation" | "score" | "demo" | "export";

type GuideStepId =
  | "idea"
  | "clarification"
  | "architecture"
  | "validation"
  | "export";

interface GuideStep {
  id: GuideStepId;
  label: string;
  title: string;
  body: string;
  nextAction: string;
}

interface GuideState extends GuideStep {
  currentIndex: number;
}

const guideStepsByLanguage: Record<Language, GuideStep[]> = {
  zh: [
    {
      id: "idea",
      label: "输入",
      title: "告诉我你的想法",
      body: "先不用写得完美。描述你想做的 AI、它要帮谁、以及你最担心它哪里会出错。",
      nextAction: "生成几个关键问题，把模糊想法变成架构约束。"
    },
    {
      id: "clarification",
      label: "问题",
      title: "补全关键问题",
      body: "SystemCraft 会把模糊想法拆成系统设计必须回答的问题。你只需要选择或补充答案。",
      nextAction: "答案确认后生成架构图。"
    },
    {
      id: "architecture",
      label: "架构",
      title: "生成系统架构",
      body: "把需求拆成可解释的 nodes、数据流和反馈回路。这里用于查看和选择 node；修改请进入 Workstation。",
      nextAction: "确认 nodes 后进入验证，检查风险和系统边界。"
    },
    {
      id: "validation",
      label: "验证",
      title: "验证系统风险",
      body: "在导出之前，检查这个系统是否 grounded、可靠、可教学，并标记需要人工处理的边界。",
      nextAction: "风险看清楚后进入导出，把设计交给下一步实现。"
    },
    {
      id: "export",
      label: "导出",
      title: "导出系统蓝图",
      body: "把架构、验证结果、评分、模拟 trace 导出成 JSON 或 Markdown。",
      nextAction: "导出文本蓝图，也可以运行可选的多角色设计复核。"
    }
  ],
  en: [
    {
      id: "idea",
      label: "Idea",
      title: "Tell me your idea",
      body: "It does not need to be perfect. Describe the AI, who it helps, and where you worry it may fail.",
      nextAction: "Generate focused questions that turn a vague idea into architecture constraints."
    },
    {
      id: "clarification",
      label: "Questions",
      title: "Answer the key questions",
      body: "SystemCraft turns fuzzy product intent into the system design questions that matter.",
      nextAction: "Generate the architecture graph after the answers are confirmed."
    },
    {
      id: "architecture",
      label: "Architecture",
      title: "Generate the system architecture",
      body: "Break the idea into explainable nodes, data flows, and feedback loops for inspection.",
      nextAction: "Review the nodes, then move to validation for risks and system boundaries."
    },
    {
      id: "validation",
      label: "Validation",
      title: "Validate system risks",
      body: "Before export, check whether the system is grounded, reliable, teachable, and clear about human-review boundaries.",
      nextAction: "Move to export once the risks are visible."
    },
    {
      id: "export",
      label: "Export",
      title: "Export the system blueprint",
      body: "Export the architecture, validation, score, and simulated trace as JSON or Markdown.",
      nextAction: "Export the text blueprint, or run the optional multi-role design review."
    }
  ]
};

const ideaChipsByLanguage = {
  zh: [
    { label: "+ 它服务谁？", text: "它主要服务 " },
    { label: "+ 输入是什么？", text: "用户会输入 " },
    { label: "+ 输出是什么？", text: "系统应该输出 " },
    { label: "+ 最担心什么风险？", text: "我最担心它会 " }
  ],
  en: [
    { label: "+ Who is it for?", text: "It mainly serves " },
    { label: "+ What is the input?", text: "Users will input " },
    { label: "+ What is the output?", text: "The system should output " },
    { label: "+ Biggest risk?", text: "I am most worried it will " }
  ]
};

const createCopy = {
  zh: {
    exitGuide: "退出引导",
    draftSaved: "草稿会自动保存",
    backHome: "← 返回首页",
    saveOk: "已保存到浏览器缓存",
    saveFailed: "浏览器缓存保存失败：",
    enterIdeaForQuestions: "先输入一个 AI 产品想法，再生成关键问题。",
    enterIdeaForGraph: "先输入一个 AI 产品想法，再生成架构。",
    openNeedsGraph: "先生成一个架构，再进入工作区。",
    preparingQuestions: "SystemCraft 正在准备架构问题。",
    generatingGraph: "SystemCraft 正在生成架构。",
    retryOrFallback: "保留输入文本，重试或继续使用本地回退路径。",
    nextPrefix: "下一步：",
    stepCount: (current: number, total: number) => `第 ${current} 步 / 共 ${total} 步`,
    next: "下一步 →",
    generate: "生成架构 →",
    validate: "查看验证 →",
    export: "进入导出 →",
    openWorkspace: "打开完整工作区 →",
    clarifying: "正在生成问题...",
    generating: "正在生成架构..."
  },
  en: {
    exitGuide: "Exit guide",
    draftSaved: "Draft autosaves",
    backHome: "← Back home",
    saveOk: "Saved to browser cache",
    saveFailed: "Browser cache save failed: ",
    enterIdeaForQuestions: "Enter an AI product idea before generating questions.",
    enterIdeaForGraph: "Enter an AI product idea before generating the architecture.",
    openNeedsGraph: "Generate an architecture before opening the workspace.",
    preparingQuestions: "SystemCraft is preparing architecture questions.",
    generatingGraph: "SystemCraft is generating the architecture.",
    retryOrFallback: "Keep the input text, retry, or continue with the local fallback path.",
    nextPrefix: "Next: ",
    stepCount: (current: number, total: number) => `Step ${current} of ${total}`,
    next: "Next →",
    generate: "Generate architecture →",
    validate: "View validation →",
    export: "Go to export →",
    openWorkspace: "Open full workspace →",
    clarifying: "Generating questions...",
    generating: "Generating architecture..."
  }
};


export function IdeaInputFlow() {
  const { language } = useLanguage();
  const copy = createCopy[language];
  const guideSteps = useMemo(() => guideStepsByLanguage[language], [language]);
  const ideaChips = useMemo(() => ideaChipsByLanguage[language], [language]);
  const [idea, setIdea] = useState("");
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [previewGraph, setPreviewGraph] = useState<ArchitectureGraph | null>(
    null
  );
  const [streamedNodes, setStreamedNodes] = useState<ArchitectureNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [source, setSource] = useState<"model" | "fallback" | null>(null);
  const [activePanel, setActivePanel] = useState<DetailPanel>("component");
  const [latestTrace] = useState<DemoTrace | null>(null);
  const router = useRouter();

  useEffect(() => {
    setSelectedNodeId((current) => {
      if (!previewGraph || !current) {
        return null;
      }

      return previewGraph.nodes.some((node) => node.id === current) ? current : null;
    });
    setActivePanel("component");
  }, [previewGraph]);

  useEffect(() => {
    if (!previewGraph) {
      setSaveStatus(null);
      return;
    }

    const result = saveGraphToWorkstation(previewGraph);
    setSaveStatus(
      result.ok
        ? copy.saveOk
        : copy.saveFailed + (result.error ?? "unknown error")
    );
  }, [previewGraph]);
  const validation = useMemo(
    () => (previewGraph ? validateArchitectureGraph(previewGraph) : null),
    [previewGraph]
  );
  const score = useMemo(
    () =>
      previewGraph && validation
        ? scoreArchitectureGraph(previewGraph, validation)
        : null,
    [previewGraph, validation]
  );

  const answerPayload = questions.map((question) => ({
    question_id: question.id,
    question: question.question,
    answer: answers[question.id] ?? question.default_answer
  }));

  const isBusy = status === "clarifying" || status === "generating";
  const canSubmit = idea.trim().length > 0 && !isBusy;
  const guide = getGuideState({
    activePanel,
    guideSteps,
    hasGraph: Boolean(previewGraph),
    hasQuestions: questions.length > 0,
    language,
    status
  });
  const nextDisabled =
    isBusy || ((guide.id === "idea" || guide.id === "clarification") && !canSubmit);

  async function handleClarify() {
    if (!canSubmit) {
      setMessage(copy.enterIdeaForQuestions);
      return;
    }

    setStatus("clarifying");
    setMessage(null);
    setPreviewGraph(null);
    setStreamedNodes([]);

    try {
      const response = await fetch("/api/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea
        })
      });

      const data = (await response.json()) as ClarifyResponse;

      if (!response.ok) {
        throw new Error("Clarification request failed.");
      }

      setQuestions(data.questions);
      setAnswers(
        Object.fromEntries(
          data.questions.map((question) => [
            question.id,
            question.default_answer
          ])
        )
      );
      setSource(data.source);
      setMessage(
        data.warning ??
          (data.normalized
            ? "Model clarification questions were normalized before display."
            : null)
      );
      setStatus("ready");
    } catch (error) {
      setMessage(getErrorMessage(error));
      setStatus("error");
    }
  }

  async function handleGenerate() {
    if (!canSubmit) {
      setMessage(copy.enterIdeaForGraph);
      return;
    }

    setStatus("generating");
    setMessage(null);
    setStreamedNodes([]);

    try {
      const response = await fetch("/api/generate-architecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea,
          answers: answerPayload,
          stream: true
        })
      });
      const data = await readGenerateResponse(response, {
        onNode: (node) => {
          setStreamedNodes((current) => mergeStreamedNode(current, node));
        },
        onReset: () => setStreamedNodes([]),
        onWarning: (warning) => setMessage(warning)
      });

      setPreviewGraph(data.graph);
      setStreamedNodes(data.graph.nodes);
      setActivePanel("component");
      setSource(data.source);
      setMessage(
        data.warning ??
          (data.repaired && data.normalized
            ? "Model graph was repaired once and normalized to the SystemCraft schema."
            : data.repaired
              ? "Model graph was repaired once."
              : data.normalized
                ? "Model graph was normalized to the SystemCraft schema."
                : null)
      );
      setStatus("done");
    } catch (error) {
      setMessage(getErrorMessage(error));
      setStatus("error");
    }
  }

  function handleIdeaChange(value: string) {
    setIdea(value);
    setSource(null);
    setQuestions([]);
    setAnswers({});
    setPreviewGraph(null);
    setStreamedNodes([]);
    setActivePanel("component");
    setMessage(null);
    setStatus("idle");
  }

  function appendIdeaPrompt(text: string) {
    setIdea((current) => {
      const separator = current.trim().length > 0 ? "\n" : "";
      return current + separator + text;
    });
  }

  function commitPreviewGraph(nextGraph: ArchitectureGraph) {
    setPreviewGraph(nextGraph);
    setStatus("done");
  }

  function handleAddNode() {
    if (!previewGraph) {
      return;
    }

    const { graph, node } = addEditableNode(previewGraph, language);
    commitPreviewGraph(graph);
    setSelectedNodeId(node.id);
  }

  function handleDeleteNode(nodeId: string) {
    if (!previewGraph || previewGraph.nodes.length <= 1) {
      return;
    }

    const remainingNodes = previewGraph.nodes.filter((node) => node.id !== nodeId);
    const nextGraph: ArchitectureGraph = {
      ...previewGraph,
      nodes: remainingNodes,
      edges: previewGraph.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      )
    };

    commitPreviewGraph(nextGraph);
    setSelectedNodeId((current) =>
      current === nodeId ? (remainingNodes[0]?.id ?? null) : current
    );
  }

  function handleNextAction() {
    if (guide.id === "idea") {
      void handleClarify();
      return;
    }

    if (guide.id === "clarification") {
      void handleGenerate();
      return;
    }

    if (guide.id === "architecture") {
      setActivePanel("validation");
      return;
    }

    if (guide.id === "validation") {
      setActivePanel("export");
      return;
    }

    openWorkstation();
  }

  function openWorkstation() {
    if (!previewGraph) {
      setMessage(copy.openNeedsGraph);
      return;
    }

    const result = saveGraphToWorkstation(previewGraph);

    if (!result.ok) {
      setMessage(copy.saveFailed + (result.error ?? "unknown error"));
      return;
    }

    router.push("/workstation?graph=" + encodeURIComponent(previewGraph.id));
  }

  function handleSelectNode(nodeId: string | null) {
    setSelectedNodeId(nodeId);

    if (nodeId) {
      setActivePanel("component");
    }
  }

  function handleSelectTraceNode(nodeId: string) {
    setSelectedNodeId(nodeId);
  }

  function updateAnswer(questionId: string, value: string) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  return (
    <main className="guided-create min-h-screen text-ink">
      <div className="guided-create-ambient" aria-hidden="true">
        <div className="guided-create-glow guided-create-glow-a" />
        <div className="guided-create-glow guided-create-glow-b" />
        <div className="guided-create-glow guided-create-glow-c" />
        <div className="guided-create-sheen" />
      </div>
      <div className="guided-create-grain" aria-hidden="true" />
      <div className="guided-create-micro-texture" aria-hidden="true" />

      <div className="guided-create-app">
        <header className="guided-create-topbar border-b border-slate-200/80 bg-white/90 px-4 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-3">
            <Link href="/" className="guided-create-brand" aria-label="SystemCraft home">
              <span className="guided-create-brand-mark" aria-hidden="true" />
              <span>SystemCraft</span>
            </Link>
            <div className="guided-create-top-actions">
              <LanguageToggle variant="light" />
              <Link
                href="/"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                {copy.exitGuide}
              </Link>
            </div>
          </div>
        </header>

        <section className="guided-create-shell mx-auto max-w-[1680px]">
          <FlowGuide guide={guide} language={language} steps={guideSteps} />
          <div className={`guided-create-content guided-create-content-${guide.id} grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_320px]`}>
            <section className="guided-create-main min-w-0">
              <CreateMainScreen
                key={`main-${guide.id}-${activePanel}`}
                answers={answers}
                canSubmit={canSubmit}
                guide={guide}
                idea={idea}
                ideaChips={ideaChips}
                latestTrace={latestTrace}
                message={message}
                onAppendIdeaPrompt={appendIdeaPrompt}
                onChangeIdea={handleIdeaChange}
                onAddNode={handleAddNode}
                onDeleteNode={handleDeleteNode}
                onSelectNode={setSelectedNodeId}
                onUpdateAnswer={updateAnswer}
                previewGraph={previewGraph}
                questions={questions}
                score={score}
                selectedNodeId={selectedNodeId}
                source={source}
                status={status}
                streamedNodes={streamedNodes}
                validation={validation}
              />
            </section>
            <GuideSidePanel
              key={`side-${guide.id}-${activePanel}`}
              guide={guide}
              onAddNode={handleAddNode}
              onDeleteNode={handleDeleteNode}
              onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
              previewGraph={previewGraph}
              score={score}
              selectedNodeId={selectedNodeId}
              status={status}
              validation={validation}
            />
          </div>

          <div className="guided-create-bottom-bar">
            <div className="guided-create-save-state">
              {saveStatus ?? copy.draftSaved} · {guide.nextAction}
            </div>
            <div className="guided-create-nav-actions">
              <Link href="/" className="guided-create-button">
                {copy.backHome}
              </Link>
              <button
                type="button"
                onClick={handleNextAction}
                disabled={nextDisabled}
                className="guided-create-button guided-create-button-primary"
              >
                {getNextButtonLabel(guide.id, status, language)}
              </button>
            </div>
          </div>
        </section>


        <CreateMiniMap />
      </div>
    </main>
  );
}

function CreateMainScreen({
  answers,
  canSubmit,
  guide,
  idea,
  ideaChips,
  latestTrace,
  message,
  onAppendIdeaPrompt,
  onChangeIdea,
  onAddNode,
  onDeleteNode,
  onSelectNode,
  onUpdateAnswer,
  previewGraph,
  questions,
  score,
  selectedNodeId,
  source,
  status,
  streamedNodes,
  validation
}: {
  answers: Record<string, string>;
  canSubmit: boolean;
  guide: GuideState;
  idea: string;
  ideaChips: (typeof ideaChipsByLanguage)[Language];
  latestTrace: DemoTrace | null;
  message: string | null;
  onAppendIdeaPrompt: (text: string) => void;
  onChangeIdea: (value: string) => void;
  onAddNode: () => void;
  onDeleteNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onUpdateAnswer: (questionId: string, value: string) => void;
  previewGraph: ArchitectureGraph | null;
  questions: ClarificationQuestion[];
  score: ReturnType<typeof scoreArchitectureGraph> | null;
  selectedNodeId: string | null;
  source: "model" | "fallback" | null;
  status: FlowStatus;
  streamedNodes: ArchitectureNode[];
  validation: ReturnType<typeof validateArchitectureGraph> | null;
}) {
  const text = useLocalizedText();

  if (guide.id === "clarification") {
    return (
      <ClarificationScreen
        answers={answers}
        message={message}
        questions={questions}
        status={status}
        onUpdateAnswer={onUpdateAnswer}
      />
    );
  }

  if (guide.id === "architecture") {
    return (
      <ArchitectureScreen
        previewGraph={previewGraph}
        selectedNodeId={selectedNodeId}
        source={source}
        status={status}
        streamedNodes={streamedNodes}
        onAddNode={onAddNode}
        onDeleteNode={onDeleteNode}
        onSelectNode={onSelectNode}
      />
    );
  }

  if (guide.id === "validation") {
    return (
      <ValidationScreen
        previewGraph={previewGraph}
        score={score}
        validation={validation}
      />
    );
  }

  if (guide.id === "export") {
    return (
      <ExportScreen
        latestTrace={latestTrace}
        previewGraph={previewGraph}
        score={score}
        validation={validation}
        onSelectNode={onSelectNode}
        selectedNodeId={selectedNodeId}
      />
    );
  }

  return (
    <IdeaScreen
      canSubmit={canSubmit}
      idea={idea}
      ideaChips={ideaChips}
      message={message}
      status={status}
      onAppendIdeaPrompt={onAppendIdeaPrompt}
      onChangeIdea={onChangeIdea}
    />
  );
}

function IdeaScreen({
  canSubmit,
  idea,
  ideaChips,
  message,
  onAppendIdeaPrompt,
  onChangeIdea,
  status
}: {
  canSubmit: boolean;
  idea: string;
  ideaChips: (typeof ideaChipsByLanguage)[Language];
  message: string | null;
  onAppendIdeaPrompt: (text: string) => void;
  onChangeIdea: (value: string) => void;
  status: FlowStatus;
}) {
  const text = useLocalizedText();

  return (
    <section className="guided-create-screen guided-create-screen-active">
      <PageTitle
        icon="✍︎"
        title={text("告诉我你的想法", "Tell me your idea")}
        subtitle={text(
          "先不用写得完美。描述你想做的 AI、它要帮谁、以及你最担心它哪里会出错。",
          "It does not need to be perfect. Describe the AI, who it helps, and where you worry it may fail."
        )}
      />

      <div className="guided-create-panel">
        <div className="guided-create-field-header">
          <div className="guided-create-field-label">
            {text("你想做一个什么样的 AI？", "What kind of AI are you building?")}
          </div>
          <div className="guided-create-field-hint">
            {text("建议 2-5 句话", "2 to 5 sentences works best")}
          </div>
        </div>
        <textarea
          value={idea}
          onChange={(event) => onChangeIdea(event.target.value)}
          rows={8}
          className="guided-create-textarea w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          placeholder={text(
            "例如：我想做一个研究助手，能帮我找资料、整理观点并生成初稿。但我担心它会编造参考文献，或者把不可靠的来源当成事实。",
            "Example: I want to build a research assistant that finds sources, organizes arguments, and drafts an outline. I am worried it may invent citations or treat weak sources as facts."
          )}
        />
        <div className="guided-create-chip-row">
          {ideaChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => onAppendIdeaPrompt(chip.text)}
              className="guided-create-chip"
            >
              {chip.label}
            </button>
          ))}
        </div>
        {!canSubmit ? (
          <p className="guided-create-small-text">
            {text("输入想法后，底部按钮会进入下一步。", "After you enter an idea, the bottom button moves to the next step.")}
          </p>
        ) : null}
        <InlineMessage message={message} />
      </div>
    </section>
  );
}

function ClarificationScreen({
  answers,
  message,
  onUpdateAnswer,
  questions,
  status
}: {
  answers: Record<string, string>;
  message: string | null;
  onUpdateAnswer: (questionId: string, value: string) => void;
  questions: ClarificationQuestion[];
  status: FlowStatus;
}) {
  const text = useLocalizedText();

  return (
    <section className="guided-create-screen guided-create-screen-active">
      <PageTitle
        icon="?"
        title={text("补全关键问题", "Answer the key questions")}
        subtitle={text(
          "SystemCraft 会把模糊想法拆成系统设计必须回答的问题。你只需要选择或补充答案。",
          "SystemCraft turns fuzzy product intent into the system design questions that matter. You only need to choose or refine the answers."
        )}
      />

      <div className="guided-create-panel">
        {questions.length === 0 ? (
          status === "clarifying" ? (
            <GenerationWaitingState title={text("正在生成关键问题", "Generating key questions")} />
          ) : (
            <div className="guided-create-empty-state">
              <div className="guided-create-title-icon">?</div>
              <h3>{text("等待生成关键问题", "Waiting to generate key questions")}</h3>
            </div>
          )
        ) : (
          <div className="guided-create-question-list">
            {questions.map((question) => (
              <fieldset key={question.id} className="guided-create-question">
                <div className="guided-create-question-top">
                  <legend className="guided-create-question-title">
                    {question.question}
                  </legend>
                  <span className="guided-create-tag">scope</span>
                </div>
                <p className="guided-create-question-note">
                  {question.why_it_matters}
                </p>
                <div className="guided-create-answer-row">
                  {question.options?.map((option) => {
                    const checked =
                      (answers[question.id] ?? question.default_answer) === option;

                    return (
                      <label
                        key={option}
                        className={
                          checked
                            ? "guided-create-option guided-create-option-selected"
                            : "guided-create-option"
                        }
                      >
                        <input
                          type="radio"
                          name={question.id}
                          value={option}
                          checked={checked}
                          onChange={() => onUpdateAnswer(question.id, option)}
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        )}
        <InlineMessage message={message} />
      </div>
    </section>
  );
}

function GenerationWaitingState({ title }: { title: string }) {
  return (
    <div className="guided-create-empty-state guided-create-wait-state" aria-live="polite">
      <div className="guided-create-hourglass" aria-hidden="true">⌛</div>
      <h3>{title}</h3>
      <div className="guided-create-wait-bar" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}

function StreamingNodePreview({ nodes }: { nodes: ArchitectureNode[] }) {
  const text = useLocalizedText();

  return (
    <div className="guided-create-stream-preview" aria-live="polite">
      <GenerationWaitingState
        title={text(
          `已接收 ${nodes.length} 个 node，正在继续生成完整架构`,
          `Received ${nodes.length} nodes and continuing the full architecture`
        )}
      />
      <div className="guided-create-stream-node-grid">
        {nodes.map((node, index) => (
          <article key={node.id} className="guided-create-stream-node-card">
            <span className="guided-create-node-type">
              {node.type.replaceAll("_", " ")}
            </span>
            <strong>{index + 1}. {node.name}</strong>
            <p>{node.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
function ArchitectureScreen({
  onAddNode,
  onDeleteNode,
  onSelectNode,
  previewGraph,
  selectedNodeId,
  source,
  status,
  streamedNodes
}: {
  onAddNode: () => void;
  onDeleteNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  previewGraph: ArchitectureGraph | null;
  selectedNodeId: string | null;
  source: "model" | "fallback" | null;
  status: FlowStatus;
  streamedNodes: ArchitectureNode[];
}) {
  const text = useLocalizedText();

  return (
    <section className="guided-create-screen guided-create-screen-active">
      <PageTitle
        icon="⌘"
        title={text("编辑系统架构", "Edit the system architecture")}
        subtitle={text(
          "选择一个 node 查看职责；需要修改 node 时进入 Workstation。",
          "Select a node to inspect its responsibilities. Use Workstation when you need to edit nodes."
        )}
      />

      <div className="guided-create-panel">
        {!previewGraph ? (
          status === "generating" ? (
            streamedNodes.length > 0 ? (
              <StreamingNodePreview nodes={streamedNodes} />
            ) : (
              <GenerationWaitingState title={text("正在生成架构", "Generating architecture")} />
            )
          ) : (
            <div className="guided-create-empty-state">
              <div className="guided-create-title-icon">⌘</div>
              <h3>{text("等待生成架构", "Waiting to generate architecture")}</h3>
              <p>{text("生成完成后会在这里编辑用户蓝图的 nodes。", "Once generation finishes, you can edit the blueprint nodes here.")}</p>
            </div>
          )
        ) : (
          <ArchitectureNodeEditor
            graph={previewGraph}
            selectedNodeId={selectedNodeId}
            source={source}
            onAddNode={onAddNode}
            onDeleteNode={onDeleteNode}
            onSelectNode={onSelectNode}
          />
        )}
      </div>
    </section>
  );
}
function ValidationScreen({
  previewGraph,
  score,
  validation
}: {
  previewGraph: ArchitectureGraph | null;
  score: ReturnType<typeof scoreArchitectureGraph> | null;
  validation: ReturnType<typeof validateArchitectureGraph> | null;
}) {
  const text = useLocalizedText();

  return (
    <section className="guided-create-screen guided-create-screen-active">
      <PageTitle
        icon="✓"
        title={text("验证系统风险", "Validate system risks")}
        subtitle={text(
          "在导出之前，检查这个系统是否 grounded、可靠、可教学，并标记需要人工处理的边界。",
          "Before export, check whether the system is grounded, reliable, teachable, and clear about human-review boundaries."
        )}
      />

      <div className="guided-create-panel">
        {!previewGraph || !validation || !score ? (
          <div className="guided-create-empty-state">
            <div className="guided-create-title-icon">✓</div>
            <h3>{text("还没有可验证的架构", "No architecture to validate yet")}</h3>
            <p>{text("先完成架构生成，再进入验证。", "Generate the architecture before moving into validation.")}</p>
          </div>
        ) : (
          <div className="guided-create-validation-grid">
            <div className="guided-create-score-card">
              <span>Validation Score</span>
              <strong>{score.overall}</strong>
              <p>{score.band.replaceAll("_", " ")}</p>
            </div>
            {validation.issues.length === 0 ? (
              <div className="guided-create-check-row">
                <div className="guided-create-status-icon">✓</div>
                <div>
                  <div className="guided-create-status-title">No deterministic issues</div>
                  <div className="guided-create-status-sub">
                    {text("当前图谱通过结构、边界和输出检查。", "The current graph passes structure, boundary, and output checks.")}
                  </div>
                </div>
                <div className="guided-create-score-pill">{text("通过", "Pass")}</div>
              </div>
            ) : (
              validation.issues.slice(0, 4).map((issue) => (
                <div key={issue.id} className="guided-create-check-row">
                  <div className="guided-create-status-icon">
                    {severitySymbol(issue.severity)}
                  </div>
                  <div>
                    <div className="guided-create-status-title">{issue.title}</div>
                    <div className="guided-create-status-sub">{issue.description}</div>
                  </div>
                  <div className="guided-create-tag">{issue.severity}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ExportScreen({
  latestTrace,
  onSelectNode,
  previewGraph,
  score,
  selectedNodeId,
  validation
}: {
  latestTrace: DemoTrace | null;
  onSelectNode: (nodeId: string) => void;
  previewGraph: ArchitectureGraph | null;
  score: ReturnType<typeof scoreArchitectureGraph> | null;
  selectedNodeId: string | null;
  validation: ReturnType<typeof validateArchitectureGraph> | null;
}) {
  const text = useLocalizedText();
  const [showDesignReview, setShowDesignReview] = useState(false);

  return (
    <section className="guided-create-screen guided-create-screen-active">
      <PageTitle
        icon="↗"
        title={text("导出系统蓝图", "Export the system blueprint")}
        subtitle={text(
          "把架构、风险检查和教学说明导出成可继续编辑、分享或交付的系统文档。",
          "Export the architecture, risk checks, and teaching notes into a system document you can edit, share, or hand off."
        )}
      />

      <div className="guided-create-panel guided-create-export-panel">
        {previewGraph && validation && score ? (
          <div className="grid gap-4">
            <ExportPanel
              graph={previewGraph}
              validation={validation}
              score={score}
              trace={latestTrace}
            />
            {showDesignReview ? (
              <DesignReviewPanel
                graph={previewGraph}
                validation={validation}
                score={score}
                selectedNodeId={selectedNodeId}
                onSelectNode={onSelectNode}
              />
            ) : (
              <section className="rounded-lg border border-slate-200 bg-white/95 p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-ink">
                  {text("可选设计复核", "Optional design review")}
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {text(
                    "导出已经可用。需要多角色复核时，再手动打开 transcript 和音频面板。",
                    "Export is ready. Open the transcript and audio panel only when you need the multi-role review."
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setShowDesignReview(true)}
                  className="mt-3 min-h-9 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  {text("打开设计复核", "Open design review")}
                </button>
              </section>
            )}
          </div>
        ) : (
          <div className="guided-create-empty-state">
            <div className="guided-create-title-icon">↗</div>
            <h3>{text("还没有可导出的蓝图", "No blueprint to export yet")}</h3>
            <p>{text("先完成架构生成和验证。", "Finish architecture generation and validation first.")}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PageTitle({
  icon,
  subtitle,
  title
}: {
  icon: string;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="guided-create-page-title">
      <div className="guided-create-title-icon">{icon}</div>
      <div>
        <h1>{title}</h1>
        <div className="guided-create-title-sub">{subtitle}</div>
      </div>
    </div>
  );
}

function ArchitectureNodeEditor({
  graph,
  onAddNode,
  onDeleteNode,
  onSelectNode,
  selectedNodeId,
  source
}: {
  graph: ArchitectureGraph;
  onAddNode: () => void;
  onDeleteNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  selectedNodeId: string | null;
  source: "model" | "fallback" | null;
}) {
  const text = useLocalizedText();
  const selectedNode =
    graph.nodes.find((node) => node.id === selectedNodeId) ?? graph.nodes[0] ?? null;

  return (
    <section className="guided-create-node-editor">
      <div className="guided-create-field-header guided-create-editor-header">
        <div>
          <div className="guided-create-field-label">{text("查看 nodes", "Inspect nodes")}</div>
          <div className="guided-create-field-hint">
            {graph.nodes.length} nodes · {graph.edges.length} flows
          </div>
        </div>
        <div className="guided-create-editor-actions">
          <button
            type="button"
            className="guided-create-editor-button"
            onClick={onAddNode}
          >
            {text("+ 添加 node", "+ Add node")}
          </button>
          <button
            type="button"
            className="guided-create-editor-button guided-create-editor-button-danger"
            disabled={!selectedNode || graph.nodes.length <= 1}
            onClick={() => selectedNode && onDeleteNode(selectedNode.id)}
          >
            {text("删除选中 node", "Delete selected node")}
          </button>
        </div>
      </div>

      <div className="guided-create-node-editor-grid">
        <div className="guided-create-node-list" aria-label={text("架构节点列表", "Architecture node list")}>
          {graph.nodes.map((node) => {
            const active = selectedNode?.id === node.id;

            return (
              <button
                key={node.id}
                type="button"
                className={
                  active
                    ? "guided-create-node-card guided-create-node-card-selected"
                    : "guided-create-node-card"
                }
                onClick={() => onSelectNode(node.id)}
              >
                <span className="guided-create-node-type">{node.type.replaceAll("_", " ")}</span>
                <strong>{node.name}</strong>
                <span>{node.description}</span>
              </button>
            );
          })}
        </div>

        {selectedNode ? (
          <ArchitectureNodeDetail node={selectedNode} />
        ) : (
          <div className="guided-create-node-detail">
            <p>{text("添加一个 node 开始编辑。", "Add a node to start editing.")}</p>
          </div>
        )}
      </div>

      {source ? (
        <div className="guided-create-small-text">
          {text(
            `来源：${getSourceLabel(source)}。完整图谱、检查器、模拟和导出会在 Workstation 中打开。`,
            `Source: ${getSourceLabel(source)}. The full graph, inspector, simulation, and export open in Workstation.`
          )}
        </div>
      ) : null}
    </section>
  );
}

function ArchitectureNodeDetail({ node }: { node: ArchitectureNode }) {
  const text = useLocalizedText();
  const emptyLabel = text("未定义", "undefined");

  return (
    <div className="guided-create-node-detail">
      <div className="guided-create-node-detail-top">
        <span className="guided-create-tag">{node.type.replaceAll("_", " ")}</span>
        <span>{node.inputs.length} inputs · {node.outputs.length} outputs</span>
      </div>
      <h3>{node.name}</h3>
      <p>{node.description}</p>
      <div className="guided-create-node-detail-grid">
        <div>
          <span>Inputs</span>
          <strong>{formatPortNames(node.inputs, emptyLabel)}</strong>
        </div>
        <div>
          <span>Outputs</span>
          <strong>{formatPortNames(node.outputs, emptyLabel)}</strong>
        </div>
        <div>
          <span>Risk</span>
          <strong>{node.risks[0]?.severity ?? "low"}</strong>
        </div>
      </div>
    </div>
  );
}
function formatPortNames(ports: ArchitectureNode["inputs"], emptyLabel: string) {
  if (ports.length === 0) {
    return emptyLabel;
  }

  return ports.map((port) => port.name).join(" / ");
}

function addEditableNode(graph: ArchitectureGraph, language: Language) {
  const node = createEditableNode(graph, language);

  return {
    graph: {
      ...graph,
      nodes: [...graph.nodes, node]
    },
    node
  };
}

function createEditableNode(graph: ArchitectureGraph, language: Language): ArchitectureNode {
  const index = graph.nodes.length + 1;
  const id = uniqueNodeId(graph, "custom-node-" + index);
  const isEnglish = language === "en";

  return {
    id,
    type: "tool",
    name: (isEnglish ? "New node " : "新 node ") + index,
    description: isEnglish
      ? "Describe this node's responsibilities, inputs, outputs, and failure handling."
      : "描述这个 node 的职责、输入、输出和失败处理。",
    inputs: [
      {
        name: "input",
        description: isEnglish
          ? "Request or data from an upstream node."
          : "来自上游 node 的请求或数据。"
      }
    ],
    outputs: [
      {
        name: "output",
        description: isEnglish
          ? "Processed result handed to a downstream node."
          : "交给下游 node 的处理结果。"
      }
    ],
    config: {},
    risks: [
      {
        risk_type: "undefined_behavior",
        severity: "warning",
        description: isEnglish
          ? "This new node still needs clear boundaries and failure conditions."
          : "新 node 还需要明确边界和失败条件。",
        mitigation: isEnglish
          ? "Add responsibilities, inputs, outputs, validation rules, and human-review conditions."
          : "补充职责、输入输出、验证规则和人工复核条件。"
      }
    ],
    cost_estimate: {
      relative: "low",
      notes: "Manual draft node; estimate after responsibilities are finalized."
    },
    latency_estimate: {
      relative: "low",
      notes: "Manual draft node; estimate after integration details are known."
    },
    alternatives: [
      {
        name: isEnglish ? "Merge into a neighboring node" : "合并到相邻 node",
        tradeoff: isEnglish
          ? "If the responsibility is small, merging can reduce flow complexity."
          : "如果职责很小，合并可以减少流程复杂度。"
      }
    ],
    explanation_for_beginner: isEnglish
      ? "This is a manually added draft node for filling gaps in the generated architecture."
      : "这是一个手动添加的草稿 node，用来补充生成架构遗漏的步骤。",
    position: {
      x: 180 + (index % 4) * 220,
      y: 120 + Math.floor(index / 4) * 160
    }
  };
}

function uniqueNodeId(graph: ArchitectureGraph, baseId: string) {
  const existing = new Set(graph.nodes.map((node) => node.id));
  let candidate = baseId;
  let suffix = 2;

  while (existing.has(candidate)) {
    candidate = baseId + "-" + suffix;
    suffix += 1;
  }

  return candidate;
}

function GuideSidePanel({
  guide,
  onAddNode,
  onDeleteNode,
  onSelectNode,
  previewGraph,
  score,
  selectedNodeId,
  status,
  validation
}: {
  guide: GuideState;
  onAddNode?: () => void;
  onDeleteNode?: (nodeId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  previewGraph: ArchitectureGraph | null;
  score: ReturnType<typeof scoreArchitectureGraph> | null;
  selectedNodeId?: string | null;
  status: FlowStatus;
  validation: ReturnType<typeof validateArchitectureGraph> | null;
}) {
  const text = useLocalizedText();

  if (guide.id === "clarification") {
    return (
      <aside className="guided-create-side">
        <GuideCard title={text("SystemCraft 正在做什么", "What SystemCraft is doing")}>
          <div className="guided-create-callout-quote">
            {text(
              "从一句想法中提取：用户、输入、知识来源、失败模式、验证标准。",
              "Extracting users, inputs, knowledge sources, failure modes, and validation standards from one idea."
            )}
          </div>
          <p className="guided-create-small-text">
            {text(
              "这一步的目标不是写产品需求文档，而是找到系统架构的边界条件。",
              "This step is not a product requirements document. It finds the boundary conditions for the system architecture."
            )}
          </p>
        </GuideCard>
        <GuideCard title={text("保持轻量", "Keep it lightweight")}>
          <CoachList
            items={[
              text("只确认会改变架构的问题。", "Only confirm answers that would change the architecture."),
              text("不知道答案时，可以保留默认假设。", "When you are unsure, keep the default assumption.")
            ]}
          />
        </GuideCard>
      </aside>
    );
  }

  if (guide.id === "architecture") {
    const selectedNode =
      previewGraph?.nodes.find((node) => node.id === selectedNodeId) ??
      previewGraph?.nodes[0] ??
      null;

    return (
      <aside className="guided-create-side guided-create-side-editor">
        <GuideCard title={text("架构状态", "Architecture status")}>
          <div className="guided-create-callout-quote">
            {previewGraph
              ? text("蓝图已准备好。这里可以选择和查看 node；修改请进入 Workstation。", "The blueprint is ready. Select and inspect nodes here; edit them in Workstation.")
              : status === "generating"
                ? text("正在生成模块、数据流和验证边界。", "Generating modules, data flows, and validation boundaries.")
                : text("下一步会生成架构。", "The next step will generate the architecture.")}
          </div>
          <p className="guided-create-small-text">
            {text(
              "完整图谱、检查器、模拟和导出会在 Workstation 中打开。",
              "The full graph, inspector, simulation, and export open in Workstation."
            )}
          </p>
        </GuideCard>
        <GuideCard title={text("编辑 node", "Edit node")}>
          {previewGraph ? (
            <div className="guided-create-side-node-editor">
              <div className="guided-create-editor-actions guided-create-side-editor-actions">
                <button
                  type="button"
                  className="guided-create-editor-button"
                  onClick={onAddNode}
                >
                  {text("+ 添加 node", "+ Add node")}
                </button>
                <button
                  type="button"
                  className="guided-create-editor-button guided-create-editor-button-danger"
                  disabled={!selectedNode || previewGraph.nodes.length <= 1}
                  onClick={() => selectedNode && onDeleteNode?.(selectedNode.id)}
                >
                  {text("删除选中 node", "Delete selected node")}
                </button>
              </div>
              <div className="guided-create-side-node-list" aria-label={text("选择架构 node", "Select architecture node")}>
                {previewGraph.nodes.map((node) => {
                  const active = selectedNode?.id === node.id;

                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={
                        active
                          ? "guided-create-side-node-pill guided-create-side-node-pill-selected"
                          : "guided-create-side-node-pill"
                      }
                      onClick={() => onSelectNode?.(node.id)}
                    >
                      <span>{node.type.replaceAll("_", " ")}</span>
                      <strong>{node.name}</strong>
                    </button>
                  );
                })}
              </div>
              {selectedNode ? (
                <ArchitectureNodeDetail node={selectedNode} />
              ) : (
                <p className="guided-create-small-text">{text("添加一个 node 开始编辑。", "Add a node to start editing.")}</p>
              )}
            </div>
          ) : (
            <p className="guided-create-small-text">
              {text("生成完成后这里会展开 node 编辑面板。", "After generation finishes, the node editor opens here.")}
            </p>
          )}
        </GuideCard>
      </aside>
    );
  }

  if (guide.id === "validation") {
    return (
      <aside className="guided-create-side">
        <GuideCard title="Validation Score">
          <div className="guided-create-callout-quote guided-create-score-quote">
            {score?.overall ?? "--"}<span> / 100</span>
          </div>
          <p className="guided-create-small-text">
            {validation
              ? text(
                  validation.issues.length + " 个确定性检查项需要关注。",
                  validation.issues.length + " deterministic checks need attention."
                )
              : text("完成架构生成后显示验证结果。", "Validation results appear after architecture generation.")}
          </p>
        </GuideCard>
        <GuideCard title={text("下一步建议", "Next suggestions")}>
          <CoachList
            items={[
              text("确认风险项是否需要人工复核。", "Confirm which risks require human review."),
              text("检查输出契约是否足够明确。", "Check whether output contracts are clear enough.")
            ]}
          />
        </GuideCard>
      </aside>
    );
  }

  if (guide.id === "export") {
    return (
      <aside className="guided-create-side">
        <GuideCard title={text("最终结果", "Final result")}>
          <div className="guided-create-callout-quote">
            {previewGraph
              ? text(previewGraph.title + " 已准备好导出。", previewGraph.title + " is ready to export.")
              : text("蓝图完成后会显示导出内容。", "Export content appears after the blueprint is complete.")}
          </div>
          <p className="guided-create-small-text">
            {text(
              "进入 Workstation 后，可以继续查看图谱、验证结果、评分和本地模拟 trace。",
              "In Workstation, you can continue reviewing the graph, validation results, score, and local simulated trace."
            )}
          </p>
        </GuideCard>
      </aside>
    );
  }

  return (
    <aside className="guided-create-side">
      <GuideCard title={text("输入时可以想这 3 件事", "Think through these 3 things")}>
        <CoachList
          items={[
            text(
              "这个 AI 主要帮用户完成什么决定或动作？",
              "What decision or action should this AI help users complete?"
            ),
            text(
              "它需要依赖哪些资料、工具或外部系统？",
              "What sources, tools, or external systems does it depend on?"
            ),
            text(
              "什么情况下输出会变得危险、不可信或不可用？",
              "When could the output become unsafe, unreliable, or unusable?"
            )
          ]}
        />
      </GuideCard>
      <GuideCard title={text("创建流程会保持简洁", "The create flow stays lightweight")}>
        <p className="guided-create-small-text">
          {text(
            "创建流程先生成你的蓝图，再进入 node 编辑和验证。",
            "The create flow generates your blueprint first, then moves into node editing and validation."
          )}
        </p>
      </GuideCard>
    </aside>
  );
}

function GuideCard({
  children,
  title
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="guided-create-card">
      <div className="guided-create-card-title">{title}</div>
      {children}
    </section>
  );
}

function CoachList({ items }: { items: string[] }) {
  return (
    <div className="guided-create-coach-list">
      {items.map((item, index) => (
        <div key={item} className="guided-create-coach-item">
          <span className="guided-create-coach-dot">{index + 1}</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function InlineMessage({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return <p className="guided-create-warning">{message}</p>;
}


function FlowGuide({
  guide,
  language,
  steps
}: {
  guide: GuideState;
  language: Language;
  steps: GuideStep[];
}) {
  const copy = createCopy[language];

  return (
    <div className="guided-create-progress-wrap mx-auto mt-4 max-w-[1680px] overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
      <div className="guided-create-progress-top">
        <ol className="guided-create-steps-line grid min-w-[620px] grid-cols-5 gap-2">
          {steps.map((step, index) => (
            <li key={step.id}>
              <FlowGuideStep
                active={step.id === guide.id}
                complete={index < guide.currentIndex}
                label={step.label}
                stepNumber={index + 1}
              />
            </li>
          ))}
        </ol>
        <div className="guided-create-step-count">
          {copy.stepCount(guide.currentIndex + 1, steps.length)}
        </div>
      </div>
      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
        <span className="font-semibold text-slate-950">{copy.nextPrefix}</span>
        {guide.nextAction}
      </div>
    </div>
  );
}
function FlowGuideStep({
  active,
  complete,
  label,
  stepNumber
}: {
  active: boolean;
  complete: boolean;
  label: string;
  stepNumber: number;
}) {
  const className = active
    ? "guided-create-step active"
    : complete
      ? "guided-create-step done"
      : "guided-create-step";

  return (
    <div aria-current={active ? "step" : undefined} className={className}>
      <span className="guided-create-dot">{stepNumber}</span>
      <span>{label}</span>
    </div>
  );
}

function CreateMiniMap() {
  return (
    <svg className="guided-create-mini-map" viewBox="0 0 220 92" fill="none" aria-hidden="true">
      <path d="M8 52 C36 24 62 28 88 44 C116 62 132 42 154 30 C178 18 194 26 212 40" stroke="rgba(80,64,139,.85)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M34 66 C74 44 94 76 132 62 C156 54 166 36 190 48" stroke="rgba(170,140,255,.55)" strokeWidth="1" strokeLinecap="round" strokeDasharray="2 6" />
      <circle cx="88" cy="44" r="4" fill="rgba(217,230,255,.7)" />
      <circle cx="154" cy="30" r="4" fill="rgba(80,64,139,.9)" />
      <circle cx="190" cy="48" r="4" fill="rgba(170,140,255,.7)" />
    </svg>
  );
}

function getGuideState({
  activePanel,
  guideSteps,
  hasGraph,
  hasQuestions,
  language,
  status
}: {
  activePanel: DetailPanel;
  guideSteps: GuideStep[];
  hasGraph: boolean;
  hasQuestions: boolean;
  language: Language;
  status: FlowStatus;
}): GuideState {
  const copy = createCopy[language];
  const id = getGuideStepId({ activePanel, hasGraph, hasQuestions, status });
  const currentIndex = guideSteps.findIndex((step) => step.id === id);
  const step = guideSteps[currentIndex] ?? guideSteps[0];

  if (status === "clarifying") {
    return {
      ...step,
      nextAction: copy.preparingQuestions,
      currentIndex
    };
  }

  if (status === "generating") {
    return {
      ...step,
      nextAction: copy.generatingGraph,
      currentIndex
    };
  }

  if (status === "error") {
    return {
      ...step,
      nextAction: copy.retryOrFallback,
      currentIndex
    };
  }

  return { ...step, currentIndex };
}
function getGuideStepId({
  activePanel,
  hasGraph,
  hasQuestions,
  status
}: {
  activePanel: DetailPanel;
  hasGraph: boolean;
  hasQuestions: boolean;
  status: FlowStatus;
}): GuideStepId {
  if (activePanel === "export") {
    return "export";
  }

  if (activePanel === "validation" || activePanel === "score" || activePanel === "demo") {
    return "validation";
  }

  if (status === "generating") {
    return "architecture";
  }

  if (status === "ready" || status === "clarifying") {
    return "clarification";
  }

  if (hasGraph) {
    return "architecture";
  }

  return hasQuestions ? "clarification" : "idea";
}

function getNextButtonLabel(
  stepId: GuideStepId,
  status: FlowStatus,
  language: Language
) {
  const copy = createCopy[language];

  if (status === "clarifying") {
    return copy.clarifying;
  }

  if (status === "generating") {
    return copy.generating;
  }

  if (stepId === "idea") {
    return copy.next;
  }

  if (stepId === "clarification") {
    return copy.generate;
  }

  if (stepId === "architecture") {
    return copy.validate;
  }

  if (stepId === "validation") {
    return copy.export;
  }

  return copy.openWorkspace;
}
function DetailPanelTabs({
  activePanel,
  issueCount,
  onChange,
  score
}: {
  activePanel: DetailPanel;
  issueCount: number;
  onChange: (panel: DetailPanel) => void;
  score: number;
}) {
  return (
    <div className="grid grid-cols-5 gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm">
      <PanelTab
        active={activePanel === "component"}
        label="Node"
        onClick={() => onChange("component")}
      />
      <PanelTab
        active={activePanel === "validation"}
        label={"Issues " + issueCount}
        onClick={() => onChange("validation")}
      />
      <PanelTab
        active={activePanel === "score"}
        label={"Score " + score}
        onClick={() => onChange("score")}
      />
      <PanelTab
        active={activePanel === "demo"}
        label="Demo"
        onClick={() => onChange("demo")}
      />
      <PanelTab
        active={activePanel === "export"}
        label="Export"
        onClick={() => onChange("export")}
      />
    </div>
  );
}

function PanelTab({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "min-h-9 rounded-md bg-slate-900 px-2 py-1.5 text-xs font-semibold text-white shadow-sm transition"
          : "min-h-9 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
      }
    >
      {label}
    </button>
  );
}


type GenerateStreamEvent =
  | { type: "meta"; source?: "model" | "fallback" }
  | { type: "reset" }
  | { type: "node"; node: ArchitectureNode }
  | { type: "warning"; warning: string; validation_errors?: string[] }
  | GenerateResponseEvent
  | { type: "error"; error: string };

type GenerateResponseEvent = GenerateResponse & { type: "graph" };

interface GenerateStreamHandlers {
  onNode: (node: ArchitectureNode) => void;
  onReset: () => void;
  onWarning: (warning: string) => void;
}

async function readGenerateResponse(
  response: Response,
  handlers: GenerateStreamHandlers
): Promise<GenerateResponse> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Architecture generation failed.");
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/x-ndjson")) {
    return (await response.json()) as GenerateResponse;
  }

  if (!response.body) {
    throw new Error("Architecture generation stream did not include a response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: GenerateResponse | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseGenerateStreamEvent(line);

        if (event) {
          result = handleGenerateStreamEvent(event, handlers) ?? result;
        }
      }
    }

    buffer += decoder.decode();

    for (const line of buffer.split(/\r?\n/)) {
      const event = parseGenerateStreamEvent(line);

      if (event) {
        result = handleGenerateStreamEvent(event, handlers) ?? result;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!result) {
    throw new Error("Architecture generation stream ended without a graph.");
  }

  return result;
}

function handleGenerateStreamEvent(
  event: GenerateStreamEvent,
  handlers: GenerateStreamHandlers
): GenerateResponse | null {
  if (event.type === "reset") {
    handlers.onReset();
    return null;
  }

  if (event.type === "node") {
    handlers.onNode(event.node);
    return null;
  }

  if (event.type === "warning") {
    handlers.onWarning(event.warning);
    return null;
  }

  if (event.type === "error") {
    throw new Error(event.error);
  }

  if (event.type === "graph") {
    return {
      graph: event.graph,
      source: event.source,
      warning: event.warning,
      repaired: event.repaired,
      normalized: event.normalized,
      validation_errors: event.validation_errors
    };
  }

  return null;
}

function parseGenerateStreamEvent(line: string): GenerateStreamEvent | null {
  const trimmed = line.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const event = JSON.parse(trimmed) as unknown;

    if (!isRecord(event) || typeof event.type !== "string") {
      return null;
    }

    if (event.type === "node" && isRecord(event.node)) {
      return { type: "node", node: event.node as unknown as ArchitectureNode };
    }

    if (event.type === "graph" && isRecord(event.graph)) {
      return {
        type: "graph",
        graph: event.graph as unknown as ArchitectureGraph,
        source: event.source === "fallback" ? "fallback" : "model",
        warning: typeof event.warning === "string" ? event.warning : undefined,
        repaired: event.repaired === true,
        normalized: event.normalized === true,
        validation_errors: Array.isArray(event.validation_errors)
          ? event.validation_errors.filter((item): item is string => typeof item === "string")
          : undefined
      };
    }

    if (event.type === "warning" && typeof event.warning === "string") {
      return {
        type: "warning",
        warning: event.warning,
        validation_errors: Array.isArray(event.validation_errors)
          ? event.validation_errors.filter((item): item is string => typeof item === "string")
          : undefined
      };
    }

    if (event.type === "reset") {
      return { type: "reset" };
    }

    if (event.type === "meta") {
      return {
        type: "meta",
        source: event.source === "fallback" ? "fallback" : "model"
      };
    }

    if (event.type === "error" && typeof event.error === "string") {
      return { type: "error", error: event.error };
    }
  } catch {
    return null;
  }

  return null;
}

function mergeStreamedNode(nodes: ArchitectureNode[], node: ArchitectureNode) {
  const existingIndex = nodes.findIndex((candidate) => candidate.id === node.id);

  if (existingIndex < 0) {
    return [...nodes, node];
  }

  return nodes.map((candidate, index) =>
    index === existingIndex ? node : candidate
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function severitySymbol(severity: string) {
  if (severity === "critical" || severity === "error") {
    return "!";
  }

  if (severity === "warning") {
    return "↻";
  }

  return "✓";
}


function getSourceLabel(source: "model" | "fallback") {
  return source === "fallback" ? "cached fallback" : source;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}
