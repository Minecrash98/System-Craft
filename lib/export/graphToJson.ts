import { architectureGraphSchema } from "@/shared/schemas/graphSchema";
import type { ArchitectureGraph } from "@/shared/types/graph";

export function graphToJson(graph: ArchitectureGraph) {
  const parsed = architectureGraphSchema.parse(graph);
  return JSON.stringify(parsed, null, 2);
}
