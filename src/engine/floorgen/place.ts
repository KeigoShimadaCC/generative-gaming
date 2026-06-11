import {
  getTile,
  idx,
  inBounds,
  neighbors8,
  type TileGrid,
} from "../map/index.js";
import { isWalkableTile, Terrain } from "../map/terrain.js";
import type { Rng } from "../rng/index.js";
import type { Position } from "../state/index.js";
import {
  CONNECTIVITY_ITERATION_CAP,
  roomContaining,
  type RoomRect,
} from "./generate.js";

export type PlacementKind = "enemy" | "item" | "trap" | "npc";

export type PlacementDistanceHint = "near_entrance" | "far_from_entrance";

export type PlacementHint = {
  readonly roomIndex?: number;
  readonly distance?: PlacementDistanceHint;
  readonly spread?: boolean;
};

export type PlacementRequest = {
  readonly id: string;
  readonly kind: PlacementKind;
  readonly hint?: PlacementHint;
};

export type PlacementDeviationReason =
  | "room_index_unsatisfiable"
  | "distance_hint_unsatisfiable"
  | "spread_hint_unsatisfiable";

export type PlacementDeviation = {
  readonly requestId: string;
  readonly hint: PlacementHint;
  readonly reasons: readonly PlacementDeviationReason[];
};

export type PlacementAllocation = {
  readonly requestId: string;
  readonly kind: PlacementKind;
  readonly position: Position;
};

export type AllocationErrorCode = "capacity_exhausted";

export type AllocationError = {
  readonly kind: "allocation-error";
  readonly code: AllocationErrorCode;
  readonly message: string;
  readonly legalCellCount: number;
  readonly requestCount: number;
};

export type AllocateCellsResult =
  | {
      readonly ok: true;
      readonly placements: readonly PlacementAllocation[];
      readonly deviations: readonly PlacementDeviation[];
    }
  | { readonly ok: false; readonly error: AllocationError };

export type PlacementGrid = {
  readonly grid: TileGrid;
  readonly entrance: Position;
  readonly stairsDown: Position;
  readonly rooms: readonly RoomRect[];
};

const manhattanDistance = (a: Position, b: Position): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const positionsEqual = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const positionKey = (position: Position): string => `${position.x},${position.y}`;

const isExitTerrain = (grid: TileGrid, position: Position): boolean => {
  if (!inBounds(grid, position)) {
    return true;
  }

  const terrain = getTile(grid, position).terrain;
  return terrain === Terrain.Entrance || terrain === Terrain.StairsDown;
};

const sortPositionsStable = (positions: readonly Position[]): Position[] =>
  [...positions].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

const reachableCellSet = (
  grid: TileGrid,
  entrance: Position,
): ReadonlySet<number> | null => {
  if (!inBounds(grid, entrance)) {
    return null;
  }

  const startIndex = idx(grid, entrance);
  const startTile = grid.tiles[startIndex];
  if (startTile === undefined || !isWalkableTile(startTile)) {
    return null;
  }

  const visited = new Set<number>([startIndex]);
  const queue: number[] = [startIndex];
  let iterations = 0;

  while (queue.length > 0) {
    iterations += 1;
    if (iterations > CONNECTIVITY_ITERATION_CAP) {
      return null;
    }

    const currentIndex = queue.shift();
    if (currentIndex === undefined) {
      break;
    }

    const current = {
      x: currentIndex % grid.width,
      y: Math.floor(currentIndex / grid.width),
    };

    for (const neighbor of neighbors8(grid, current)) {
      const neighborIndex = idx(grid, neighbor);
      if (visited.has(neighborIndex)) {
        continue;
      }

      const tile = grid.tiles[neighborIndex];
      if (tile === undefined || !isWalkableTile(tile)) {
        continue;
      }

      visited.add(neighborIndex);
      queue.push(neighborIndex);
    }
  }

  return visited;
};

export const collectLegalPlacementCells = (
  floor: PlacementGrid,
): readonly Position[] => {
  const reachable = reachableCellSet(floor.grid, floor.entrance);
  if (reachable === null) {
    return [];
  }

  const legal: Position[] = [];

  for (const index of reachable) {
    const position = {
      x: index % floor.grid.width,
      y: Math.floor(index / floor.grid.width),
    };

    if (
      positionsEqual(position, floor.entrance) ||
      positionsEqual(position, floor.stairsDown) ||
      isExitTerrain(floor.grid, position)
    ) {
      continue;
    }

    legal.push(position);
  }

  return sortPositionsStable(legal);
};

const filterByRoomIndex = (
  candidates: readonly Position[],
  rooms: readonly RoomRect[],
  roomIndex: number,
): readonly Position[] =>
  candidates.filter((position) => roomContaining(rooms, position) === roomIndex);

const filterByDistanceHint = (
  candidates: readonly Position[],
  entrance: Position,
  distance: PlacementDistanceHint,
): readonly Position[] => {
  if (candidates.length === 0) {
    return candidates;
  }

  const distances = candidates.map((position) => ({
    position,
    distance: manhattanDistance(position, entrance),
  }));

  const targetDistance =
    distance === "near_entrance"
      ? Math.min(...distances.map((entry) => entry.distance))
      : Math.max(...distances.map((entry) => entry.distance));

  return distances
    .filter((entry) => entry.distance === targetDistance)
    .map((entry) => entry.position);
};

const filterBySpread = (
  candidates: readonly Position[],
  occupied: ReadonlySet<string>,
): readonly Position[] => {
  if (candidates.length === 0 || occupied.size === 0) {
    return candidates;
  }

  const occupiedPositions = [...occupied].map((key) => {
    const [xText, yText] = key.split(",");
    return {
      x: Number(xText),
      y: Number(yText),
    };
  });

  const scored = candidates.map((position) => {
    const minDistance = occupiedPositions.reduce((best, occupiedPosition) => {
      const distance = manhattanDistance(position, occupiedPosition);
      return Math.min(best, distance);
    }, Number.POSITIVE_INFINITY);

    return { position, minDistance };
  });

  const bestSpread = Math.max(...scored.map((entry) => entry.minDistance));
  return scored
    .filter((entry) => entry.minDistance === bestSpread)
    .map((entry) => entry.position);
};

const applyHintFilters = (
  floor: PlacementGrid,
  candidates: readonly Position[],
  hint: PlacementHint | undefined,
  occupied: ReadonlySet<string>,
): {
  readonly hinted: readonly Position[];
  readonly satisfied: boolean;
  readonly reasons: readonly PlacementDeviationReason[];
} => {
  if (hint === undefined) {
    return { hinted: candidates, satisfied: true, reasons: [] };
  }

  let current = candidates;
  const reasons: PlacementDeviationReason[] = [];

  if (hint.roomIndex !== undefined) {
    const inRoom = filterByRoomIndex(current, floor.rooms, hint.roomIndex);
    if (inRoom.length === 0) {
      reasons.push("room_index_unsatisfiable");
      return { hinted: candidates, satisfied: false, reasons };
    }
    current = inRoom;
  }

  if (hint.distance !== undefined) {
    const byDistance = filterByDistanceHint(current, floor.entrance, hint.distance);
    if (byDistance.length === 0) {
      reasons.push("distance_hint_unsatisfiable");
      return { hinted: candidates, satisfied: false, reasons };
    }
    current = byDistance;
  }

  if (hint.spread === true) {
    const spread = filterBySpread(current, occupied);
    if (spread.length === 0) {
      reasons.push("spread_hint_unsatisfiable");
      return { hinted: candidates, satisfied: false, reasons };
    }
    current = spread;
  }

  return { hinted: current, satisfied: true, reasons };
};

const pickPosition = (candidates: readonly Position[], rng: Rng): Position => {
  const ordered = sortPositionsStable(candidates);
  return rng.pick(ordered);
};

export const allocateCells = (
  grid: PlacementGrid,
  requests: readonly PlacementRequest[],
  rng: Rng,
): AllocateCellsResult => {
  const legalCells = collectLegalPlacementCells(grid);

  if (requests.length > legalCells.length) {
    return {
      ok: false,
      error: {
        kind: "allocation-error",
        code: "capacity_exhausted",
        message: `cannot place ${requests.length} entities on ${legalCells.length} legal cells`,
        legalCellCount: legalCells.length,
        requestCount: requests.length,
      },
    };
  }

  const occupied = new Set<string>();
  const placements: PlacementAllocation[] = [];
  const deviations: PlacementDeviation[] = [];

  for (const request of requests) {
    const available = legalCells.filter(
      (position) => !occupied.has(positionKey(position)),
    );

    const { hinted, satisfied, reasons } = applyHintFilters(
      grid,
      available,
      request.hint,
      occupied,
    );

    if (!satisfied && request.hint !== undefined) {
      deviations.push({
        requestId: request.id,
        hint: request.hint,
        reasons,
      });
    }

    const position = pickPosition(satisfied ? hinted : available, rng);
    occupied.add(positionKey(position));
    placements.push({
      requestId: request.id,
      kind: request.kind,
      position,
    });
  }

  return {
    ok: true,
    placements,
    deviations,
  };
};
