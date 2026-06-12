import { bounds, config } from "../../config/index.js";
import type { DepthBand, TrapDefinition } from "../../schemas/entities/index.js";
import type {
  Effect,
  EffectBundle,
  StatusApplication,
} from "../../schemas/vocab/index.js";
import type {} from "../events.js";
import { getTile, type TileGrid } from "../map/index.js";
import { Terrain } from "../map/terrain.js";
import { createRng, type Rng } from "../rng/index.js";
import {
  type EntityId,
  type EntityInstance,
  type GameState,
  type Position,
  type RngStreamCursor,
  type SerializableRecord,
  type TrapEntityInstance,
} from "../state/index.js";
import { derivePlayerBaseStats } from "./player.js";
import type { EffectActorId } from "../effects/registry.js";
import { resolveTargetingGeometry } from "../effects/geometry.js";
import {
  executeBundle,
  type EffectExecutionContext,
} from "../effects/registry.js";
import {
  type ActionResolverResult,
  gridFromState,
  type TurnEvent,
} from "../turn/index.js";

export type PlacementLethalityResult = {
  readonly ok: boolean;
  readonly worstCaseDamage: number;
  readonly bandFullHp: number;
  readonly bandTypicalLevel: number;
};

export type TrapMovementProcessResult = {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
};

type FloorKnowledge = {
  readonly mapRevealed?: boolean;
  readonly revealedItemIds?: readonly EntityId[];
  readonly revealedEnemyIds?: readonly EntityId[];
  readonly revealedTrapIds?: readonly EntityId[];
  readonly decorativeFeatures?: readonly SerializableRecord[];
};

type FloorRuntimeOpaque = TileGrid & {
  readonly knowledge?: FloorKnowledge;
};

type MutableRngContext = {
  readonly rng: Rng;
  readonly initialDraws: number;
  drawsUsed: number;
};

const TRAPS_RNG_STREAM_ID = "traps";
const ROOT_RNG_STREAM_ID = "root";
const UINT32_SIZE = 0x1_0000_0000;

const BAND_ORDER: readonly DepthBand[] = ["shallows", "middle", "lowest"];

const ADJACENCY_REVEAL_CHANCE_PERCENT = Math.floor(
  (bounds.effectVocabulary.triggers.procChancePercent.onHit.min +
    bounds.effectVocabulary.triggers.procChancePercent.onHit.max) /
    2,
);

/**
 * Band-typical player level at band entry for placement lethality (GAME_DESIGN §4, §10).
 *
 * Derivation:
 * - Start at config.playerCharacter.stats.level.start (1).
 * - Each prior depth band contributes ceil(floorsInBand / 3) levels (GAME_DESIGN §4:
 *   ~3–4 kills per level across band floors).
 * - Floors per band come from config.runStructure.depthBands.
 */
export const bandTypicalLevelAtEntry = (band: DepthBand): number => {
  let level: number = config.playerCharacter.stats.level.start;

  for (const entry of BAND_ORDER) {
    if (entry === band) {
      break;
    }

    const range = config.runStructure.depthBands[entry];
    const floorsInBand = range.maxFloor - range.minFloor + 1;
    level = Math.min(
      bounds.playerCharacter.levelCap,
      level + Math.ceil(floorsInBand / 3),
    );
  }

  return level;
};

export const bandTypicalFullHp = (band: DepthBand): number =>
  derivePlayerBaseStats(bandTypicalLevelAtEntry(band)).maxHp;

export const worstCaseBundleDamage = (bundle: EffectBundle): number => {
  let total = 0;

  for (const effect of bundle.effects) {
    total += worstCaseEffectDamage(effect);
  }

  return total;
};

export const placementLethalityCheck = (
  trapDef: TrapDefinition,
  band: DepthBand,
): PlacementLethalityResult => {
  const worstCaseDamage = worstCaseBundleDamage(trapDef.effectBundle);
  const bandTypicalLevel = bandTypicalLevelAtEntry(band);
  const bandFullHp = derivePlayerBaseStats(bandTypicalLevel).maxHp;

  return {
    ok:
      bounds.trapsNpcsQuests.traps.lethalFromFullHpAllowed ||
      worstCaseDamage < bandFullHp,
    worstCaseDamage,
    bandFullHp,
    bandTypicalLevel,
  };
};

export const countTrapEntities = (state: GameState): number =>
  Object.values(state.entities).filter((entity) => entity.kind === "trap")
    .length;

export const isTrapRevealed = (
  state: GameState,
  trapId: EntityId,
  behaviorRuntime: { readonly [key: string]: unknown },
): boolean => {
  if (behaviorRuntime.revealed === true) {
    return true;
  }

  return floorKnowledge(state).revealedTrapIds?.includes(trapId) ?? false;
};

export const trapAtPosition = (
  state: GameState,
  position: Position,
): TrapEntityInstance | null => {
  for (const entity of sortedTraps(state)) {
    if (
      entity.position.x === position.x &&
      entity.position.y === position.y
    ) {
      return entity;
    }
  }

  return null;
};

export const revealTrap = (
  state: GameState,
  trapId: EntityId,
): TrapMovementProcessResult => {
  const trap = state.entities[trapId];

  if (trap?.kind !== "trap" || isTrapRevealed(state, trapId, trap.behaviorRuntime)) {
    return { state, events: [] };
  }

  return {
    state: withTrapRevealed(state, [trapId]),
    events: [],
  };
};

export const revealAllTraps = (state: GameState): TrapMovementProcessResult => {
  const trapIds = sortedTraps(state).map((trap) => trap.id);

  if (trapIds.length === 0) {
    return { state, events: [] };
  }

  const hiddenIds = trapIds.filter((trapId) => {
    const trap = state.entities[trapId];
    return (
      trap?.kind === "trap" &&
      !isTrapRevealed(state, trapId, trap.behaviorRuntime)
    );
  });

  if (hiddenIds.length === 0) {
    return { state, events: [] };
  }

  return {
    state: withTrapRevealed(state, hiddenIds),
    events: [],
  };
};

export const revealAdjacentTraps = (
  state: GameState,
  observerPosition: Position = state.player.position,
): TrapMovementProcessResult => {
  const adjacentTraps = sortedTraps(state).filter((trap) => {
    if (!trap.armed || isTrapRevealed(state, trap.id, trap.behaviorRuntime)) {
      return false;
    }

    return isAdjacent(observerPosition, trap.position);
  });

  if (adjacentTraps.length === 0) {
    return { state, events: [] };
  }

  let nextState = state;
  const events: TurnEvent[] = [];
  const rngContext = trapsRngContextFor(nextState);

  for (const trap of adjacentTraps) {
    const roll = rollInt(rngContext, 1, 100);
    if (roll > ADJACENCY_REVEAL_CHANCE_PERCENT) {
      continue;
    }

    const revealed = revealTrap(nextState, trap.id);
    nextState = revealed.state;
    events.push(...revealed.events);
  }

  return {
    state: withTrapsRngCursor(nextState, rngContext),
    events,
  };
};

export const triggerTrapOnStep = (
  state: GameState,
  trapId: EntityId,
  actorId: EffectActorId,
): ActionResolverResult => {
  const trap = state.entities[trapId];

  if (trap?.kind !== "trap" || !trap.armed) {
    return { state, events: [] };
  }

  let nextState = state;
  const events: TurnEvent[] = [];

  if (!isTrapRevealed(state, trapId, trap.behaviorRuntime)) {
    const revealed = revealTrap(nextState, trapId);
    nextState = revealed.state;
    events.push(...revealed.events);
  }

  const triggered = executeTrapStepBundle(nextState, trap, actorId);
  if ("illegal" in triggered) {
    return triggered;
  }

  nextState = withTrapDisarmed(triggered.state, trapId);
  events.push(...triggered.events);

  return { state: nextState, events };
};

export const cureBurnFromWaterEntry = (
  state: GameState,
  actorId: EffectActorId,
  position: Position,
): TrapMovementProcessResult => {
  const grid = gridFromState(state);
  if (grid === null || !isWaterTile(grid, position)) {
    return { state, events: [] };
  }

  const statuses = statusesForActor(state, actorId);
  if (!statuses.some((entry) => entry.status === "burn")) {
    return { state, events: [] };
  }

  const nextStatuses = statuses.filter((entry) => entry.status !== "burn");

  return {
    state: withActorStatuses(state, actorId, nextStatuses),
    events: [statusExpiredEvent(state, actorId, "burn")],
  };
};

export const processTrapMovementEvents = (
  state: GameState,
  events: readonly TurnEvent[],
): TrapMovementProcessResult => {
  let nextState = state;
  const produced: TurnEvent[] = [];

  for (const event of events) {
    if (event.type === "moved") {
      const stepped = handleActorEnteredCell(
        nextState,
        "player",
        event.data.to,
      );
      nextState = stepped.state;
      produced.push(...stepped.events);
      continue;
    }

    if (event.type === "enemy_moved") {
      const stepped = handleActorEnteredCell(
        nextState,
        event.data.actorId,
        event.data.to,
      );
      nextState = stepped.state;
      produced.push(...stepped.events);
    }
  }

  return { state: nextState, events: produced };
};

export const processTrapTurnEnd = (
  state: GameState,
): TrapMovementProcessResult => revealAdjacentTraps(state);

export const passThroughDecorativeFeatures = (
  state: GameState,
): readonly SerializableRecord[] =>
  floorKnowledge(state).decorativeFeatures ?? [];

const executeTrapStepBundle = (
  state: GameState,
  trap: TrapEntityInstance,
  actorId: EffectActorId,
): ActionResolverResult => {
  const bundle = trap.definition.effectBundle;

  if (bundle.trigger.kind !== "step") {
    return {
      illegal: true,
      reason: `trap ${trap.id} does not have a step trigger`,
    };
  }

  const actorCell = actorPosition(state, actorId) ?? trap.position;
  const geometry = resolveTargetingGeometry(
    state,
    trap.position,
    bundle.targeting,
    {
      originActorId: actorId,
      targetCell: actorCell,
    },
  );
  const targetIds = targetIdsForTrapBundle(bundle, geometry.entityIds, actorId);
  const events: TurnEvent[] = [
    trapStepTriggeredEvent(state, trap.id, trap.definition.id, actorId),
  ];
  let nextState = state;

  if (targetIds.length === 0 && bundle.targeting.kind !== "floor") {
    return { state: nextState, events };
  }

  const executionTargets = targetIds.length === 0 ? [null] : targetIds;
  const rngContext = trapsRngContextFor(nextState);

  for (const targetId of executionTargets) {
    const ctx: EffectExecutionContext = {
      sourceId: trap.id,
      targetId,
      origin: trap.position,
      rng: rngContext.rng,
    };
    const result = executeBundle(nextState, bundle, ctx);
    nextState = result.state;
    events.push(...result.events);
  }

  return {
    state: withTrapsRngCursor(nextState, rngContext),
    events,
  };
};

const targetIdsForTrapBundle = (
  bundle: EffectBundle,
  entityIds: readonly EffectActorId[],
  actorId: EffectActorId,
): readonly EffectActorId[] => {
  if (bundle.targeting.kind === "self") {
    return [actorId];
  }

  return entityIds;
};

const actorPosition = (
  state: GameState,
  actorId: EffectActorId,
): Position | null => {
  if (actorId === "player") {
    return state.player.position;
  }

  return state.entities[actorId]?.position ?? null;
};

const trapStepTriggeredEvent = (
  state: GameState,
  trapId: EntityId,
  definitionId: string,
  actorId: EffectActorId,
): Extract<TurnEvent, { readonly type: "trap_step_triggered" }> => ({
  turn: state.run.turn,
  type: "trap_step_triggered",
  data: {
    trapId,
    definitionId,
    actorId,
  },
});

const handleActorEnteredCell = (
  state: GameState,
  actorId: EffectActorId,
  position: Position,
): TrapMovementProcessResult => {
  let nextState = state;
  const events: TurnEvent[] = [];

  const trap = trapAtPosition(nextState, position);
  if (trap !== null) {
    const triggered = triggerTrapOnStep(nextState, trap.id, actorId);
    if ("illegal" in triggered) {
      return { state, events: [] };
    }

    nextState = triggered.state;
    events.push(...triggered.events);
  }

  const cured = cureBurnFromWaterEntry(nextState, actorId, position);
  nextState = cured.state;
  events.push(...cured.events);

  return { state: nextState, events };
};

const worstCaseEffectDamage = (effect: Effect): number => {
  switch (effect.kind) {
    case "damage":
      return effect.damage?.amount ?? 0;
    case "knockback":
      return effect.knockback?.collisionDamage ?? 0;
    case "apply_status": {
      const status = effect.applyStatus?.status;
      const duration = effect.applyStatus?.duration ?? 0;

      if (status === "burn") {
        return duration * Math.abs(config.statusMagnitudes.burnHpPerTurn);
      }

      if (status === "poison") {
        return 0;
      }

      return 0;
    }
    default:
      return 0;
  }
};

const isAdjacent = (left: Position, right: Position): boolean =>
  Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) === 1;

const sortedTraps = (state: GameState): readonly TrapEntityInstance[] =>
  Object.values(state.entities)
    .filter((entity): entity is TrapEntityInstance => entity.kind === "trap")
    .sort((left, right) => left.id.localeCompare(right.id));

const isWaterTile = (grid: TileGrid, position: Position): boolean =>
  getTile(grid, position).terrain === Terrain.Water;

const floorKnowledge = (state: GameState): FloorKnowledge =>
  (state.floor.geometry.opaque as FloorRuntimeOpaque | null)?.knowledge ?? {};

const withTrapRevealed = (
  state: GameState,
  trapIds: readonly EntityId[],
): GameState => {
  const idSet = new Set(trapIds);
  const entities = Object.fromEntries(
    Object.entries(state.entities).map(([id, entity]) => {
      if (!idSet.has(id as EntityId) || entity.kind !== "trap") {
        return [id, entity];
      }

      return [
        id,
        {
          ...entity,
          behaviorRuntime: {
            ...entity.behaviorRuntime,
            revealed: true,
          },
        } satisfies EntityInstance,
      ];
    }),
  );
  const knowledge = floorKnowledge(state);

  return withFloorMetadata(
    {
      ...state,
      entities,
    },
    {
      knowledge: {
        ...knowledge,
        revealedTrapIds: mergeIds(knowledge.revealedTrapIds, trapIds),
      },
    },
  );
};

const withTrapDisarmed = (state: GameState, trapId: EntityId): GameState => {
  const trap = state.entities[trapId];
  if (trap?.kind !== "trap") {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [trapId]: {
        ...trap,
        armed: false,
      },
    },
  };
};

const withFloorMetadata = (
  state: GameState,
  metadata: {
    readonly knowledge?: FloorKnowledge;
  },
): GameState => {
  const grid = gridFromState(state);
  if (grid === null) {
    return state;
  }

  const opaque = state.floor.geometry.opaque;
  const existing =
    opaque !== null && typeof opaque === "object"
      ? (opaque as SerializableRecord)
      : {};

  return {
    ...state,
    floor: {
      ...state.floor,
      geometry: {
        ...state.floor.geometry,
        opaque: {
          ...existing,
          ...grid,
          ...metadata,
        } as SerializableRecord,
      },
    },
  };
};

const mergeIds = (
  existing: readonly EntityId[] | undefined,
  ids: readonly EntityId[],
): EntityId[] => [...new Set([...(existing ?? []), ...ids])].sort();

const statusesForActor = (
  state: GameState,
  actorId: EffectActorId,
): readonly StatusApplication[] => {
  if (actorId === "player") {
    return state.player.statuses;
  }

  return state.entities[actorId]?.statuses ?? [];
};

const withActorStatuses = (
  state: GameState,
  actorId: EffectActorId,
  statuses: readonly StatusApplication[],
): GameState => {
  if (actorId === "player") {
    return {
      ...state,
      player: {
        ...state.player,
        statuses: [...statuses],
      },
    };
  }

  const entity = state.entities[actorId];
  if (entity === undefined) {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [actorId]: {
        ...entity,
        statuses: [...statuses],
      },
    },
  };
};

const trapsRngContextFor = (state: GameState): MutableRngContext => {
  const previousDraws = state.rng.streams[TRAPS_RNG_STREAM_ID]?.draws ?? 0;
  const trapsRng = createRng(state.rng.rootSeed).fork(TRAPS_RNG_STREAM_ID);

  for (let index = 0; index < previousDraws; index += 1) {
    trapsRng.nextUint32();
  }

  return {
    rng: trapsRng,
    initialDraws: previousDraws,
    drawsUsed: 0,
  };
};

const withTrapsRngCursor = (
  state: GameState,
  context: MutableRngContext,
): GameState => {
  const existing = state.rng.streams[TRAPS_RNG_STREAM_ID];
  const cursor: RngStreamCursor = {
    streamId: TRAPS_RNG_STREAM_ID,
    seed: existing?.seed ?? state.rng.rootSeed,
    parentStreamId: existing?.parentStreamId ?? ROOT_RNG_STREAM_ID,
    draws: context.initialDraws + context.drawsUsed,
  };

  return {
    ...state,
    rng: {
      ...state.rng,
      streams: {
        ...state.rng.streams,
        [TRAPS_RNG_STREAM_ID]: cursor,
      },
    },
  };
};

const rollInt = (
  context: MutableRngContext,
  min: number,
  max: number,
): number => {
  const range = max - min + 1;
  const limit = UINT32_SIZE - (UINT32_SIZE % range);
  let value = drawUint32(context);

  while (value >= limit) {
    value = drawUint32(context);
  }

  return min + (value % range);
};

const drawUint32 = (context: MutableRngContext): number => {
  context.drawsUsed += 1;
  return context.rng.nextUint32();
};

const statusExpiredEvent = (
  state: GameState,
  entityId: EffectActorId,
  status: StatusApplication["status"],
): Extract<TurnEvent, { readonly type: "status_expired" }> => ({
  turn: state.run.turn,
  type: "status_expired",
  data: {
    entityId,
    status,
  },
});
