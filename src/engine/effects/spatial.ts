import { bounds } from "../../config/index.js";
import type { EnemyDefinition } from "../../schemas/entities/index.js";
import type {
  Effect,
  EffectVerbKind,
  TargetingShape
} from "../../schemas/vocab/index.js";
import {
  createFogMemory,
  getTile,
  inBounds,
  isWalkableTile,
  line,
  neighbors8,
  Terrain,
  updateFogMemory,
  withTile,
  type FogMemory,
  type TileGrid
} from "../map/index.js";
import { costOf } from "../enemies/index.js";
import {
  allocateEntityId,
  type EnemyEntityInstance,
  type EntityId,
  type EntityInstance,
  type GameState,
  type Position,
  type SerializableRecord
} from "../state/index.js";
import {
  applyDeath,
  type CombatActorId,
  type DeathAttribution
} from "../systems/combat.js";
import type { TurnEvent } from "../turn/index.js";
import { gridFromState } from "../turn/actions.js";
import { resolveTargetingGeometry } from "./geometry.js";
import {
  effectExecutedEvent,
  registerEffectExecutor,
  rejectEffect,
  type EffectActorId,
  type EffectExecutionContext,
  type EffectExecutor,
  type EffectExecutorResult
} from "./registry.js";

type SpatialEffectVerb =
  | "teleport_self"
  | "teleport_target"
  | "blink"
  | "knockback"
  | "reveal"
  | "summon"
  | "transform"
  | "dig";

type SpatialActor = {
  readonly id: EffectActorId;
  readonly position: Position;
  readonly entity: EntityInstance | null;
};

type Direction = {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
};

type FloorKnowledge = {
  readonly mapRevealed?: boolean;
  readonly revealedItemIds?: readonly EntityId[];
  readonly revealedEnemyIds?: readonly EntityId[];
  readonly revealedTrapIds?: readonly EntityId[];
};

type FloorRuntimeOpaque = TileGrid & {
  readonly fog?: FogMemory;
  readonly knowledge?: FloorKnowledge;
  readonly enemyRoster?: readonly EnemyDefinition[];
  readonly roster?:
    | readonly EnemyDefinition[]
    | {
        readonly enemies?: readonly EnemyDefinition[];
      };
};

const SPATIAL_EXECUTORS = {
  teleport_self: executeTeleportSelf,
  teleport_target: executeTeleportTarget,
  blink: executeBlink,
  knockback: executeKnockback,
  reveal: executeReveal,
  summon: executeSummon,
  transform: executeTransform,
  dig: executeDig
} as const satisfies Record<SpatialEffectVerb, EffectExecutor>;

const FLOOR_TARGETING = {
  kind: "floor",
  self: null,
  melee: null,
  bolt: null,
  burst: null,
  floor: {}
} as const satisfies TargetingShape;

const REVEAL_TARGETS: ReadonlySet<string> = new Set(
  bounds.effectVocabulary.verbs.reveal.targetKinds
);

export const registerSpatialEffectExecutors = (): (() => void) => {
  const unregisterers = Object.entries(SPATIAL_EXECUTORS).map(
    ([verb, executor]) =>
      registerEffectExecutor(verb as EffectVerbKind, executor)
  );

  return () => {
    for (let index = unregisterers.length - 1; index >= 0; index -= 1) {
      unregisterers[index]?.();
    }
  };
};

export const unregisterSpatialEffectExecutors =
  registerSpatialEffectExecutors();

function executeTeleportSelf(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.teleportSelf === null) {
    return missingPayload(state, effect, ctx);
  }

  const actor = resolveActor(state, ctx.sourceId);
  if (actor === null) {
    return invalidTarget(
      state,
      effect,
      ctx,
      "teleport_self requires an existing source actor"
    );
  }

  return teleportActor(state, effect, ctx, actor, "teleport_self");
}

function executeTeleportTarget(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.teleportTarget === null) {
    return missingPayload(state, effect, ctx);
  }

  const actor = resolveActor(state, ctx.targetId);
  if (actor === null) {
    return invalidTarget(
      state,
      effect,
      ctx,
      "teleport_target requires an existing target actor"
    );
  }

  return teleportActor(state, effect, ctx, actor, "teleport_target");
}

function executeBlink(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.blink === null) {
    return missingPayload(state, effect, ctx);
  }

  const distance = effect.blink.distanceTiles;
  const distanceBounds = bounds.effectVocabulary.verbs.blink.distanceTiles;
  if (!isSafeIntegerInBounds(distance, distanceBounds)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      `blink.distanceTiles must be ${distanceBounds.min}-${distanceBounds.max}`,
      ctx
    );
  }

  const actor = resolveActor(state, ctx.targetId ?? ctx.sourceId);
  if (actor === null) {
    return invalidTarget(
      state,
      effect,
      ctx,
      "blink requires an existing source or target actor"
    );
  }

  const grid = gridFromState(state);
  if (grid === null) {
    return invalidTarget(state, effect, ctx, "floor geometry is not loaded");
  }

  const direction = blinkDirection(state, actor, ctx);
  if (direction === null) {
    return invalidTarget(state, effect, ctx, "blink requires a direction");
  }

  const destination = lastWalkableHop(state, grid, actor, direction, distance);
  if (!inBounds(grid, destination) || !isWalkableTile(getTile(grid, destination))) {
    return invalidTarget(state, effect, ctx, "blink destination is not walkable");
  }

  return {
    state: withActorPosition(state, actor, destination),
    events: [
      effectExecutedEvent(state, "blink", withResolvedTarget(ctx, actor.id), {
        distance,
        from: serializablePosition(actor.position),
        to: serializablePosition(destination)
      })
    ]
  };
}

function executeKnockback(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.knockback === null) {
    return missingPayload(state, effect, ctx);
  }

  const { pushTiles, collisionDamage } = effect.knockback;
  const pushBounds = bounds.effectVocabulary.verbs.knockback.pushTiles;
  const damageBounds =
    bounds.effectVocabulary.verbs.knockback.collisionDamage;

  if (!isSafeIntegerInBounds(pushTiles, pushBounds)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      `knockback.pushTiles must be ${pushBounds.min}-${pushBounds.max}`,
      ctx
    );
  }

  if (!isSafeIntegerInBounds(collisionDamage, damageBounds)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      `knockback.collisionDamage must be ${damageBounds.min}-${damageBounds.max}`,
      ctx
    );
  }

  const actor = resolveActor(state, ctx.targetId);
  if (actor === null || !isCombatActor(state, actor.id)) {
    return invalidTarget(
      state,
      effect,
      ctx,
      "knockback requires an existing player or enemy target"
    );
  }

  const grid = gridFromState(state);
  if (grid === null) {
    return invalidTarget(state, effect, ctx, "floor geometry is not loaded");
  }

  const direction = knockbackDirection(state, actor, ctx);
  if (direction === null) {
    return invalidTarget(state, effect, ctx, "knockback requires a direction");
  }

  const pushed = pushActor(state, grid, actor, direction, pushTiles);
  let nextState = withActorPosition(state, actor, pushed.position);
  const events: TurnEvent[] = [
    effectExecutedEvent(state, "knockback", withResolvedTarget(ctx, actor.id), {
      pushTiles,
      collisionDamage: pushed.collided ? collisionDamage : 0,
      from: serializablePosition(actor.position),
      to: serializablePosition(pushed.position),
      collided: pushed.collided
    })
  ];

  if (pushed.collided) {
    const damaged = applyCollisionDamage(
      nextState,
      actor.id as CombatActorId,
      collisionDamage,
      ctx
    );
    nextState = damaged.state;
    events.push(...damaged.events);
  }

  return {
    state: nextState,
    events
  };
}

function executeReveal(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.reveal === null) {
    return missingPayload(state, effect, ctx);
  }

  const target = effect.reveal.target;
  if (!REVEAL_TARGETS.has(target)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      "reveal.target must be map, items, enemies, or traps",
      ctx
    );
  }

  const grid = gridFromState(state);
  if (grid === null) {
    return invalidTarget(state, effect, ctx, "floor geometry is not loaded");
  }

  const revealed = revealState(state, grid, target);

  return {
    state: revealed.state,
    events: [
      effectExecutedEvent(state, "reveal", ctx, {
        target,
        revealedCount: revealed.revealedCount
      })
    ]
  };
}

function executeSummon(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.summon === null) {
    return missingPayload(state, effect, ctx);
  }

  const { count, rosterEntityId } = effect.summon;
  const countBounds = bounds.effectVocabulary.verbs.summon.count;
  if (!isSafeIntegerInBounds(count, countBounds)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      `summon.count must be ${countBounds.min}-${countBounds.max}`,
      ctx
    );
  }

  if (!isNonEmptyString(rosterEntityId)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      "summon.rosterEntityId must be a non-empty string",
      ctx
    );
  }

  const roster = floorEnemyRoster(state);
  if (roster.length === 0) {
    return invalidTarget(state, effect, ctx, "current floor roster is empty");
  }

  const definition = roster.find((candidate) => candidate.id === rosterEntityId);
  if (definition === undefined) {
    return invalidTarget(
      state,
      effect,
      ctx,
      `summon rosterEntityId ${rosterEntityId} is not on the current floor roster`
    );
  }

  const grid = gridFromState(state);
  if (grid === null) {
    return invalidTarget(state, effect, ctx, "floor geometry is not loaded");
  }

  const anchor = summonAnchor(state, ctx);
  if (anchor === null) {
    return invalidTarget(
      state,
      effect,
      ctx,
      "summon requires an origin or source actor"
    );
  }

  const cells = ctx.rng.shuffle(adjacentOpenCells(state, grid, anchor));
  if (cells.length < count) {
    return invalidTarget(
      state,
      effect,
      ctx,
      `summon requires ${count} adjacent open cells`
    );
  }

  let entityCounters = state.ids.entityCounters;
  const spawnedIds: EntityId[] = [];
  const entities = { ...state.entities };

  for (let index = 0; index < count; index += 1) {
    const allocation = allocateEntityId(entityCounters, "enemy");
    entityCounters = allocation.entityCounters;
    spawnedIds.push(allocation.id);
    entities[allocation.id] = enemyInstance(
      allocation.id,
      stripBudgetCost(definition),
      cells[index] as Position
    );
  }

  return {
    state: {
      ...state,
      entities,
      ids: {
        ...state.ids,
        entityCounters
      }
    },
    events: [
      effectExecutedEvent(state, "summon", ctx, {
        rosterEntityId,
        count,
        spawnedIds
      })
    ]
  };
}

function executeTransform(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.transform === null) {
    return missingPayload(state, effect, ctx);
  }

  const { rosterEntityId } = effect.transform;
  if (!isNonEmptyString(rosterEntityId)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      "transform.rosterEntityId must be a non-empty string",
      ctx
    );
  }

  const actor = resolveActor(state, ctx.targetId);
  if (actor?.entity?.kind !== "enemy") {
    return invalidTarget(
      state,
      effect,
      ctx,
      "transform requires an existing enemy target"
    );
  }

  const roster = floorEnemyRoster(state);
  if (roster.length === 0) {
    return invalidTarget(state, effect, ctx, "current floor roster is empty");
  }

  const nextDefinition = roster.find(
    (candidate) => candidate.id === rosterEntityId
  );
  if (nextDefinition === undefined) {
    return invalidTarget(
      state,
      effect,
      ctx,
      `transform rosterEntityId ${rosterEntityId} is not on the current floor roster`
    );
  }

  const currentCost = costOf(actor.entity.definition);
  const nextCost = costOf(nextDefinition);

  if (nextCost > currentCost) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      "transform roster entity cost must be less than or equal to target cost",
      ctx
    );
  }

  const transformed: EnemyEntityInstance = {
    ...actor.entity,
    definition: stripBudgetCost(nextDefinition),
    currentHP: nextDefinition.stats.hp,
    statuses: [],
    behaviorRuntime: {}
  };

  return {
    state: {
      ...state,
      entities: {
        ...state.entities,
        [actor.entity.id]: transformed
      }
    },
    events: [
      effectExecutedEvent(
        state,
        "transform",
        withResolvedTarget(ctx, actor.entity.id),
        {
          rosterEntityId,
          fromDefinitionId: actor.entity.definition.id,
          toDefinitionId: nextDefinition.id,
          currentCost,
          nextCost
        }
      )
    ]
  };
}

function executeDig(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.dig === null) {
    return missingPayload(state, effect, ctx);
  }

  const length = effect.dig.lengthTiles;
  const lengthBounds = bounds.effectVocabulary.verbs.dig.lengthTiles;
  if (!isSafeIntegerInBounds(length, lengthBounds)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      `dig.lengthTiles must be ${lengthBounds.min}-${lengthBounds.max}`,
      ctx
    );
  }

  const grid = gridFromState(state);
  if (grid === null) {
    return invalidTarget(state, effect, ctx, "floor geometry is not loaded");
  }

  const source = resolveActor(state, ctx.sourceId);
  const direction = digDirection(state, source, ctx);
  const origin = source?.position ?? ctx.origin;
  if (direction === null || origin === null) {
    return invalidTarget(state, effect, ctx, "dig requires a direction");
  }

  let nextGrid = grid;
  const dugCells: Position[] = [];

  for (const cell of digLine(origin, direction, length)) {
    if (!inBounds(nextGrid, cell) || isOuterBoundary(nextGrid, cell)) {
      break;
    }

    if (getTile(nextGrid, cell).terrain === Terrain.Wall) {
      nextGrid = withTile(nextGrid, cell, { terrain: Terrain.Floor, door: null });
      dugCells.push(cell);
    }
  }

  const nextState = withFloorGrid(state, nextGrid);

  return {
    state: nextState,
    events: [
      effectExecutedEvent(state, "dig", ctx, {
        length,
        dugCells: dugCells.map(serializablePosition)
      })
    ]
  };
}

function teleportActor(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext,
  actor: SpatialActor,
  verb: "teleport_self" | "teleport_target"
): EffectExecutorResult {
  const grid = gridFromState(state);
  if (grid === null) {
    return invalidTarget(state, effect, ctx, "floor geometry is not loaded");
  }

  const cells = walkableOpenCells(state, grid, actor.id);
  if (cells.length === 0) {
    return invalidTarget(
      state,
      effect,
      ctx,
      "teleport requires at least one open walkable cell"
    );
  }

  const destination = ctx.rng.pick(cells);
  if (
    !inBounds(grid, destination) ||
    !isWalkableTile(getTile(grid, destination)) ||
    isOccupied(state, destination, actor.id)
  ) {
    return invalidTarget(state, effect, ctx, "teleport destination is illegal");
  }

  return {
    state: withActorPosition(state, actor, destination),
    events: [
      effectExecutedEvent(state, verb, withResolvedTarget(ctx, actor.id), {
        from: serializablePosition(actor.position),
        to: serializablePosition(destination)
      })
    ]
  };
}

const walkableOpenCells = (
  state: GameState,
  grid: TileGrid,
  actorId: EffectActorId
): readonly Position[] => {
  const origin = resolveActor(state, actorId)?.position ?? { x: 0, y: 0 };
  return resolveTargetingGeometry(state, origin, FLOOR_TARGETING, {
    originActorId: actorId
  }).cells.filter(
    (cell) =>
      inBounds(grid, cell) &&
      isWalkableTile(getTile(grid, cell)) &&
      !isOccupied(state, cell, actorId)
  );
};

const adjacentOpenCells = (
  state: GameState,
  grid: TileGrid,
  origin: Position
): readonly Position[] =>
  neighbors8(grid, origin).filter(
    (cell) => isWalkableTile(getTile(grid, cell)) && !isOccupied(state, cell)
  );

const lastWalkableHop = (
  state: GameState,
  grid: TileGrid,
  actor: SpatialActor,
  direction: Direction,
  distance: number
): Position => {
  let destination = actor.position;

  for (let step = 1; step <= distance; step += 1) {
    const next = addDirection(destination, direction);
    if (
      !inBounds(grid, next) ||
      !isWalkableTile(getTile(grid, next)) ||
      isOccupied(state, next, actor.id)
    ) {
      break;
    }

    destination = next;
  }

  return destination;
};

const pushActor = (
  state: GameState,
  grid: TileGrid,
  actor: SpatialActor,
  direction: Direction,
  pushTiles: number
): {
  readonly position: Position;
  readonly collided: boolean;
} => {
  let position = actor.position;

  for (let step = 1; step <= pushTiles; step += 1) {
    const next = addDirection(position, direction);
    if (
      !inBounds(grid, next) ||
      !isWalkableTile(getTile(grid, next)) ||
      isOccupied(state, next, actor.id)
    ) {
      return {
        position,
        collided: true
      };
    }

    position = next;
  }

  return {
    position,
    collided: false
  };
};

const revealState = (
  state: GameState,
  grid: TileGrid,
  target: string
): {
  readonly state: GameState;
  readonly revealedCount: number;
} => {
  if (target === "map") {
    const visible = new Set(
      grid.tiles.map((_tile, index) => index)
    );
    const fog = updateFogMemory(
      existingFogMemory(state, grid),
      grid,
      visible
    );

    return {
      state: withFloorMetadata(state, {
        fog,
        knowledge: {
          ...floorKnowledge(state),
          mapRevealed: true
        }
      }),
      revealedCount: visible.size
    };
  }

  const kind = entityKindForRevealTarget(target);
  const ids = sortedEntities(state)
    .filter((entity) => entity.kind === kind)
    .map((entity) => entity.id);

  return {
    state: withRevealedEntities(state, target, ids),
    revealedCount: ids.length
  };
};

const withRevealedEntities = (
  state: GameState,
  target: string,
  ids: readonly EntityId[]
): GameState => {
  const idSet = new Set(ids);
  const entities = Object.fromEntries(
    Object.entries(state.entities).map(([id, entity]) => {
      if (!idSet.has(id as EntityId)) {
        return [id, entity];
      }

      return [
        id,
        {
          ...entity,
          behaviorRuntime: {
            ...entity.behaviorRuntime,
            revealed: true
          }
        } satisfies EntityInstance
      ];
    })
  );
  const knowledge = floorKnowledge(state);

  return withFloorMetadata(
    {
      ...state,
      entities
    },
    {
      knowledge: {
        ...knowledge,
        revealedItemIds:
          target === "items" ? mergeIds(knowledge.revealedItemIds, ids) : knowledge.revealedItemIds,
        revealedEnemyIds:
          target === "enemies" ? mergeIds(knowledge.revealedEnemyIds, ids) : knowledge.revealedEnemyIds,
        revealedTrapIds:
          target === "traps" ? mergeIds(knowledge.revealedTrapIds, ids) : knowledge.revealedTrapIds
      }
    }
  );
};

const floorEnemyRoster = (state: GameState): readonly EnemyDefinition[] => {
  const opaqueRoster = enemyRosterFromOpaque(state.floor.geometry.opaque);
  const liveRoster = sortedEntities(state)
    .filter((entity): entity is EnemyEntityInstance => entity.kind === "enemy")
    .map((entity) => entity.definition);
  const byId = new Map<string, EnemyDefinition>();

  for (const definition of liveRoster) {
    if (!byId.has(definition.id)) {
      byId.set(definition.id, definition);
    }
  }

  for (const definition of opaqueRoster) {
    byId.set(definition.id, definition);
  }

  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
};

const enemyRosterFromOpaque = (
  opaque: SerializableRecord | null
): readonly EnemyDefinition[] => {
  if (!isRecord(opaque)) {
    return [];
  }

  const runtime = opaque as unknown as FloorRuntimeOpaque;
  if (Array.isArray(runtime.enemyRoster)) {
    return runtime.enemyRoster.filter(isEnemyDefinition);
  }

  const roster = runtime.roster;
  if (Array.isArray(roster)) {
    return roster.filter(isEnemyDefinition);
  }

  if (isRecord(roster) && Array.isArray(roster.enemies)) {
    return roster.enemies.filter(isEnemyDefinition);
  }

  return [];
};

const enemyInstance = (
  id: EntityId,
  definition: EnemyDefinition,
  position: Position
): EnemyEntityInstance => ({
  id,
  kind: "enemy",
  definition,
  position,
  currentHP: definition.stats.hp,
  statuses: [],
  behaviorRuntime: {}
});

const existingFogMemory = (state: GameState, grid: TileGrid): FogMemory => {
  const fog = (state.floor.geometry.opaque as unknown as FloorRuntimeOpaque | null)
    ?.fog;

  return isFogMemory(fog, grid) ? fog : createFogMemory(grid, "player");
};

const floorKnowledge = (state: GameState): FloorKnowledge =>
  (state.floor.geometry.opaque as unknown as FloorRuntimeOpaque | null)
    ?.knowledge ?? {};

const withFloorMetadata = (
  state: GameState,
  metadata: {
    readonly fog?: FogMemory;
    readonly knowledge?: FloorKnowledge;
  }
): GameState => {
  const grid = gridFromState(state);
  if (grid === null) {
    return state;
  }

  return withFloorOpaque(state, {
    ...opaqueMetadata(state.floor.geometry.opaque),
    ...grid,
    ...metadata
  });
};

const withFloorGrid = (state: GameState, grid: TileGrid): GameState =>
  withFloorOpaque(state, {
    ...opaqueMetadata(state.floor.geometry.opaque),
    ...grid
  });

const withFloorOpaque = (
  state: GameState,
  opaque: SerializableRecord
): GameState => ({
  ...state,
  floor: {
    ...state.floor,
    geometry: {
      ...state.floor.geometry,
      opaque
    }
  }
});

const opaqueMetadata = (
  opaque: SerializableRecord | null
): SerializableRecord => {
  if (!isRecord(opaque)) {
    return {};
  }

  const metadata = { ...opaque };
  delete metadata.kind;
  delete metadata.width;
  delete metadata.height;
  delete metadata.tiles;

  return metadata;
};

const withActorPosition = (
  state: GameState,
  actor: SpatialActor,
  position: Position
): GameState => {
  if (actor.id === "player") {
    return {
      ...state,
      player: {
        ...state.player,
        position
      }
    };
  }

  if (actor.entity === null) {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [actor.id]: {
        ...actor.entity,
        position
      } satisfies EntityInstance
    }
  };
};

const applyCollisionDamage = (
  state: GameState,
  targetId: CombatActorId,
  amount: number,
  ctx: EffectExecutionContext
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  const hp = actorHp(state, targetId);
  if (hp === null) {
    return { state, events: [] };
  }

  const hpAfter = Math.max(0, hp.current - amount);
  const damagedState = withCombatActorHp(state, targetId, hpAfter);
  if (hpAfter > 0) {
    return { state: damagedState, events: [] };
  }

  return applyDeath(damagedState, targetId, {
    attribution: deathAttributionFor(ctx.sourceId)
  });
};

const withCombatActorHp = (
  state: GameState,
  targetId: CombatActorId,
  hp: number
): GameState => {
  if (targetId === "player") {
    return {
      ...state,
      player: {
        ...state.player,
        hp: {
          ...state.player.hp,
          current: hp
        }
      }
    };
  }

  const entity = state.entities[targetId];
  if (entity?.kind !== "enemy") {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [targetId]: {
        ...entity,
        currentHP: hp
      }
    }
  };
};

const actorHp = (
  state: GameState,
  targetId: CombatActorId
): { readonly current: number; readonly max: number } | null => {
  if (targetId === "player") {
    return state.player.hp;
  }

  const entity = state.entities[targetId];
  if (entity?.kind !== "enemy") {
    return null;
  }

  return {
    current: entity.currentHP,
    max: entity.definition.stats.hp
  };
};

const resolveActor = (
  state: GameState,
  actorId: EffectActorId | null
): SpatialActor | null => {
  if (actorId === null) {
    return null;
  }

  if (actorId === "player") {
    return {
      id: "player",
      position: state.player.position,
      entity: null
    };
  }

  const entity = state.entities[actorId];
  if (entity === undefined) {
    return null;
  }

  return {
    id: entity.id,
    position: entity.position,
    entity
  };
};

const isCombatActor = (state: GameState, actorId: EffectActorId): boolean =>
  actorId === "player" || state.entities[actorId]?.kind === "enemy";

const isOccupied = (
  state: GameState,
  position: Position,
  exceptActorId?: EffectActorId
): boolean => {
  if (exceptActorId !== "player" && samePosition(state.player.position, position)) {
    return true;
  }

  return sortedEntities(state).some(
    (entity) =>
      entity.id !== exceptActorId && samePosition(entity.position, position)
  );
};

const sortedEntities = (state: GameState): readonly EntityInstance[] =>
  Object.values(state.entities).sort((left, right) =>
    left.id.localeCompare(right.id)
  );

const blinkDirection = (
  state: GameState,
  actor: SpatialActor,
  ctx: EffectExecutionContext
): Direction | null => {
  if (ctx.origin !== null && !samePosition(ctx.origin, actor.position)) {
    return directionBetween(actor.position, ctx.origin);
  }

  const source = resolveActor(state, ctx.sourceId);
  if (source !== null && !samePosition(source.position, actor.position)) {
    return directionBetween(source.position, actor.position);
  }

  return null;
};

const knockbackDirection = (
  state: GameState,
  actor: SpatialActor,
  ctx: EffectExecutionContext
): Direction | null => {
  const origin = ctx.origin ?? resolveActor(state, ctx.sourceId)?.position;
  if (origin === undefined || samePosition(origin, actor.position)) {
    return null;
  }

  return directionBetween(origin, actor.position);
};

const digDirection = (
  state: GameState,
  source: SpatialActor | null,
  ctx: EffectExecutionContext
): Direction | null => {
  if (
    source !== null &&
    ctx.origin !== null &&
    !samePosition(source.position, ctx.origin)
  ) {
    return directionBetween(source.position, ctx.origin);
  }

  const target = resolveActor(state, ctx.targetId);
  if (
    source !== null &&
    target !== null &&
    !samePosition(source.position, target.position)
  ) {
    return directionBetween(source.position, target.position);
  }

  return null;
};

const directionBetween = (from: Position, to: Position): Direction | null => {
  const direction = {
    x: signDirection(to.x - from.x),
    y: signDirection(to.y - from.y)
  };

  return direction.x === 0 && direction.y === 0 ? null : direction;
};

const signDirection = (value: number): -1 | 0 | 1 => {
  if (value < 0) {
    return -1;
  }

  if (value > 0) {
    return 1;
  }

  return 0;
};

const addDirection = (position: Position, direction: Direction): Position => ({
  x: position.x + direction.x,
  y: position.y + direction.y
});

const digLine = (
  origin: Position,
  direction: Direction,
  length: number
): readonly Position[] => {
  const end = {
    x: origin.x + direction.x * length,
    y: origin.y + direction.y * length
  };

  return line(origin, end).slice(1, length + 1);
};

const isOuterBoundary = (grid: TileGrid, position: Position): boolean =>
  position.x === 0 ||
  position.y === 0 ||
  position.x === grid.width - 1 ||
  position.y === grid.height - 1;

const summonAnchor = (
  state: GameState,
  ctx: EffectExecutionContext
): Position | null =>
  ctx.origin ?? resolveActor(state, ctx.sourceId)?.position ?? null;

const entityKindForRevealTarget = (
  target: string
): EntityInstance["kind"] => {
  switch (target) {
    case "items":
      return "item";
    case "enemies":
      return "enemy";
    case "traps":
      return "trap";
    default:
      throw new RangeError(`unsupported reveal target ${target}`);
  }
};

const mergeIds = (
  existing: readonly EntityId[] | undefined,
  next: readonly EntityId[]
): readonly EntityId[] =>
  [...new Set([...(existing ?? []), ...next])].sort((left, right) =>
    left.localeCompare(right)
  );

const stripBudgetCost = (definition: EnemyDefinition): EnemyDefinition => {
  const schemaDefinition = { ...definition } as Record<string, unknown>;
  delete schemaDefinition.cost;
  delete schemaDefinition.budgetCost;

  return schemaDefinition as EnemyDefinition;
};

const deathAttributionFor = (
  sourceId: EffectActorId | null
): DeathAttribution => {
  if (sourceId === null) {
    return { kind: "none" };
  }

  return {
    kind: "killer",
    killerId: sourceId as CombatActorId
  };
};

const missingPayload = (
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult =>
  rejectEffect(
    state,
    effect,
    "missing_payload",
    `${effect.kind} payload is missing`,
    ctx
  );

const invalidTarget = (
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext,
  message: string
): EffectExecutorResult =>
  rejectEffect(state, effect, "invalid_target", message, ctx);

const withResolvedTarget = (
  ctx: EffectExecutionContext,
  targetId: EffectActorId
): EffectExecutionContext => ({
  ...ctx,
  targetId
});

const isSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const isSafeIntegerInBounds = (
  value: unknown,
  range: { readonly min: number; readonly max: number }
): value is number =>
  isSafeInteger(value) && value >= range.min && value <= range.max;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;

const serializablePosition = (position: Position): SerializableRecord => ({
  x: position.x,
  y: position.y
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isEnemyDefinition = (value: unknown): value is EnemyDefinition => {
  const candidate = value as Partial<EnemyDefinition> | null;

  return (
    candidate !== null &&
    typeof candidate === "object" &&
    typeof candidate.id === "string" &&
    candidate.stats !== undefined &&
    Array.isArray(candidate.behaviors) &&
    Array.isArray(candidate.abilities)
  );
};

const isFogMemory = (value: unknown, grid: TileGrid): value is FogMemory => {
  const candidate = value as Partial<FogMemory> | null;

  return (
    candidate !== null &&
    typeof candidate === "object" &&
    candidate.width === grid.width &&
    candidate.height === grid.height &&
    Array.isArray(candidate.tiles) &&
    candidate.tiles.length === grid.tiles.length
  );
};
