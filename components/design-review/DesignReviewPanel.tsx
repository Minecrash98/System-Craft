"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/shared/Badge";
import type {
  DesignReviewDialogue,
  DesignReviewLesson,
  DesignReviewRole,
  DesignReviewTurn
} from "@/lib/design-review/types";
import type { ArchitectureGraph } from "@/shared/types/graph";
import type { ArchitectureScore } from "@/shared/types/scoring";
import type { ValidationIssue, ValidationResult } from "@/shared/types/validation";

interface DesignReviewPanelProps {
  graph: ArchitectureGraph;
  validation: ValidationResult;
  score: ArchitectureScore;
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  onFocusNodeIds?: (nodeIds: string[] | null) => void;
}

type ReviewStatus = "idle" | "loading" | "ready" | "error";
type AudioStatus = "idle" | "loading" | "ready" | "playing" | "paused" | "error";

interface DesignReviewScriptResponse {
  dialogue?: DesignReviewDialogue;
  source?: "deterministic" | "model";
  warning?: string;
}

interface DesignReviewAudioMetadata {
  content_type?: string;
  output_format?: string;
  byte_length?: number;
  character_count?: number;
  role_count?: number;
  turn_count?: number;
  source?: "generated" | "bundled";
  cache_status?: "hit";
  asset_path?: string;
}

interface DesignReviewAudioResponse {
  audio_base64?: string;
  metadata?: DesignReviewAudioMetadata;
}

const roleLabels: Record<DesignReviewRole, string> = {
  builder: "Builder",
  reviewer: "Reviewer",
  mentor: "Mentor"
};

export function DesignReviewPanel({
  graph,
  onFocusNodeIds,
  onSelectNode,
  score,
  selectedNodeId,
  validation
}: DesignReviewPanelProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [dialogue, setDialogue] = useState<DesignReviewDialogue | null>(null);
  const [source, setSource] = useState<"deterministic" | "model" | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("idle");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioMetadata, setAudioMetadata] =
    useState<DesignReviewAudioMetadata | null>(null);
  const [playWhenReady, setPlayWhenReady] = useState(false);
  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes]
  );
  const issueById = useMemo(
    () => new Map(validation.issues.map((issue) => [issue.id, issue])),
    [validation.issues]
  );

  useEffect(() => {
    audioRef.current?.pause();
    setDialogue(null);
    setSource(null);
    setReviewStatus("idle");
    setReviewError(null);
    setWarning(null);
    setActiveTurnId(null);
    setActiveIssueId(null);
    setAudioStatus("idle");
    setAudioError(null);
    setAudioUrl(null);
    setAudioMetadata(null);
    setPlayWhenReady(false);
    onFocusNodeIds?.(null);
  }, [graph.id]);
  useEffect(() => {
    return () => onFocusNodeIds?.(null);
  }, [onFocusNodeIds]);


  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    if (!audioUrl || !playWhenReady || !audioRef.current) {
      return;
    }

    const audio = audioRef.current;
    const play = async () => {
      try {
        await audio.play();
        setAudioStatus("playing");
      } catch (error) {
        setAudioStatus("error");
        setAudioError(
          `Design review audio was returned, but playback could not start. ${getErrorMessage(error)}`
        );
      } finally {
        setPlayWhenReady(false);
      }
    };

    void play();
  }, [audioUrl, playWhenReady]);

  async function handleRunReview() {
    setReviewStatus("loading");
    setReviewError(null);
    setWarning(null);
    setDialogue(null);
    setActiveTurnId(null);
    setActiveIssueId(null);
    onFocusNodeIds?.(null);
    resetAudio();

    try {
      const response = await fetch("/api/design-review/script", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          graph,
          validation,
          score,
          refine_with_model: true
        })
      });
      const payload = (await readJsonResponse(response)) as DesignReviewScriptResponse;

      if (!response.ok || !payload.dialogue) {
        throw new Error(
          response.ok
            ? "Design review script route returned no dialogue."
            : getPayloadError(payload)
        );
      }

      setDialogue(payload.dialogue);
      setSource(payload.source ?? payload.dialogue.source);
      setWarning(payload.warning ?? null);
      activateTurnFocus(payload.dialogue.turns[0] ?? null);
      setReviewStatus("ready");
    } catch (error) {
      setReviewStatus("error");
      setReviewError(getErrorMessage(error));
    }
  }

  async function handlePlayPause() {
    if (!dialogue) {
      await handleRunReview();
      return;
    }

    if (audioStatus === "playing") {
      audioRef.current?.pause();
      setAudioStatus("paused");
      return;
    }

    if (audioUrl) {
      setPlayWhenReady(true);
      return;
    }

    await requestAudio(dialogue);
  }

  async function handleReplay() {
    if (!dialogue) {
      await handleRunReview();
      return;
    }

    if (!audioUrl) {
      await requestAudio(dialogue);
      return;
    }

    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }

    activateTurnFocus(dialogue.turns[0] ?? null);
    setPlayWhenReady(true);
  }

  function resetAudio() {
    audioRef.current?.pause();
    setAudioStatus("idle");
    setAudioError(null);
    setAudioUrl(null);
    setAudioMetadata(null);
    setPlayWhenReady(false);
  }

  async function requestAudio(nextDialogue: DesignReviewDialogue) {
    setAudioStatus("loading");
    setAudioError(null);

    try {
      const response = await fetch("/api/design-review/audio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dialogue: nextDialogue,
          response_format: "json"
        })
      });
      const payload = (await readJsonResponse(response)) as DesignReviewAudioResponse;

      if (!response.ok || !payload.audio_base64) {
        throw new Error(
          response.ok
            ? "Design review audio route returned no audio."
            : getPayloadError(payload)
        );
      }

      const contentType = payload.metadata?.content_type ?? "audio/mpeg";
      const nextUrl = URL.createObjectURL(base64ToBlob(payload.audio_base64, contentType));
      setAudioUrl(nextUrl);
      setAudioMetadata(payload.metadata ?? null);
      setAudioStatus("ready");
      setPlayWhenReady(true);
    } catch (error) {
      setAudioStatus("error");
      setAudioError(getErrorMessage(error));
    }
  }

  function handleTimeUpdate() {
    if (!dialogue || !audioRef.current) {
      return;
    }

    const { currentTime, duration } = audioRef.current;
    const turnId = getTurnIdForTime(dialogue.turns, currentTime, duration);

    if (turnId && turnId !== activeTurnId) {
      activateTurnFocus(
        dialogue.turns.find((turn) => turn.id === turnId) ?? null
      );
    }
  }

  function handleSelectTurn(turn: DesignReviewTurn) {
    activateTurnFocus(turn);
  }

  function activateTurnFocus(turn: DesignReviewTurn | null) {
    if (!turn) {
      setActiveTurnId(null);
      setActiveIssueId(null);
      onFocusNodeIds?.(null);
      return;
    }

    setActiveTurnId(turn.id);
    setActiveIssueId(turn.related_issue_ids[0] ?? null);
    const nodeIds = getValidReferencedNodeIds(turn.related_node_ids, nodeById);
    onFocusNodeIds?.(nodeIds.length > 0 ? nodeIds : null);

    if (nodeIds[0]) {
      onSelectNode(nodeIds[0]);
    }
  }

  function handleSelectIssue(issue: ValidationIssue) {
    setActiveIssueId(issue.id);

    if (issue.affected_node_ids[0]) {
      onSelectNode(issue.affected_node_ids[0]);
    }
  }

  const activeTurn = dialogue?.turns.find((turn) => turn.id === activeTurnId) ?? null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white/95 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Design Review</h2>
            <Badge tone="review">Simulated critique</Badge>
            {source ? <Badge tone={source === "model" ? "model" : "input"}>{source}</Badge> : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Transcript-first Builder, Reviewer, and Mentor critique grounded in the graph, validation issues, and score.
          </p>
        </div>
        <Badge tone={dialogue ? "data" : "neutral"}>
          {dialogue ? `${dialogue.turns.length} turns` : "not run"}
        </Badge>
      </div>

      <div className="grid gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRunReview}
            disabled={reviewStatus === "loading"}
            className="min-h-10 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {reviewStatus === "loading" ? "Running review" : "Run review"}
          </button>
          <button
            type="button"
            onClick={handlePlayPause}
            disabled={reviewStatus === "loading" || audioStatus === "loading"}
            className="min-h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {audioStatus === "loading"
              ? "Preparing audio"
              : audioStatus === "playing"
                ? "Pause"
                : "Play audio"}
          </button>
          <button
            type="button"
            onClick={handleReplay}
            disabled={reviewStatus === "loading" || audioStatus === "loading"}
            className="min-h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Replay
          </button>
        </div>

        <audio
          ref={audioRef}
          src={audioUrl ?? undefined}
          className="hidden"
          onEnded={() => setAudioStatus("ready")}
          onPause={() => {
            if (audioStatus === "playing") {
              setAudioStatus("paused");
            }
          }}
          onPlay={() => setAudioStatus("playing")}
          onTimeUpdate={handleTimeUpdate}
        />

        {reviewError ? <ErrorMessage message={reviewError} /> : null}
        {audioError ? <ErrorMessage message={audioError} /> : null}
        {warning ? (
          <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-900">
            {warning}
          </p>
        ) : null}

        {dialogue ? (
          <>
            <section className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{dialogue.title}</h3>
                <Badge tone="input">{audioStatusLabel(audioStatus)}</Badge>
                {audioMetadata?.source ? (
                  <Badge tone={audioMetadata.source === "bundled" ? "data" : "model"}>
                    {audioSourceLabel(audioMetadata)}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {dialogue.review_notice}
              </p>
              {activeTurn ? (
                <p className="mt-2 text-xs leading-5 text-slate-700">
                  <span className="font-semibold">Active:</span>{" "}
                  {roleLabels[activeTurn.role]} - {activeTurn.speaker}
                </p>
              ) : null}
              {audioMetadata ? (
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  Audio: {audioMetadata.turn_count ?? dialogue.turns.length} turns,
                  {" "}
                  {audioMetadata.role_count ?? 3} roles,
                  {" "}
                  {audioMetadata.byte_length ?? 0} bytes
                </p>
              ) : null}
            </section>

            <section className="grid gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Transcript
              </h3>
              <ol className="grid max-h-[430px] gap-2 overflow-y-auto pr-1">
                {dialogue.turns.map((turn, index) => (
                  <li key={turn.id}>
                    <TurnCard
                      active={turn.id === activeTurnId}
                      index={index}
                      issueById={issueById}
                      nodeById={nodeById}
                      onSelectIssue={handleSelectIssue}
                      onSelectNode={onSelectNode}
                      onSelectTurn={() => handleSelectTurn(turn)}
                      selectedIssueId={activeIssueId}
                      selectedNodeId={selectedNodeId}
                      turn={turn}
                    />
                  </li>
                ))}
              </ol>
            </section>

            <LessonList
              issueById={issueById}
              lessons={dialogue.lessons}
              nodeById={nodeById}
              onSelectIssue={handleSelectIssue}
              onSelectNode={onSelectNode}
              selectedIssueId={activeIssueId}
              selectedNodeId={selectedNodeId}
            />
          </>
        ) : (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            Run the review to generate a text-complete critique. Audio stays optional and is requested only when you press play.
          </p>
        )}
      </div>
    </section>
  );
}

function TurnCard({
  active,
  index,
  issueById,
  nodeById,
  onSelectIssue,
  onSelectNode,
  onSelectTurn,
  selectedIssueId,
  selectedNodeId,
  turn
}: {
  active: boolean;
  index: number;
  issueById: Map<string, ValidationIssue>;
  nodeById: Map<string, ArchitectureGraph["nodes"][number]>;
  onSelectIssue: (issue: ValidationIssue) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectTurn: () => void;
  selectedIssueId: string | null;
  selectedNodeId?: string | null;
  turn: DesignReviewTurn;
}) {
  return (
    <article
      className={
        active
          ? "rounded-md border border-slate-900 bg-slate-50 px-3 py-2 shadow-sm"
          : "rounded-md border border-slate-200 bg-white px-3 py-2"
      }
    >
      <button
        type="button"
        onClick={onSelectTurn}
        className="w-full text-left"
        aria-label={`Select turn ${index + 1}`}
      >
        <span className="flex flex-wrap items-start justify-between gap-2">
          <span>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Turn {index + 1}
            </span>
            <span className="mt-0.5 block text-sm font-semibold leading-5 text-ink">
              {turn.speaker}
            </span>
          </span>
          <Badge tone={toneForRole(turn.role)}>{roleLabels[turn.role]}</Badge>
        </span>
        <span className="mt-2 block text-xs leading-5 text-slate-700">
          {turn.text}
        </span>
      </button>
      <ReferenceButtons
        issueById={issueById}
        issueIds={turn.related_issue_ids}
        nodeById={nodeById}
        nodeIds={turn.related_node_ids}
        onSelectIssue={onSelectIssue}
        onSelectNode={onSelectNode}
        selectedIssueId={selectedIssueId}
        selectedNodeId={selectedNodeId}
      />
    </article>
  );
}

function LessonList({
  issueById,
  lessons,
  nodeById,
  onSelectIssue,
  onSelectNode,
  selectedIssueId,
  selectedNodeId
}: {
  issueById: Map<string, ValidationIssue>;
  lessons: DesignReviewLesson[];
  nodeById: Map<string, ArchitectureGraph["nodes"][number]>;
  onSelectIssue: (issue: ValidationIssue) => void;
  onSelectNode: (nodeId: string) => void;
  selectedIssueId: string | null;
  selectedNodeId?: string | null;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Lessons
      </h3>
      <ul className="grid gap-2">
        {lessons.map((lesson) => (
          <li
            key={lesson.id}
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
          >
            <p className="text-sm font-semibold leading-5 text-ink">
              {lesson.title}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-700">
              {lesson.text}
            </p>
            <ReferenceButtons
              issueById={issueById}
              issueIds={lesson.related_issue_ids}
              nodeById={nodeById}
              nodeIds={lesson.related_node_ids}
              onSelectIssue={onSelectIssue}
              onSelectNode={onSelectNode}
              selectedIssueId={selectedIssueId}
              selectedNodeId={selectedNodeId}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReferenceButtons({
  issueById,
  issueIds,
  nodeById,
  nodeIds,
  onSelectIssue,
  onSelectNode,
  selectedIssueId,
  selectedNodeId
}: {
  issueById: Map<string, ValidationIssue>;
  issueIds: string[];
  nodeById: Map<string, ArchitectureGraph["nodes"][number]>;
  nodeIds: string[];
  onSelectIssue: (issue: ValidationIssue) => void;
  onSelectNode: (nodeId: string) => void;
  selectedIssueId: string | null;
  selectedNodeId?: string | null;
}) {
  const nodes = nodeIds
    .map((nodeId) => nodeById.get(nodeId))
    .filter(isPresent)
    .slice(0, 4);
  const issues = issueIds
    .map((issueId) => issueById.get(issueId))
    .filter(isPresent)
    .slice(0, 3);

  if (nodes.length === 0 && issues.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          onClick={() => onSelectNode(node.id)}
          className={
            selectedNodeId === node.id
              ? "rounded border border-teal-500 bg-teal-50 px-2 py-1 text-[11px] font-semibold leading-4 text-teal-800"
              : "rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold leading-4 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          }
        >
          Node: {node.name}
        </button>
      ))}
      {issues.map((issue) => (
        <button
          key={issue.id}
          type="button"
          onClick={() => onSelectIssue(issue)}
          className={
            selectedIssueId === issue.id
              ? "rounded border border-orange-400 bg-orange-50 px-2 py-1 text-[11px] font-semibold leading-4 text-orange-900"
              : "rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold leading-4 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          }
        >
          Issue: {issue.title}
        </button>
      ))}
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
      {message}
    </p>
  );
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return {
    error: await response.text()
  };
}

function getPayloadError(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "Request failed.";
  }

  const record = payload as Record<string, unknown>;
  const error = typeof record.error === "string" ? record.error : "Request failed.";
  const details = Array.isArray(record.details)
    ? record.details.filter((detail): detail is string => typeof detail === "string")
    : [];

  return details.length > 0 ? `${error} ${details.join(" ")}` : error;
}

function base64ToBlob(base64: string, contentType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: contentType });
}

function getTurnIdForTime(
  turns: DesignReviewTurn[],
  currentTime: number,
  duration: number
) {
  if (turns.length === 0) {
    return null;
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return turns[0]?.id ?? null;
  }

  const totalWeight = turns.reduce(
    (sum, turn) => sum + Math.max(1, turn.text.length),
    0
  );
  const targetWeight = (currentTime / duration) * totalWeight;
  let cursor = 0;

  for (const turn of turns) {
    cursor += Math.max(1, turn.text.length);

    if (targetWeight <= cursor) {
      return turn.id;
    }
  }

  return turns.at(-1)?.id ?? null;
}

function getValidReferencedNodeIds(
  nodeIds: string[],
  nodeById: Map<string, ArchitectureGraph["nodes"][number]>
) {
  const validNodeIds = nodeIds
    .map((nodeId) => nodeById.get(nodeId)?.id)
    .filter(isPresent);

  return [...new Set(validNodeIds)];
}

function audioStatusLabel(status: AudioStatus) {
  return {
    idle: "audio optional",
    loading: "audio loading",
    ready: "audio ready",
    playing: "playing",
    paused: "paused",
    error: "text fallback"
  }[status];
}

function audioSourceLabel(metadata: DesignReviewAudioMetadata) {
  if (metadata.source === "bundled") {
    return metadata.cache_status === "hit" ? "bundled cache" : "bundled";
  }

  return "generated";
}

function toneForRole(
  role: DesignReviewRole
): "neutral" | "input" | "processing" | "model" | "data" | "review" | "warning" | "danger" {
  if (role === "builder") {
    return "processing";
  }

  if (role === "reviewer") {
    return "warning";
  }

  return "review";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
