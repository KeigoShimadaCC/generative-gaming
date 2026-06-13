import type { GridViewModel } from "@/components/grid/model";

import { borderAlphaForCell, colorsForCell } from "./colors";

export type StageRectDraw = {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fillColor: number;
  readonly borderColor: number;
  readonly borderWidth: number;
  readonly borderAlpha: number;
  readonly alpha: number;
};

export type StageDrawList = {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly gap: number;
  readonly padding: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly rects: readonly StageRectDraw[];
};

const DEFAULT_CELL_SIZE = 23;
const DEFAULT_GAP = 2;
const DEFAULT_PADDING = 12;
const ENTITY_INSET = 5;

export type StageDrawListOptions = {
  readonly cellSize?: number;
  readonly gap?: number;
  readonly padding?: number;
};

/**
 * Pure function of `GridViewModel` → canvas draw instructions.
 * No Pixi, DOM, or engine imports — safe for headless determinism tests.
 */
export const createStageDrawList = (
  model: GridViewModel,
  options: StageDrawListOptions = {},
): StageDrawList => {
  const cellSize = options.cellSize ?? DEFAULT_CELL_SIZE;
  const gap = options.gap ?? DEFAULT_GAP;
  const padding = options.padding ?? DEFAULT_PADDING;
  const canvasWidth =
    padding * 2 + model.width * cellSize + Math.max(0, model.width - 1) * gap;
  const canvasHeight =
    padding * 2 + model.height * cellSize + Math.max(0, model.height - 1) * gap;
  const rects: StageRectDraw[] = [];

  for (const cell of model.cells) {
    const x = padding + cell.x * (cellSize + gap);
    const y = padding + cell.y * (cellSize + gap);
    const colors = colorsForCell(cell);

    rects.push({
      key: `${cell.key}:bg`,
      x,
      y,
      width: cellSize,
      height: cellSize,
      fillColor: colors.fill,
      borderColor: colors.border,
      borderWidth: 1,
      borderAlpha: borderAlphaForCell(cell),
      alpha: colors.alpha,
    });

    if (colors.entity !== null) {
      rects.push({
        key: `${cell.key}:entity`,
        x: x + ENTITY_INSET,
        y: y + ENTITY_INSET,
        width: cellSize - ENTITY_INSET * 2,
        height: cellSize - ENTITY_INSET * 2,
        fillColor: colors.entity,
        borderColor: colors.entity,
        borderWidth: 0,
        borderAlpha: 0,
        alpha: colors.alpha,
      });
    }
  }

  return {
    width: model.width,
    height: model.height,
    cellSize,
    gap,
    padding,
    canvasWidth,
    canvasHeight,
    rects,
  };
};
