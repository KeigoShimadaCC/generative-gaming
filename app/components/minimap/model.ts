import type { GridCellView, GridViewModel } from "@/components/grid/model";

export type MinimapMark =
  | "unseen"
  | "wall"
  | "floor-visible"
  | "floor-remembered"
  | "player"
  | "stairs"
  | "hoard";

export type MinimapCellView = {
  readonly x: number;
  readonly y: number;
  readonly mark: MinimapMark;
};

export type MinimapViewModel = {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly MinimapCellView[];
  readonly description: string;
};

const STAIRS_TERRAIN = "stairs_down";

export const createMinimapViewModel = (
  grid: GridViewModel,
): MinimapViewModel => {
  const cells = grid.cells.map((cell) => ({
    x: cell.x,
    y: cell.y,
    mark: markForCell(cell),
  }));

  return {
    width: grid.width,
    height: grid.height,
    cells,
    description: describeMinimap(cells),
  };
};

const markForCell = (cell: GridCellView): MinimapMark => {
  if (cell.fog === "unseen") {
    return "unseen";
  }

  if (cell.layer === "player") {
    return "player";
  }

  if (cell.featureKind === "hoard") {
    return "hoard";
  }

  if (cell.terrain === STAIRS_TERRAIN) {
    return "stairs";
  }

  if (cell.terrain === "wall") {
    return "wall";
  }

  if (cell.fog === "visible") {
    return "floor-visible";
  }

  return "floor-remembered";
};

const describeMinimap = (cells: readonly MinimapCellView[]): string => {
  const player = cells.find((cell) => cell.mark === "player");
  const stairs = cells.find((cell) => cell.mark === "stairs");
  const hoard = cells.find((cell) => cell.mark === "hoard");
  const exploredCount = cells.filter((cell) => cell.mark !== "unseen").length;

  const parts = [
    "Floor minimap.",
    `${exploredCount} explored tiles.`,
  ];

  if (player !== undefined) {
    parts.push(`Player at ${player.x},${player.y}.`);
  }

  if (stairs !== undefined) {
    parts.push(`Stairs down at ${stairs.x},${stairs.y}.`);
  }

  if (hoard !== undefined) {
    parts.push(`Hoard at ${hoard.x},${hoard.y}.`);
  }

  return parts.join(" ");
};
