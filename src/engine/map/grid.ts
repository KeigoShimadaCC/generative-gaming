import {
  config as defaultConfig,
  type GameConfig,
} from "../../config/index.js";
import type {
  FloorGeometrySlot,
  Position,
  SerializableRecord,
} from "../state/index.js";
import {
  cloneTile,
  createTile,
  Terrain,
  type TerrainKind,
  type Tile,
} from "./terrain.js";

export type TileGrid = {
  readonly kind: "tile-grid";
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly Tile[];
};

export type MapDepthBand = keyof GameConfig["runStructure"]["floorGeometry"];

export type GridBounds = {
  readonly width: number;
  readonly height: number;
};

export type CreateTileGridOptions = GridBounds & {
  readonly fill?: TerrainKind | Tile;
  readonly tiles?: readonly Tile[];
};

export type CreateGridForBandOptions = {
  readonly config?: GameConfig;
  readonly fill?: TerrainKind | Tile;
};

const NEIGHBOR_OFFSETS_8 = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
] as const satisfies readonly Position[];

export const createTileGrid = ({
  width,
  height,
  fill = Terrain.Floor,
  tiles,
}: CreateTileGridOptions): TileGrid => {
  assertGridDimensions(width, height);
  const expectedTileCount = width * height;

  if (tiles !== undefined) {
    if (tiles.length !== expectedTileCount) {
      throw new RangeError(
        `tile count must equal width * height (${expectedTileCount})`,
      );
    }

    return {
      kind: "tile-grid",
      width,
      height,
      tiles: tiles.map(cloneTile),
    };
  }

  const fillTile = typeof fill === "string" ? createTile(fill) : cloneTile(fill);

  return {
    kind: "tile-grid",
    width,
    height,
    tiles: Array.from({ length: expectedTileCount }, () => cloneTile(fillTile)),
  };
};

export const createGridForBand = (
  band: MapDepthBand,
  options: CreateGridForBandOptions = {},
): TileGrid => {
  const gameConfig = options.config ?? defaultConfig;
  const geometry = gameConfig.runStructure.floorGeometry[band].grid;

  return createTileGrid({
    width: geometry.width,
    height: geometry.height,
    fill: options.fill,
  });
};

export const createFloorGeometrySlot = (
  refId: string,
  grid: TileGrid,
): FloorGeometrySlot => ({
  refId,
  opaque: grid as unknown as SerializableRecord,
});

export const inBounds = (bounds: GridBounds, position: Position): boolean =>
  Number.isSafeInteger(position.x) &&
  Number.isSafeInteger(position.y) &&
  position.x >= 0 &&
  position.x < bounds.width &&
  position.y >= 0 &&
  position.y < bounds.height;

export const idx = (grid: GridBounds, position: Position): number => {
  if (!inBounds(grid, position)) {
    throw new RangeError(`position (${position.x}, ${position.y}) out of bounds`);
  }

  return position.y * grid.width + position.x;
};

export const coord = (grid: GridBounds, index: number): Position => {
  if (!Number.isSafeInteger(index) || index < 0 || index >= grid.width * grid.height) {
    throw new RangeError(`index ${index} out of bounds`);
  }

  return {
    x: index % grid.width,
    y: Math.floor(index / grid.width),
  };
};

export const getTile = (grid: TileGrid, position: Position): Tile =>
  getTileAtIndex(grid, idx(grid, position));

export const getTileAtIndex = (grid: TileGrid, index: number): Tile => {
  const tile = grid.tiles[index];

  if (tile === undefined) {
    throw new RangeError(`tile index ${index} out of bounds`);
  }

  return tile;
};

export const withTile = (
  grid: TileGrid,
  position: Position,
  tile: Tile,
): TileGrid => {
  const index = idx(grid, position);
  const tiles = grid.tiles.map(cloneTile);
  tiles[index] = cloneTile(tile);

  return createTileGrid({
    width: grid.width,
    height: grid.height,
    tiles,
  });
};

export const neighbors8 = (
  grid: GridBounds,
  position: Position,
): readonly Position[] =>
  NEIGHBOR_OFFSETS_8.map((offset) => ({
    x: position.x + offset.x,
    y: position.y + offset.y,
  })).filter((neighbor) => inBounds(grid, neighbor));

export const line = (start: Position, end: Position): readonly Position[] => {
  assertPosition(start, "start");
  assertPosition(end, "end");

  const cells: Position[] = [];
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const sx = start.x < end.x ? 1 : -1;
  const dy = -Math.abs(end.y - start.y);
  const sy = start.y < end.y ? 1 : -1;
  let error = dx + dy;

  while (true) {
    cells.push({ x, y });

    if (x === end.x && y === end.y) {
      return cells;
    }

    const doubledError = 2 * error;

    if (doubledError >= dy) {
      error += dy;
      x += sx;
    }

    if (doubledError <= dx) {
      error += dx;
      y += sy;
    }
  }
};

export const discCells = (
  origin: Position,
  radius: number,
  bounds?: GridBounds,
): readonly Position[] => {
  assertPosition(origin, "origin");
  assertNonNegativeInteger(radius, "radius");

  const cells: Position[] = [];
  const radiusSquared = radius * radius;

  for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
    for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
      const position = { x, y };
      const dx = x - origin.x;
      const dy = y - origin.y;

      if (
        dx * dx + dy * dy <= radiusSquared &&
        (bounds === undefined || inBounds(bounds, position))
      ) {
        cells.push(position);
      }
    }
  }

  return cells;
};

export const radiusCells = discCells;

export const chebyshevDistance = (a: Position, b: Position): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export const distanceSquared = (a: Position, b: Position): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return dx * dx + dy * dy;
};

const assertGridDimensions = (width: number, height: number): void => {
  if (!Number.isSafeInteger(width) || width <= 0) {
    throw new RangeError("width must be a positive safe integer");
  }

  if (!Number.isSafeInteger(height) || height <= 0) {
    throw new RangeError("height must be a positive safe integer");
  }

  if (!Number.isSafeInteger(width * height)) {
    throw new RangeError("width * height must be a safe integer");
  }
};

const assertPosition = (position: Position, name: string): void => {
  if (!Number.isSafeInteger(position.x) || !Number.isSafeInteger(position.y)) {
    throw new RangeError(`${name} must contain safe integer coordinates`);
  }
};

const assertNonNegativeInteger = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
};
