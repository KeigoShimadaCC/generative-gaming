import {
  canSee,
  chebyshevDistance,
  type TileGrid,
} from "../map/index.js";
import type {
  EnemyEntityInstance,
  EntityId,
  GameState,
  Position,
} from "../state/index.js";
import { gridFromState } from "../turn/actions.js";

/** LOS radius for enemy perception; map-sized default until a config pin exists. */
export const PERCEPTION_RADIUS_TILES = 99;

export const enemyEntity = (
  state: GameState,
  enemyId: EntityId,
): EnemyEntityInstance | null => {
  const entity = state.entities[enemyId];

  return entity?.kind === "enemy" ? entity : null;
};

export const gridOrNull = (state: GameState): TileGrid | null =>
  gridFromState(state);

export const playerVisible = (state: GameState, enemyId: EntityId): boolean => {
  const enemy = enemyEntity(state, enemyId);
  const grid = gridOrNull(state);

  if (enemy === null || grid === null) {
    return false;
  }

  return canSee(
    grid,
    enemy.position,
    state.player.position,
    PERCEPTION_RADIUS_TILES,
  );
};

export const distanceTo = (
  state: GameState,
  enemyId: EntityId,
  target: Position = state.player.position,
): number => {
  const enemy = enemyEntity(state, enemyId);

  if (enemy === null) {
    return Number.POSITIVE_INFINITY;
  }

  return chebyshevDistance(enemy.position, target);
};

export const hpFraction = (state: GameState, enemyId: EntityId): number => {
  const enemy = enemyEntity(state, enemyId);

  if (enemy === null) {
    return 1;
  }

  const maxHp = enemy.definition.stats.hp;

  if (maxHp <= 0) {
    return 0;
  }

  return enemy.currentHP / maxHp;
};

export const alliesWithTag = (
  state: GameState,
  enemyId: EntityId,
  inSight: boolean,
): readonly EnemyEntityInstance[] => {
  const enemy = enemyEntity(state, enemyId);

  if (enemy === null) {
    return [];
  }

  const tag = enemy.definition.origin;
  const allies = Object.values(state.entities).filter(
    (entity): entity is EnemyEntityInstance =>
      entity.kind === "enemy" &&
      entity.id !== enemyId &&
      entity.definition.origin === tag,
  );

  if (!inSight) {
    return allies;
  }

  return allies.filter((ally) => playerVisibleFrom(state, enemy.position, ally.position));
};

export const readPositionRecord = (
  value: unknown,
): Position | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as { readonly x?: unknown; readonly y?: unknown };

  if (
    typeof record.x === "number" &&
    Number.isSafeInteger(record.x) &&
    typeof record.y === "number" &&
    Number.isSafeInteger(record.y)
  ) {
    return { x: record.x, y: record.y };
  }

  return null;
};

export const guardPostFor = (enemy: EnemyEntityInstance): Position =>
  readPositionRecord(enemy.behaviorRuntime.post) ?? enemy.position;

export const atTether = (
  state: GameState,
  enemyId: EntityId,
  post: Position,
  radiusTiles: number,
): boolean => distanceFromPost(state, enemyId, post) <= radiusTiles;

export const distanceFromPost = (
  state: GameState,
  enemyId: EntityId,
  post: Position,
): number => {
  const enemy = enemyEntity(state, enemyId);

  if (enemy === null) {
    return Number.POSITIVE_INFINITY;
  }

  return chebyshevDistance(enemy.position, post);
};

export const isTerritorialProvoked = (enemy: EnemyEntityInstance): boolean => {
  if (enemy.behaviorRuntime.provoked === true) {
    return true;
  }

  return enemy.currentHP < enemy.definition.stats.hp;
};

export const readWaypointList = (
  enemy: EnemyEntityInstance,
): readonly Position[] => {
  const raw = enemy.behaviorRuntime.waypoints;

  if (!Array.isArray(raw)) {
    return [];
  }

  const waypoints: Position[] = [];

  for (const entry of raw) {
    const position = readPositionRecord(entry);

    if (position !== null) {
      waypoints.push(position);
    }
  }

  return waypoints;
};

export const patrolIndexFor = (enemy: EnemyEntityInstance): number => {
  const raw = enemy.behaviorRuntime.patrolIndex;

  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0
    ? raw
    : 0;
};

export const isPatrolEngaged = (enemy: EnemyEntityInstance): boolean =>
  enemy.behaviorRuntime.patrolEngaged === true;

const playerVisibleFrom = (
  state: GameState,
  origin: Position,
  target: Position,
): boolean => {
  const grid = gridOrNull(state);

  if (grid === null) {
    return false;
  }

  return canSee(grid, origin, target, PERCEPTION_RADIUS_TILES);
};
