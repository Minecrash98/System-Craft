"use client";

import { useState } from "react";

import { useLocalizedText } from "@/components/i18n/LanguageProvider";
import type { GraphEditPatch } from "@/lib/graph-edit/types";
import type { ArchitectureGraph } from "@/shared/types/graph";

type GraphEditMode = "add_node" | "edit_node";

interface GraphEditResponse {
  graph?: ArchitectureGraph;
  patch?: GraphEditPatch;
  source?: "model" | "fallback";
  warning?: string;
  validation_errors?: string[];
  error?: string;
  details?: string[];
}

export function EditableNodePanel({
  className,
  graph,
  onGraphChange,
  selectedNodeId
}: {
  className?: string;
  graph: ArchitectureGraph;
  onGraphChange: (graph: ArchitectureGraph, selectedNodeId?: string | null) => void;
  selectedNodeId: string | null;
}) {
  const text = useLocalizedText();
  const [mode, setMode] = useState<GraphEditMode>("edit_node");
  const [requestText, setRequestText] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [lastPatch, setLastPatch] = useState<GraphEditPatch | null>(null);
  const selectedNode =
    graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const canSubmit =
    requestText.trim().length >= 3 &&
    status !== "running" &&
    (mode === "add_node" || Boolean(selectedNode));

  async function submitEdit(nextMode: GraphEditMode) {
    const normalizedRequest = requestText.trim();

    if (normalizedRequest.length < 3) {
      setMessage(text("先写一句修改需求。", "Describe the graph edit first."));
      return;
    }

    if (nextMode === "edit_node" && !selectedNode) {
      setMessage(text("先在画布中选择一个 node。", "Select a node on the canvas first."));
      return;
    }

    setMode(nextMode);
    setStatus("running");
    setMessage(null);

    try {
      const response = await fetch("/api/graph-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graph,
          mode: nextMode,
          selected_node_id: selectedNode?.id,
          user_request: normalizedRequest,
          preferred_anchor_node_ids: selectedNode ? [selectedNode.id] : []
        })
      });
      const data = (await response.json()) as GraphEditResponse;

      if (!response.ok || !data.graph || !data.patch) {
        throw new Error(
          data.error ?? data.details?.join("; ") ?? "Graph edit request failed."
        );
      }

      setLastPatch(data.patch);
      setMessage(
        [
          data.warning,
          data.validation_errors?.join("; "),
          data.patch.warnings.join("; ")
        ]
          .filter(Boolean)
          .join(" ") ||
          text(
            data.source === "fallback"
              ? "AI 修改不可用，已返回安全 fallback。"
              : "AI patch 已应用。",
            data.source === "fallback"
              ? "AI edit was unavailable; safe fallback returned."
              : "AI patch applied."
          )
      );
      setStatus("idle");
      setRequestText("");
      onGraphChange(data.graph, getPatchSelectedNodeId(data.patch, selectedNode?.id));
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Graph edit request failed.");
    }
  }

  return (
    <section className={`editable-node-panel ${className ?? ""}`}>
      <div className="editable-node-status-line">
        <span>{text("AI 节点编辑", "AI node editing")}</span>
        <strong>
          {selectedNode
            ? text(`选中：${selectedNode.name}`, `Selected: ${selectedNode.name}`)
            : text("未选中 node", "No node selected")}
        </strong>
      </div>

      <div className="editable-node-compact-row">
        <div className="editable-node-mode-row" role="tablist" aria-label={text("选择修改模式", "Choose edit mode")}>
          <button
            type="button"
            className={mode === "edit_node" ? "editable-node-mode-active" : ""}
            disabled={!selectedNode || status === "running"}
            onClick={() => setMode("edit_node")}
          >
            {text("修改", "Edit")}
          </button>
          <button
            type="button"
            className={mode === "add_node" ? "editable-node-mode-active" : ""}
            disabled={status === "running"}
            onClick={() => setMode("add_node")}
          >
            {text("添加", "Add")}
          </button>
        </div>

        <label className="editable-node-field editable-node-prompt-field">
          <span>{text("Prompt", "Prompt")}</span>
          <textarea
            rows={2}
            value={requestText}
            onChange={(event) => setRequestText(event.target.value)}
            placeholder={
              mode === "add_node"
                ? text(
                    "例如：在 retrieval 前添加一个 privacy filter，移除不必要的个人信息但保留引用 metadata。",
                    "Example: Add a privacy filter before retrieval that removes unnecessary personal data but preserves citation metadata."
                  )
                : text(
                    "例如：让这个 verifier 更严格，必须阻止没有来源支持的 claim，并解释 blocked reason。",
                    "Example: Make this verifier stricter: block unsupported claims and explain the blocked reason."
                  )
            }
          />
        </label>

        <div className="editable-node-actions">
          <button
            type="button"
            className="editable-node-button editable-node-button-primary"
            disabled={!canSubmit}
            onClick={() => void submitEdit(mode)}
          >
            {status === "running" ? text("生成中...", "Generating...") : text("生成", "Generate")}
          </button>
        </div>
      </div>

      {message ? (
        <p className={status === "error" ? "editable-node-message editable-node-message-error" : "editable-node-message"}>
          {message}
        </p>
      ) : null}

      {lastPatch ? (
        <div className="editable-node-patch-summary">
          <span>{lastPatch.mode.replaceAll("_", " ")}</span>
          <strong>{lastPatch.summary}</strong>
          <p>
            {lastPatch.operations.length} operation{lastPatch.operations.length === 1 ? "" : "s"}
            {lastPatch.requires_user_confirmation ? " · confirmation suggested" : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function getPatchSelectedNodeId(patch: GraphEditPatch, currentNodeId?: string) {
  const addedNode = patch.operations.find(
    (operation) => operation.op === "add_node"
  );

  if (addedNode?.op === "add_node") {
    return addedNode.node.id;
  }

  const updatedNode = patch.operations.find(
    (operation) => operation.op === "update_node"
  );

  if (updatedNode?.op === "update_node") {
    return updatedNode.node_id;
  }

  return currentNodeId ?? null;
}