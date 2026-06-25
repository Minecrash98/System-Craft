import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildNodeAddFallbackPatch,
  buildNodeEditFallbackPatch
} from "./fallbacks";
import { validateGraphEditPatchCandidate } from "./schema";
import type { ArchitectureGraph } from "../../shared/types/graph";

test("add-node fallback returns a safe duplicate warning patch", async () => {
  const graph = await loadExample("support-triage.graph.json");
  const patch = buildNodeAddFallbackPatch({
    graph,
    userRequest: "Add a privacy filter before retrieval.",
    preferredAnchorNodeIds: ["document_upload", "policy_retrieval"]
  });
  const result = validateGraphEditPatchCandidate({ patch }, graph);

  assert.equal(patch.mode, "add_node");
  assert.deepEqual(patch.operations, []);
  assert.equal(patch.requires_user_confirmation, true);
  assert.ok(patch.warnings.some((warning) => warning.includes("duplicative")));
  assert.equal(result.success, true);
});

test("edit-node fallback returns a safe missing-node patch", async () => {
  const graph = await loadExample("support-triage.graph.json");
  const patch = buildNodeEditFallbackPatch({
    graph,
    selectedNodeId: "citation_verifier",
    userRequest: "Tighten the citation verifier."
  });
  const result = validateGraphEditPatchCandidate({ patch }, graph);

  assert.equal(patch.mode, "edit_node");
  assert.deepEqual(patch.operations, []);
  assert.equal(patch.requires_user_confirmation, true);
  assert.ok(patch.warnings.some((warning) => warning.includes("does not exist")));
  assert.equal(result.success, true);
});

test("patch validator rejects unknown update node targets", async () => {
  const graph = await loadExample("support-triage.graph.json");
  const result = validateGraphEditPatchCandidate(
    {
      patch: {
        graph_id: graph.id,
        version: graph.version,
        mode: "edit_node",
        summary: "Update missing node.",
        operations: [
          {
            op: "update_node",
            node_id: "missing_node",
            changes: {
              description: "Updated description."
            }
          }
        ],
        warnings: [],
        requires_user_confirmation: true
      }
    },
    graph
  );

  assert.equal(result.success, false);
  assert.ok(
    !result.success &&
      result.errors.some((error) => error.includes("unknown node missing_node"))
  );
});

test("validator accepts broader edit prompt operations", async () => {
  const graph = await loadExample("support-triage.graph.json");
  const result = validateGraphEditPatchCandidate(
    {
      patch: {
        graph_id: graph.id,
        version: graph.version,
        mode: "batch_edit",
        summary: "Clarify support triage review flow.",
        operations: [
          {
            op: "update_edge",
            edge_id: "edge_llm_evaluator",
            changes: {
              label: "grounded policy context"
            }
          },
          {
            op: "update_graph_metadata",
            changes: {
              assumptions: [
                "Customer tickets may contain sensitive account information.",
                "Human escalation remains required for policy-sensitive decisions."
              ]
            }
          },
          {
            op: "reposition_node",
            node_id: "policy_evaluator",
            position: {
              x: 1320,
              y: 220
            }
          }
        ],
        warnings: [],
        requires_user_confirmation: false
      }
    },
    graph
  );

  assert.equal(result.success, true);
});

test("validator rejects destructive operations without confirmation", async () => {
  const graph = await loadExample("support-triage.graph.json");
  const result = validateGraphEditPatchCandidate(
    {
      patch: {
        graph_id: graph.id,
        version: graph.version,
        mode: "delete_node",
        summary: "Remove policy evaluator.",
        operations: [
          {
            op: "delete_node",
            node_id: "policy_evaluator",
            delete_connected_edges: true,
            reason: "User requested removal."
          }
        ],
        warnings: [],
        requires_user_confirmation: false
      }
    },
    graph
  );

  assert.equal(result.success, false);
  assert.ok(
    !result.success &&
      result.errors.some((error) => error.includes("delete operations require user confirmation"))
  );
});

test("validator rejects mode-operation mismatches", async () => {
  const graph = await loadExample("support-triage.graph.json");
  const result = validateGraphEditPatchCandidate(
    {
      patch: {
        graph_id: graph.id,
        version: graph.version,
        mode: "add_edge",
        summary: "Invalidly delete an edge.",
        operations: [
          {
            op: "delete_edge",
            edge_id: "edge_llm_evaluator",
            reason: "Wrong mode."
          }
        ],
        warnings: [],
        requires_user_confirmation: true
      }
    },
    graph
  );

  assert.equal(result.success, false);
  assert.ok(
    !result.success &&
      result.errors.some((error) => error.includes("add_edge patches may not include delete_edge"))
  );
});

test("validator rejects update edge references to unknown nodes", async () => {
  const graph = await loadExample("support-triage.graph.json");
  const result = validateGraphEditPatchCandidate(
    {
      patch: {
        graph_id: graph.id,
        version: graph.version,
        mode: "edit_edge",
        summary: "Point edge to missing node.",
        operations: [
          {
            op: "update_edge",
            edge_id: "edge_llm_evaluator",
            changes: {
              target: "missing_node"
            }
          }
        ],
        warnings: [],
        requires_user_confirmation: true
      }
    },
    graph
  );

  assert.equal(result.success, false);
  assert.ok(
    !result.success &&
      result.errors.some((error) => error.includes("unknown target missing_node"))
  );
});
async function loadExample(fileName: string): Promise<ArchitectureGraph> {
  const url = new URL(`../../examples/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8")) as ArchitectureGraph;
}
