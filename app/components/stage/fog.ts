import type {
  GridFogState,
  GridViewModel,
} from "@/components/grid/model";

import type { StageCellBounds, StageGridMetrics } from "./tilemap";
import { boundsForCell } from "./tilemap";

export type StageLightBand = "shallows" | "middle" | "lowest" | string;

export type StageFogPaint = {
  readonly fog: GridFogState;
  readonly overlayColor: number;
  readonly overlayAlpha: number;
  readonly spriteTint: number;
  readonly spriteAlpha: number;
  readonly light: number;
};

export type StageFogDraw = StageCellBounds & {
  readonly key: string;
  readonly fog: GridFogState;
  readonly fillColor: number;
  readonly alpha: number;
  readonly light: number;
};

export type StageFogOptions = {
  readonly lightRadiusCells?: number;
  readonly softEdgeCells?: number;
  readonly band?: StageLightBand;
};

export const DEFAULT_LIGHT_RADIUS_CELLS = 4;
export const DEFAULT_LIGHT_SOFT_EDGE_CELLS = 3;

const REMEMBERED_OVERLAY = 0x03060b;
const REMEMBERED_TINT = 0x687180;
const UNSEEN_TINT = 0x101114;

const BAND_LIGHT_TINTS: Readonly<Record<string, number>> = {
  shallows: 0xffc878,
  middle: 0x8ed4c7,
  lowest: 0xff6a45,
};

export const createFogDraws = (
  model: GridViewModel,
  metrics: StageGridMetrics,
  player: { readonly x: number; readonly y: number },
  options: StageFogOptions = {},
): readonly StageFogDraw[] =>
  model.cells.map((cell) => {
    const paint = fogPaintForCell(cell.fog, distanceCells(cell, player), options);
    const bounds = boundsForCell(cell, metrics);

    return {
      key: `${cell.key}:fog`,
      fog: cell.fog,
      fillColor: paint.overlayColor,
      alpha: paint.overlayAlpha,
      light: paint.light,
      ...bounds,
    };
  });

export const fogPaintForCell = (
  fog: GridFogState,
  distanceFromPlayer: number,
  options: StageFogOptions = {},
): StageFogPaint => {
  if (fog === "unseen") {
    return {
      fog,
      overlayColor: 0x000000,
      overlayAlpha: 1,
      spriteTint: UNSEEN_TINT,
      spriteAlpha: 0,
      light: 0,
    };
  }

  if (fog === "remembered") {
    return {
      fog,
      overlayColor: REMEMBERED_OVERLAY,
      overlayAlpha: 0.68,
      spriteTint: REMEMBERED_TINT,
      spriteAlpha: 0.5,
      light: 0,
    };
  }

  const radius = options.lightRadiusCells ?? DEFAULT_LIGHT_RADIUS_CELLS;
  const softEdge = Math.max(
    1,
    options.softEdgeCells ?? DEFAULT_LIGHT_SOFT_EDGE_CELLS,
  );
  const falloff = clamp((distanceFromPlayer - radius) / softEdge, 0, 1);
  const light = 1 - falloff;
  const tint = bandTint(options.band);

  return {
    fog,
    overlayColor: tint,
    overlayAlpha: falloff * 0.28,
    spriteTint: mixColor(0xffffff, tint, 0.12 + falloff * 0.16),
    spriteAlpha: 1,
    light,
  };
};

export const multiplyTint = (left: number, right: number): number => {
  const lr = (left >> 16) & 0xff;
  const lg = (left >> 8) & 0xff;
  const lb = left & 0xff;
  const rr = (right >> 16) & 0xff;
  const rg = (right >> 8) & 0xff;
  const rb = right & 0xff;

  return (
    (Math.round((lr * rr) / 255) << 16) |
    (Math.round((lg * rg) / 255) << 8) |
    Math.round((lb * rb) / 255)
  );
};

const bandTint = (band: StageLightBand | undefined): number =>
  BAND_LIGHT_TINTS[String(band ?? "shallows")] ?? 0xffc878;

const distanceCells = (
  cell: { readonly x: number; readonly y: number },
  player: { readonly x: number; readonly y: number },
): number => Math.hypot(cell.x - player.x, cell.y - player.y);

const mixColor = (from: number, to: number, amount: number): number => {
  const mixChannel = (shift: number): number => {
    const left = (from >> shift) & 0xff;
    const right = (to >> shift) & 0xff;

    return Math.round(left + (right - left) * amount);
  };

  return (mixChannel(16) << 16) | (mixChannel(8) << 8) | mixChannel(0);
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
