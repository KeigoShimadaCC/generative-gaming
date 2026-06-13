import type { GridCellView, GridFogState, GridLayer } from "@/components/grid/model";

export type StageCellColors = {
  readonly fill: number;
  readonly border: number;
  readonly entity: number | null;
  readonly alpha: number;
};

const hex = (value: string): number => Number.parseInt(value.slice(1), 16);

const BASE_FILL = hex("#111820");
const BASE_BORDER = hex("#ffffff");
const BASE_BORDER_ALPHA = 0.035;

const FOG_FILL: Readonly<Record<GridFogState, number>> = {
  visible: BASE_FILL,
  remembered: hex("#0b0f14"),
  unseen: hex("#05070a"),
};

const LAYER_ENTITY: Readonly<Record<GridLayer, number | null>> = {
  player: hex("#ffe680"),
  enemy: hex("#ff7474"),
  npc: hex("#86e6a7"),
  item: hex("#77d8ff"),
  trap: hex("#f3ae63"),
  terrain: null,
  empty: null,
};

const LAYER_FILL: Readonly<Partial<Record<GridLayer, number>>> = {
  player: hex("#1b1a12"),
  enemy: hex("#211213"),
  npc: hex("#102019"),
  item: hex("#0e1b23"),
  trap: hex("#22170d"),
};

const LAYER_BORDER: Readonly<Partial<Record<GridLayer, number>>> = {
  player: hex("#ffe680"),
  enemy: hex("#ff6a6a"),
  npc: hex("#71e096"),
  item: hex("#75d4ff"),
  trap: hex("#f5a652"),
};

/** Deterministic palette keyed only by view-model fields — no randomness or clocks. */
export const colorsForCell = (cell: GridCellView): StageCellColors => {
  if (cell.hitFlash) {
    return {
      fill: hex("#f5e6c8"),
      border: hex("#21130f"),
      entity: null,
      alpha: 1,
    };
  }

  const fogFill = FOG_FILL[cell.fog];
  const layerFill = LAYER_FILL[cell.layer] ?? fogFill;
  const fill = cell.fog === "visible" ? layerFill : fogFill;
  const border = LAYER_BORDER[cell.layer] ?? BASE_BORDER;
  const entity =
    cell.fog === "visible" && cell.layer !== "terrain" && cell.layer !== "empty"
      ? LAYER_ENTITY[cell.layer]
      : null;

  return {
    fill,
    border,
    entity,
    alpha: cell.fog === "remembered" ? 0.78 : 1,
  };
};

export const borderAlphaForCell = (cell: GridCellView): number =>
  cell.layer === "terrain" || cell.layer === "empty"
    ? BASE_BORDER_ALPHA
    : 0.35;
