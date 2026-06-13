import type {
  GridCellView,
  GridViewModel,
} from "@/components/grid/model";

export type StageGridMetrics = {
  readonly cellSize: number;
  readonly gap: number;
  readonly padding: number;
};

export type StageCellBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type StageTileOverlayKind = "wall-shadow" | "wall-edge";

export type StageTileOverlayDraw = StageCellBounds & {
  readonly key: string;
  readonly kind: StageTileOverlayKind;
  readonly fillColor: number;
  readonly alpha: number;
};

export type WallPresentation = {
  readonly mask: number;
  readonly tint: number;
  readonly overlays: readonly StageTileOverlayDraw[];
};

export const WALL_MASK = {
  north: 1,
  east: 2,
  south: 4,
  west: 8,
  northeast: 16,
  southeast: 32,
  southwest: 64,
  northwest: 128,
} as const;

const WALL_TINT_SOLID = 0xffffff;
const WALL_TINT_OPEN_SOUTH = 0xd8decb;
const WALL_TINT_OPEN_CORNER = 0xc4cbbb;

export const boundsForCell = (
  cell: Pick<GridCellView, "x" | "y">,
  metrics: StageGridMetrics,
): StageCellBounds => ({
  x: metrics.padding + cell.x * (metrics.cellSize + metrics.gap),
  y: metrics.padding + cell.y * (metrics.cellSize + metrics.gap),
  width: metrics.cellSize,
  height: metrics.cellSize,
});

export const wallPresentationForCell = (
  model: GridViewModel,
  cell: GridCellView,
  bounds: StageCellBounds,
): WallPresentation => {
  if (!isWall(cell)) {
    return { mask: 0, tint: WALL_TINT_SOLID, overlays: [] };
  }

  const mask = wallMaskForCell(model, cell.x, cell.y);
  const openSouth = (mask & WALL_MASK.south) === 0;
  const openEast = (mask & WALL_MASK.east) === 0;
  const openNorth = (mask & WALL_MASK.north) === 0;
  const openWest = (mask & WALL_MASK.west) === 0;
  const openCardinals = [openNorth, openEast, openSouth, openWest].filter(
    Boolean,
  ).length;
  const overlays: StageTileOverlayDraw[] = [];
  const edge = Math.max(2, Math.floor(bounds.width * 0.11));
  const drop = Math.max(3, Math.floor(bounds.width * 0.18));

  if (openSouth) {
    overlays.push({
      key: `${cell.key}:wall-shadow:south`,
      kind: "wall-shadow",
      x: bounds.x,
      y: bounds.y + bounds.height - edge,
      width: bounds.width,
      height: drop,
      fillColor: 0x020306,
      alpha: 0.32,
    });
  }

  if (openEast) {
    overlays.push({
      key: `${cell.key}:wall-shadow:east`,
      kind: "wall-shadow",
      x: bounds.x + bounds.width - edge,
      y: bounds.y + edge,
      width: drop,
      height: bounds.height - edge,
      fillColor: 0x020306,
      alpha: 0.2,
    });
  }

  if (openNorth) {
    overlays.push({
      key: `${cell.key}:wall-edge:north`,
      kind: "wall-edge",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: edge,
      fillColor: 0xf2f6dc,
      alpha: 0.16,
    });
  }

  if (openWest) {
    overlays.push({
      key: `${cell.key}:wall-edge:west`,
      kind: "wall-edge",
      x: bounds.x,
      y: bounds.y,
      width: edge,
      height: bounds.height,
      fillColor: 0xf2f6dc,
      alpha: 0.1,
    });
  }

  return {
    mask,
    tint:
      openCardinals >= 2
        ? WALL_TINT_OPEN_CORNER
        : openSouth
          ? WALL_TINT_OPEN_SOUTH
          : WALL_TINT_SOLID,
    overlays,
  };
};

export const wallMaskForCell = (
  model: GridViewModel,
  x: number,
  y: number,
): number => {
  let mask = 0;

  for (const neighbor of WALL_NEIGHBORS) {
    if (isWall(cellAt(model, x + neighbor.dx, y + neighbor.dy))) {
      mask |= neighbor.bit;
    }
  }

  return mask;
};

export const isWallTerrain = (terrain: string): boolean => terrain === "wall";

const isWall = (cell: GridCellView | undefined): boolean =>
  cell !== undefined && isWallTerrain(cell.terrain);

const cellAt = (
  model: GridViewModel,
  x: number,
  y: number,
): GridCellView | undefined => model.rows[y]?.[x];

const WALL_NEIGHBORS = [
  { dx: 0, dy: -1, bit: WALL_MASK.north },
  { dx: 1, dy: 0, bit: WALL_MASK.east },
  { dx: 0, dy: 1, bit: WALL_MASK.south },
  { dx: -1, dy: 0, bit: WALL_MASK.west },
  { dx: 1, dy: -1, bit: WALL_MASK.northeast },
  { dx: 1, dy: 1, bit: WALL_MASK.southeast },
  { dx: -1, dy: 1, bit: WALL_MASK.southwest },
  { dx: -1, dy: -1, bit: WALL_MASK.northwest },
] as const;
