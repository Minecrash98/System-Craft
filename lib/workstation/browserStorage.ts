import { architectureGraphSchema } from "@/shared/schemas/graphSchema";
import type { ArchitectureGraph } from "@/shared/types/graph";

const WORKSTATION_STORAGE_KEY = "systemcraft.workstation.graphs.v1";
const MAX_SAVED_GRAPHS = 12;

interface StoredGraphEntry {
  graph: ArchitectureGraph;
  saved_at: string;
}

export interface SaveWorkstationGraphResult {
  ok: boolean;
  graphId?: string;
  error?: string;
}

export function loadWorkstationGraphs(): ArchitectureGraph[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(WORKSTATION_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return parseStoredEntries(parsed).map((entry) => entry.graph);
  } catch {
    return [];
  }
}

export function saveGraphToWorkstation(
  graph: ArchitectureGraph
): SaveWorkstationGraphResult {
  if (typeof window === "undefined") {
    return {
      ok: false,
      error: "Browser storage is unavailable during server rendering."
    };
  }

  const parsed = architectureGraphSchema.safeParse(graph);

  if (!parsed.success) {
    return {
      ok: false,
      graphId: graph.id,
      error: "Only schema-valid architecture graphs can be saved."
    };
  }

  try {
    const existing = loadStoredEntries();
    const entry: StoredGraphEntry = {
      graph: parsed.data,
      saved_at: new Date().toISOString()
    };
    const nextEntries = [
      entry,
      ...existing.filter((candidate) => candidate.graph.id !== parsed.data.id)
    ].slice(0, MAX_SAVED_GRAPHS);

    window.localStorage.setItem(
      WORKSTATION_STORAGE_KEY,
      JSON.stringify(nextEntries)
    );

    return {
      ok: true,
      graphId: parsed.data.id
    };
  } catch (error) {
    return {
      ok: false,
      graphId: graph.id,
      error:
        error instanceof Error
          ? error.message
          : "The browser could not save this graph."
    };
  }
}

function loadStoredEntries() {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(WORKSTATION_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  return parseStoredEntries(JSON.parse(raw));
}

function parseStoredEntries(value: unknown): StoredGraphEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate) => {
    const entry = parseStoredEntry(candidate);
    return entry ? [entry] : [];
  });
}

function parseStoredEntry(value: unknown): StoredGraphEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const graphCandidate = "graph" in value ? value.graph : value;
  const parsed = architectureGraphSchema.safeParse(graphCandidate);

  if (!parsed.success) {
    return null;
  }

  return {
    graph: parsed.data,
    saved_at:
      typeof value.saved_at === "string" && value.saved_at.trim().length > 0
        ? value.saved_at
        : new Date(0).toISOString()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
