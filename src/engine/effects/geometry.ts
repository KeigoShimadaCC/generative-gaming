import type { TargetingShape } from "../../schemas/vocab/index.js";
import { canSee } from "../map/fov.js";
import {
  chebyshevDistance,
  discCells,
  getTile,
  inBounds,
  line,
  type TileGrid
} from "../map/grid.js";
import { isTransparentTile, isWalkableTile } from "../map/terrain.js";
import type {
  EntityId,
  EntityInstance,
  GameState,
  Position
} from "../state/index.js";
import { gridFromState } from "../turn/actions.js";

export type TargetingContext = {
  readonly originActorId: EntityId | "player";
  readonly targetCell?: Position;
};

export type TargetingGeometryResult = {
  readonly cells: readonly Position[];
  readonly entityIds: readonly (EntityId | "player")[];
};

export const resolveTargetingGeometry = (
  state: GameState,
  origin: Position,
  targeting: TargetingShape,
  context: TargetingContext
): TargetingGeometryResult => {
  const grid = gridFromState(state);

  if (grid === null) {
    return emptyResult();
  }

  switch (targeting.kind) {
    case "self":
      return resolveSelf(origin, context.originActorId);
    case "melee":
      return resolveMelee(state, grid, origin, context.targetCell);
    case "bolt":
      return resolveBolt(
        state,
        grid,
        origin,
        context.targetCell,
        targeting.bolt?.rangeTiles ?? 0,
        context.originActorId
      );
    case "burst":
      return resolveBurst(
        state,
        grid,
        origin,
        context.targetCell,
        targeting.burst?.radiusTiles ?? 0,
        targeting.burst?.center ?? "self"
      );
    case "floor":
      return resolveFloor(state, grid);
  }
};

const emptyResult = (): TargetingGeometryResult => ({
  cells: [],
  entityIds: []
});

const resolveSelf = (
  origin: Position,
  originActorId: EntityId | "player"
): TargetingGeometryResult => ({
  cells: [origin],
  entityIds: [originActorId]
});

const resolveMelee = (
  state: GameState,
  grid: TileGrid,
  origin: Position,
  targetCell: Position | undefined
): TargetingGeometryResult => {
  if (targetCell === undefined || !inBounds(grid, targetCell)) {
    return emptyResult();
  }

  if (
    samePosition(origin, targetCell) ||
    chebyshevDistance(origin, targetCell) > 1
  ) {
    return emptyResult();
  }

  return {
    cells: [targetCell],
    entityIds: entitiesAt(state, targetCell)
  };
};

const resolveBolt = (
  state: GameState,
  grid: TileGrid,
  origin: Position,
  targetCell: Position | undefined,
  range: number,
  excludeActorId: EntityId | "player"
): TargetingGeometryResult => {
  if (targetCell === undefined || range <= 0) {
    return emptyResult();
  }

  const lineCells = line(origin, targetCell).slice(1, range + 1);
  const cells: Position[] = [];

  for (const cell of lineCells) {
    if (!inBounds(grid, cell)) {
      break;
    }

    const tile = getTile(grid, cell);

    if (!isTransparentTile(tile)) {
      break;
    }

    cells.push(cell);

    const occupants = entitiesAt(state, cell).filter(
      (id) => id !== excludeActorId
    );

    if (occupants.length > 0) {
      const hasLineOfSight = canSee(grid, origin, cell, { radius: range });

      return {
        cells,
        entityIds: hasLineOfSight ? occupants : []
      };
    }
  }

  return { cells, entityIds: [] };
};

const resolveBurst = (
  state: GameState,
  grid: TileGrid,
  origin: Position,
  targetCell: Position | undefined,
  radius: number,
  center: "self" | "impact"
): TargetingGeometryResult => {
  if (radius <= 0) {
    return emptyResult();
  }

  const burstCenter = center === "impact" ? targetCell : origin;

  if (burstCenter === undefined || !inBounds(grid, burstCenter)) {
    return emptyResult();
  }

  const cells = discCells(burstCenter, radius, grid);
  const entityIds = uniqueSortedIds(
    cells.flatMap((cell) => entitiesAt(state, cell))
  );

  return { cells, entityIds };
};

const resolveFloor = (
  state: GameState,
  grid: TileGrid
): TargetingGeometryResult => {
  const cells: Position[] = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const position = { x, y };

      if (isWalkableTile(getTile(grid, position))) {
        cells.push(position);
      }
    }
  }

  const entityIds = uniqueSortedIds(
    cells.flatMap((cell) => entitiesAt(state, cell))
  );

  return { cells, entityIds };
};

const entitiesAt = (
  state: GameState,
  position: Position
): readonly (EntityId | "player")[] => {
  const ids: (EntityId | "player")[] = [];

  if (samePosition(state.player.position, position)) {
    ids.push("player");
  }

  for (const entity of sortedEntities(state)) {
    if (samePosition(entity.position, position)) {
      ids.push(entity.id);
    }
  }

  return ids;
};

const sortedEntities = (state: GameState): readonly EntityInstance[] =>
  Object.values(state.entities).sort((left, right) =>
    left.id.localeCompare(right.id)
  );

const uniqueSortedIds = (
  ids: readonly (EntityId | "player")[]
): readonly (EntityId | "player")[] => [...new Set(ids)].sort(compareActorId);

const compareActorId = (
  left: EntityId | "player",
  right: EntityId | "player"
): number => {
  if (left === "player") {
    return right === "player" ? 0 : -1;
  }

  if (right === "player") {
    return 1;
  }

  return left.localeCompare(right);
};

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;
