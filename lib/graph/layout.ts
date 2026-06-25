import type { ArchitectureNode } from "@/shared/types/graph";

export type GraphLayoutDirection = "horizontal" | "vertical";

const FALLBACK_COLUMNS = 4;
const FALLBACK_X_SPACING = 260;
const FALLBACK_Y_SPACING = 190;
const POSITION_X_SCALE = 1.85;
const POSITION_Y_SCALE = 2.05;

export function getNodePosition(
  node: ArchitectureNode,
  index: number,
  direction: GraphLayoutDirection
) {
  const position = node.position ?? {
    x: (index % FALLBACK_COLUMNS) * FALLBACK_X_SPACING,
    y: Math.floor(index / FALLBACK_COLUMNS) * FALLBACK_Y_SPACING
  };

  if (direction === "vertical") {
    return {
      x: position.y * POSITION_Y_SCALE,
      y: position.x * POSITION_X_SCALE
    };
  }

  return {
    x: position.x * POSITION_X_SCALE,
    y: position.y * POSITION_Y_SCALE
  };
}

