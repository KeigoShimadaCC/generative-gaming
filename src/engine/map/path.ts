import type { Position } from "../state/index.js";
import { getTile, idx, neighbors8, type TileGrid } from "./grid.js";
import { isWalkableTile, Terrain, type Tile } from "./terrain.js";

export type PathOptions = {
  readonly openDoors?: boolean;
  readonly isOccupied?: (position: Position) => boolean;
};

const CARDINAL_STEP_COST = 10;
const DIAGONAL_STEP_COST = 14;

// Neighbor expansion uses neighbors8 order: NW, N, NE, W, E, SW, S, SE (row-major
// offsets from grid.ts). Open-set ties break on f, then h, then y, then x.
const compareOpenNodes = (
  a: { f: number; h: number; position: Position },
  b: { f: number; h: number; position: Position },
): number => {
  if (a.f !== b.f) {
    return a.f - b.f;
  }

  if (a.h !== b.h) {
    return a.h - b.h;
  }

  if (a.position.y !== b.position.y) {
    return a.position.y - b.position.y;
  }

  return a.position.x - b.position.x;
};

const positionsEqual = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const stepCost = (from: Position, to: Position): number => {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);

  return dx !== 0 && dy !== 0 ? DIAGONAL_STEP_COST : CARDINAL_STEP_COST;
};

const octileHeuristic = (from: Position, to: Position): number => {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const min = Math.min(dx, dy);
  const max = Math.max(dx, dy);

  return min * DIAGONAL_STEP_COST + (max - min) * CARDINAL_STEP_COST;
};

const isPassableTile = (tile: Tile, openDoors: boolean): boolean => {
  if (!isWalkableTile(tile)) {
    return false;
  }

  if (tile.terrain === Terrain.Door && tile.door === "closed" && !openDoors) {
    return false;
  }

  return true;
};

const isPassable = (
  grid: TileGrid,
  position: Position,
  options: PathOptions,
  exempt: Position,
): boolean => {
  if (!positionsEqual(position, exempt) && options.isOccupied?.(position)) {
    return false;
  }

  return isPassableTile(getTile(grid, position), options.openDoors ?? false);
};

export const path = (
  grid: TileGrid,
  from: Position,
  to: Position,
  options: PathOptions = {},
): readonly Position[] | null => {
  if (positionsEqual(from, to)) {
    return isPassable(grid, from, options, from) ? [from] : null;
  }

  if (
    !isPassable(grid, from, options, from) ||
    !isPassable(grid, to, options, from)
  ) {
    return null;
  }

  const goalIndex = idx(grid, to);
  const startIndex = idx(grid, from);

  const gScore = new Map<number, number>([[startIndex, 0]]);
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();

  type OpenNode = {
    index: number;
    position: Position;
    f: number;
    h: number;
  };

  const open: OpenNode[] = [
    {
      index: startIndex,
      position: from,
      f: octileHeuristic(from, to),
      h: octileHeuristic(from, to),
    },
  ];

  while (open.length > 0) {
    open.sort(compareOpenNodes);
    const current = open.shift();

    if (current === undefined) {
      break;
    }

    if (closed.has(current.index)) {
      continue;
    }

    if (current.index === goalIndex) {
      const route: Position[] = [to];
      let cursor = goalIndex;

      while (cursor !== startIndex) {
        const previous = cameFrom.get(cursor);

        if (previous === undefined) {
          return null;
        }

        cursor = previous;
        route.push({
          x: cursor % grid.width,
          y: Math.floor(cursor / grid.width),
        });
      }

      route.reverse();
      return route;
    }

    closed.add(current.index);

    const currentG = gScore.get(current.index) ?? Number.POSITIVE_INFINITY;

    for (const neighbor of neighbors8(grid, current.position)) {
      const neighborIndex = idx(grid, neighbor);

      if (closed.has(neighborIndex)) {
        continue;
      }

      if (!isPassable(grid, neighbor, options, from)) {
        continue;
      }

      const tentativeG = currentG + stepCost(current.position, neighbor);
      const knownG = gScore.get(neighborIndex);

      if (knownG !== undefined && tentativeG >= knownG) {
        continue;
      }

      cameFrom.set(neighborIndex, current.index);
      gScore.set(neighborIndex, tentativeG);

      const h = octileHeuristic(neighbor, to);
      open.push({
        index: neighborIndex,
        position: neighbor,
        f: tentativeG + h,
        h,
      });
    }
  }

  return null;
};