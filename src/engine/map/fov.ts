import type { Position } from "../state/index.js";
import {
  coord,
  distanceSquared,
  getTile,
  getTileAtIndex,
  idx,
  inBounds,
  type TileGrid,
} from "./grid.js";
import {
  cloneTile,
  isTransparentTile,
  type Tile,
} from "./terrain.js";

export type TransparencyPredicate = (
  tile: Tile,
  position: Position,
  grid: TileGrid,
) => boolean;

export type VisibleCellsOptions = {
  readonly radius: number;
  readonly isTransparent?: TransparencyPredicate;
};

export type FogState = "unseen" | "remembered" | "visible";

export type FogTileMemory = {
  readonly state: FogState;
  readonly rememberedTile: Tile | null;
};

export type FogMemory = {
  readonly ownerId: string;
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly FogTileMemory[];
};

type CardinalDirection = "north" | "south" | "east" | "west";

type ShadowcastRow = {
  readonly depth: number;
  readonly startSlope: number;
  readonly endSlope: number;
};

export function visibleCells(
  grid: TileGrid,
  origin: Position,
  radius: number,
): ReadonlySet<number>;
export function visibleCells(
  grid: TileGrid,
  origin: Position,
  options: VisibleCellsOptions,
): ReadonlySet<number>;
export function visibleCells(
  grid: TileGrid,
  origin: Position,
  radiusOrOptions: number | VisibleCellsOptions,
): ReadonlySet<number> {
  if (!inBounds(grid, origin)) {
    throw new RangeError(`origin (${origin.x}, ${origin.y}) out of bounds`);
  }

  const options =
    typeof radiusOrOptions === "number"
      ? { radius: radiusOrOptions }
      : radiusOrOptions;
  assertRadius(options.radius);

  const visible = new Set<number>([idx(grid, origin)]);

  if (options.radius === 0) {
    return visible;
  }

  const isTransparent = options.isTransparent ?? defaultTransparency;

  for (const direction of ["north", "south", "east", "west"] as const) {
    scanRow(
      grid,
      origin,
      options.radius,
      direction,
      { depth: 1, startSlope: -1, endSlope: 1 },
      visible,
      isTransparent,
    );
  }

  return visible;
}

export const visiblePositions = (
  grid: TileGrid,
  origin: Position,
  radiusOrOptions: number | VisibleCellsOptions,
): readonly Position[] =>
  [...visibleCellsForRadiusOrOptions(grid, origin, radiusOrOptions)]
    .sort((left, right) => left - right)
    .map((index) => coord(grid, index));

export const canSee = (
  grid: TileGrid,
  origin: Position,
  target: Position,
  radiusOrOptions: number | VisibleCellsOptions,
): boolean =>
  visibleCellsForRadiusOrOptions(grid, origin, radiusOrOptions).has(
    idx(grid, target),
  );

export const createFogMemory = (
  grid: TileGrid,
  ownerId = "player",
): FogMemory => ({
  ownerId,
  width: grid.width,
  height: grid.height,
  tiles: Array.from({ length: grid.tiles.length }, () => ({
    state: "unseen",
    rememberedTile: null,
  })),
});

export const updateFogMemory = (
  fog: FogMemory,
  grid: TileGrid,
  visible: ReadonlySet<number>,
): FogMemory => {
  assertFogMatchesGrid(fog, grid);

  return {
    ownerId: fog.ownerId,
    width: fog.width,
    height: fog.height,
    tiles: fog.tiles.map((memory, index) => {
      if (visible.has(index)) {
        return {
          state: "visible",
          rememberedTile: cloneTile(getTileAtIndex(grid, index)),
        };
      }

      if (memory.state === "visible") {
        return {
          state: "remembered",
          rememberedTile:
            memory.rememberedTile === null
              ? null
              : cloneTile(memory.rememberedTile),
        };
      }

      return {
        state: memory.state,
        rememberedTile:
          memory.rememberedTile === null
            ? null
            : cloneTile(memory.rememberedTile),
      };
    }),
  };
};

export const fogAt = (fog: FogMemory, position: Position): FogTileMemory => {
  const index = idx(fog, position);
  const memory = fog.tiles[index];

  if (memory === undefined) {
    throw new RangeError(`fog index ${index} out of bounds`);
  }

  return memory;
};

const scanRow = (
  grid: TileGrid,
  origin: Position,
  radius: number,
  direction: CardinalDirection,
  row: ShadowcastRow,
  visible: Set<number>,
  isTransparent: TransparencyPredicate,
): void => {
  if (row.depth > radius) {
    return;
  }

  let startSlope = row.startSlope;
  let previousBlocking: boolean | null = null;

  for (
    let column = roundTiesUp(row.depth * row.startSlope);
    column <= roundTiesDown(row.depth * row.endSlope);
    column += 1
  ) {
    const position = transformQuadrant(origin, direction, row.depth, column);
    const positionInBounds = inBounds(grid, position);
    const tileBlocks =
      positionInBounds && !isTransparent(getTile(grid, position), position, grid);
    const blocking = !positionInBounds || tileBlocks;

    if (
      positionInBounds &&
      distanceSquared(origin, position) <= radius * radius &&
      (tileBlocks || isSymmetric(row, column))
    ) {
      visible.add(idx(grid, position));
    }

    if (previousBlocking === true && !blocking) {
      startSlope = slope(row.depth, column);
    }

    if (previousBlocking === false && blocking) {
      scanRow(
        grid,
        origin,
        radius,
        direction,
        {
          depth: row.depth + 1,
          startSlope,
          endSlope: slope(row.depth, column),
        },
        visible,
        isTransparent,
      );
    }

    previousBlocking = blocking;
  }

  if (previousBlocking === false) {
    scanRow(
      grid,
      origin,
      radius,
      direction,
      {
        depth: row.depth + 1,
        startSlope,
        endSlope: row.endSlope,
      },
      visible,
      isTransparent,
    );
  }
};

const visibleCellsForRadiusOrOptions = (
  grid: TileGrid,
  origin: Position,
  radiusOrOptions: number | VisibleCellsOptions,
): ReadonlySet<number> =>
  typeof radiusOrOptions === "number"
    ? visibleCells(grid, origin, radiusOrOptions)
    : visibleCells(grid, origin, radiusOrOptions);

const defaultTransparency: TransparencyPredicate = (tile) =>
  isTransparentTile(tile);

const transformQuadrant = (
  origin: Position,
  direction: CardinalDirection,
  depth: number,
  column: number,
): Position => {
  switch (direction) {
    case "north":
      return { x: origin.x + column, y: origin.y - depth };
    case "south":
      return { x: origin.x + column, y: origin.y + depth };
    case "east":
      return { x: origin.x + depth, y: origin.y + column };
    case "west":
      return { x: origin.x - depth, y: origin.y + column };
  }
};

const isSymmetric = (row: ShadowcastRow, column: number): boolean =>
  column >= row.depth * row.startSlope &&
  column <= row.depth * row.endSlope;

const slope = (depth: number, column: number): number =>
  (2 * column - 1) / (2 * depth);

const roundTiesUp = (value: number): number => Math.floor(value + 0.5);

const roundTiesDown = (value: number): number => Math.ceil(value - 0.5);

const assertRadius = (radius: number): void => {
  if (!Number.isSafeInteger(radius) || radius < 0) {
    throw new RangeError("radius must be a non-negative safe integer");
  }
};

const assertFogMatchesGrid = (fog: FogMemory, grid: TileGrid): void => {
  if (
    fog.width !== grid.width ||
    fog.height !== grid.height ||
    fog.tiles.length !== grid.tiles.length
  ) {
    throw new RangeError("fog memory dimensions must match the grid");
  }
};
