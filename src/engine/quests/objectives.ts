import type { QuestDefinition } from "../../schemas/entities/index.js";
import {
  getTile,
  inBounds,
  isWalkableTile,
  Terrain,
  type TileGrid,
} from "../map/index.js";
import { path } from "../map/path.js";
import { registerLootDropHook, type LootDropContext } from "../systems/combat.js";
import { removeFromInventory } from "../systems/inventory.js";
import type {
  EntityId,
  GameState,
  NpcEntityInstance,
  Position,
  QuestRuntime,
  SerializableRecord,
} from "../state/index.js";
import {
  destinationForMove,
  gridFromState,
  MOVE_DIRECTIONS,
  type ActorTurnHook,
  type MoveDirection,
  type TurnEvent,
  type TurnHookResult,
  type TurnHooks,
} from "../turn/index.js";
import { completeQuest, failQuest } from "./machine.js";
import type { QuestItemCatalog } from "./types.js";
import {
  QUEST_TARGET_TAG_KEY,
  questProgressRecord,
  readQuestProgress,
  type QuestOperationResult,
  type QuestProgress,
} from "./types.js";

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly quest_escort_moved: {
      readonly questId: string;
      readonly npcId: EntityId;
      readonly from: Position;
      readonly to: Position;
      readonly direction: MoveDirection;
    };
    readonly quest_item_delivered: {
      readonly questId: string;
      readonly npcId: EntityId;
      readonly itemDefinitionId: string;
    };
  }
}

type FloorKnowledge = {
  readonly decorativeFeatures?: readonly SerializableRecord[];
};

type FloorRuntimeOpaque = TileGrid & {
  readonly knowledge?: FloorKnowledge;
};

let questItemCatalog: QuestItemCatalog | null = null;

export const setQuestItemCatalog = (catalog: QuestItemCatalog): void => {
  questItemCatalog = catalog;
};

export const deliverQuestItem = (
  state: GameState,
  npcEntityId: EntityId,
  itemDefinitionId: string,
): QuestOperationResult => {
  const npc = state.entities[npcEntityId];

  if (npc?.kind !== "npc") {
    return illegal(`npc ${npcEntityId} does not exist`);
  }

  const activeDeliverQuest = findActiveQuestByObjective(state, "deliver", (definition) => {
    const payload = definition.objective.deliver;

    return (
      payload !== null &&
      payload.itemId === itemDefinitionId &&
      payload.npcId === npc.definition.id
    );
  });

  if (activeDeliverQuest === null) {
    return illegal("no matching deliver quest is active");
  }

  const slotIndex = findInventoryDefinitionSlot(state, itemDefinitionId);

  if (slotIndex === null) {
    return illegal(`item ${itemDefinitionId} is not in your pack`);
  }

  const slot = state.player.inventory[slotIndex];

  if (slot === null || slot === undefined) {
    return illegal(`item ${itemDefinitionId} is not in your pack`);
  }

  const removed = removeFromInventory(state, slot.itemInstanceId, 1);

  if ("illegal" in removed) {
    return removed;
  }

  const catalog = requireCatalog();
  const completed = completeQuest(removed.state, activeDeliverQuest.definition.id, catalog);

  if ("illegal" in completed) {
    return completed;
  }

  return {
    state: completed.state,
    events: [
      questEvent(state, "quest_item_delivered", {
        questId: activeDeliverQuest.definition.id,
        npcId: npcEntityId,
        itemDefinitionId,
      }),
      ...completed.events,
    ],
  };
};

export const processQuestAfterPlayerAction = (
  state: GameState,
  events: readonly TurnEvent[],
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  let nextState = state;
  const produced: TurnEvent[] = [];

  for (const event of events) {
    if (event.type === "attack_hit" && event.data.defenderId === "player") {
      nextState = markConstraintDamage(nextState);
    }

    if (event.type === "moved" && event.data.actorId === "player") {
      nextState = recordEscortTrailPosition(nextState, event.data.from);
    }

    if (event.type === "stepped_stairs" && event.data.actorId === "player") {
      const handled = handlePlayerStairs(nextState);
      nextState = handled.state;
      produced.push(...handled.events);
    }
  }

  const fetchResult = evaluateFetchObjectives(nextState);
  nextState = fetchResult.state;
  produced.push(...fetchResult.events);

  const reachResult = evaluateReachObjectives(nextState);
  nextState = reachResult.state;
  produced.push(...reachResult.events);

  return { state: nextState, events: produced };
};

export const processQuestEndOfTurn = (state: GameState): TurnHookResult => {
  let nextState = detectEscortFloorAbandon(state);
  const escort = moveEscortWards(nextState);
  nextState = escort.state;

  return {
    state: nextState,
    events: escort.events,
  };
};

export const onEnemyKilledForQuests = (
  context: LootDropContext,
): GameState => {
  let nextState = markPlayerKill(context.state, context.attribution);

  for (const questId of context.state.quests.activeQuestIds) {
    const runtime = context.state.quests.quests[questId];

    if (runtime === undefined || runtime.definition.objective.kind !== "kill") {
      continue;
    }

    const payload = runtime.definition.objective.kill;

    if (payload === null) {
      continue;
    }

    if (!enemyMatchesKillTarget(context.victim, payload.targetTag)) {
      continue;
    }

    const catalog = questItemCatalog;

    if (catalog === null) {
      continue;
    }

    const completed = completeQuest(nextState, questId, catalog);

    if (!("illegal" in completed)) {
      nextState = completed.state;
    }
  }

  return nextState;
};

export const questTurnHooks = (): TurnHooks => ({
  actorTurn: questEscortActorTurnHook,
});

export const registerQuestLootDropHook = (): (() => void) =>
  registerLootDropHook((context) => onEnemyKilledForQuests(context));

const questEscortActorTurnHook: ActorTurnHook = ({ state, actor }) => {
  if (actor.kind !== "npc") {
    return { state };
  }

  const escortQuest = findEscortQuestForWard(state, actor.id);

  if (escortQuest === null) {
    return { state };
  }

  const moved = moveEscortWard(state, escortQuest, actor);

  return moved;
};

const moveEscortWards = (
  state: GameState,
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  const events: TurnEvent[] = [];
  let nextState = state;

  for (const questId of state.quests.activeQuestIds) {
    const runtime = state.quests.quests[questId];

    if (runtime === undefined || runtime.definition.objective.kind !== "escort") {
      continue;
    }

    const progress = readQuestProgress(runtime.progress);
    const wardId = progress.escortWardEntityId;

    if (wardId === undefined) {
      continue;
    }

    const ward = nextState.entities[wardId];

    if (ward?.kind !== "npc") {
      continue;
    }

    const moved = moveEscortWard(nextState, runtime, ward);

    nextState = moved.state;
    events.push(...moved.events);
  }

  return { state: nextState, events };
};

const moveEscortWard = (
  state: GameState,
  runtime: QuestRuntime,
  ward: NpcEntityInstance,
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  const grid = gridFromOpaque(state);

  if (grid === null) {
    return { state, events: [] };
  }

  const progress = readQuestProgress(runtime.progress);
  const trailGoal = progress.escortTrailPosition;
  const goal =
    trailGoal !== undefined &&
    !samePosition(trailGoal, state.player.position) &&
    !escortOccupied(state, ward.id)(trailGoal) &&
    inBounds(grid, trailGoal) &&
    isWalkableTile(getTile(grid, trailGoal))
      ? trailGoal
      : escortApproachGoal(state, ward.id, grid);

  if (goal === null) {
    return { state, events: [] };
  }

  const route = path(grid, ward.position, goal, {
    isOccupied: escortOccupied(state, ward.id),
  });

  if (route === null || route.length < 2) {
    return { state, events: [] };
  }

  const next = route[1];

  if (next === undefined || samePosition(next, state.player.position)) {
    return { state, events: [] };
  }

  const direction = directionBetween(ward.position, next);

  if (direction === null) {
    return { state, events: [] };
  }

  const tile = getTile(grid, next);

  if (!isWalkableTile(tile)) {
    return { state, events: [] };
  }

  const nextState = withNpcPosition(state, ward.id, next);
  const events: TurnEvent[] = [
    questEvent(state, "quest_escort_moved", {
      questId: runtime.definition.id,
      npcId: ward.id,
      from: ward.position,
      to: next,
      direction,
    }),
  ];

  if (tile.terrain === Terrain.StairsDown) {
    const catalog = questItemCatalog;

    if (catalog !== null) {
      const completed = completeQuest(nextState, runtime.definition.id, catalog);

      if (!("illegal" in completed)) {
        return {
          state: completed.state,
          events: [...events, ...completed.events],
        };
      }
    }
  }

  return { state: nextState, events };
};

const escortApproachGoal = (
  state: GameState,
  wardId: EntityId,
  grid: TileGrid,
): Position | null => {
  const playerPosition = state.player.position;
  const candidates = MOVE_DIRECTIONS.map((entry) =>
    destinationForMove(playerPosition, entry.direction),
  ).filter(
    (position) =>
      inBounds(grid, position) &&
      isWalkableTile(getTile(grid, position)) &&
      !samePosition(position, playerPosition) &&
      !escortOccupied(state, wardId)(position),
  );

  if (candidates.length === 0) {
    return null;
  }

  let best: Position | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const ward = state.entities[wardId];

  if (ward?.kind !== "npc") {
    return null;
  }

  for (const candidate of candidates) {
    const route = path(grid, ward.position, candidate, {
      isOccupied: escortOccupied(state, wardId),
    });

    if (route === null) {
      continue;
    }

    const distance = route.length;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
      continue;
    }

    if (
      distance === bestDistance &&
      best !== null &&
      comparePositions(candidate, best) < 0
    ) {
      best = candidate;
    }
  }

  return best;
};

const escortOccupied =
  (state: GameState, wardId: EntityId) =>
  (position: Position): boolean => {
    if (samePosition(position, state.player.position)) {
      return true;
    }

    for (const entity of Object.values(state.entities)) {
      if (entity.id === wardId) {
        continue;
      }

      if (
        (entity.kind === "enemy" || entity.kind === "npc") &&
        samePosition(entity.position, position)
      ) {
        return true;
      }
    }

    return false;
  };

const detectEscortFloorAbandon = (state: GameState): GameState => {
  let nextState = state;

  for (const questId of state.quests.activeQuestIds) {
    const runtime = state.quests.quests[questId];

    if (runtime === undefined || runtime.definition.objective.kind !== "escort") {
      continue;
    }

    const progress = readQuestProgress(runtime.progress);
    const trackedDepth = progress.trackedDepth ?? progress.acceptedAtDepth;

    if (trackedDepth === undefined || trackedDepth === state.run.depth) {
      continue;
    }

    const wardId = progress.escortWardEntityId;
    const ward = wardId === undefined ? null : state.entities[wardId];

    if (ward?.kind === "npc") {
      const grid = gridFromOpaque(state);

      if (grid !== null) {
        const tile = getTile(grid, ward.position);

        if (tile.terrain === Terrain.StairsDown) {
          continue;
        }
      }
    }

    const failed = failQuest(nextState, questId, "escort ward left behind");

    if (!("illegal" in failed)) {
      nextState = failed.state;
    }
  }

  return nextState;
};

const handlePlayerStairs = (
  state: GameState,
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  let nextState = state;
  const events: TurnEvent[] = [];

  for (const questId of state.quests.activeQuestIds) {
    const runtime = state.quests.quests[questId];

    if (runtime === undefined) {
      continue;
    }

    if (runtime.definition.objective.kind === "constraint") {
      const progress = readQuestProgress(runtime.progress);

      if (progress.constraintViolated === true) {
        const failed = failQuest(nextState, questId, "constraint violated");

        if (!("illegal" in failed)) {
          nextState = failed.state;
          events.push(...failed.events);
        }

        continue;
      }

      const catalog = questItemCatalog;

      if (catalog !== null) {
        const completed = completeQuest(nextState, questId, catalog);

        if (!("illegal" in completed)) {
          nextState = completed.state;
          events.push(...completed.events);
        }
      }

      continue;
    }

    if (runtime.definition.objective.kind === "reach") {
      const payload = runtime.definition.objective.reach;

      if (payload !== null && payload.featureId === "stairs") {
        const catalog = questItemCatalog;

        if (catalog !== null) {
          const completed = completeQuest(nextState, questId, catalog);

          if (!("illegal" in completed)) {
            nextState = completed.state;
            events.push(...completed.events);
          }
        }
      }
    }
  }

  return {
    state: withTrackedDepthOnActiveQuests(nextState),
    events,
  };
};

const evaluateFetchObjectives = (
  state: GameState,
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  let nextState = state;
  const events: TurnEvent[] = [];

  for (const questId of state.quests.activeQuestIds) {
    const runtime = state.quests.quests[questId];

    if (runtime === undefined || runtime.definition.objective.kind !== "fetch") {
      continue;
    }

    const payload = runtime.definition.objective.fetch;

    if (payload === null || !inventoryHasDefinition(state, payload.itemId)) {
      continue;
    }

    const progress = readQuestProgress(runtime.progress);
    const acceptedDepth = progress.acceptedAtDepth ?? state.run.depth;
    const depthOk =
      payload.floorScope === "this_floor"
        ? state.run.depth === acceptedDepth
        : state.run.depth === acceptedDepth || state.run.depth === acceptedDepth + 1;

    if (!depthOk) {
      continue;
    }

    const catalog = questItemCatalog;

    if (catalog === null) {
      continue;
    }

    const completed = completeQuest(nextState, questId, catalog);

    if (!("illegal" in completed)) {
      nextState = completed.state;
      events.push(...completed.events);
    }
  }

  return { state: nextState, events };
};

const evaluateReachObjectives = (
  state: GameState,
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  let nextState = state;
  const events: TurnEvent[] = [];
  const grid = gridFromOpaque(state);

  if (grid === null) {
    return { state: nextState, events };
  }

  const playerTile = getTile(grid, state.player.position);

  for (const questId of state.quests.activeQuestIds) {
    const runtime = state.quests.quests[questId];

    if (runtime === undefined || runtime.definition.objective.kind !== "reach") {
      continue;
    }

    const payload = runtime.definition.objective.reach;

    if (payload === null) {
      continue;
    }

    const reached =
      (payload.featureId === "stairs" &&
        playerTile.terrain === Terrain.StairsDown) ||
      featureAtPosition(state, state.player.position, payload.featureId);

    if (!reached) {
      continue;
    }

    const catalog = questItemCatalog;

    if (catalog === null) {
      continue;
    }

    const completed = completeQuest(nextState, questId, catalog);

    if (!("illegal" in completed)) {
      nextState = completed.state;
      events.push(...completed.events);
    }
  }

  return { state: nextState, events };
};

const markConstraintDamage = (state: GameState): GameState => {
  let nextState = state;

  for (const questId of state.quests.activeQuestIds) {
    const runtime = state.quests.quests[questId];

    if (runtime === undefined || runtime.definition.objective.kind !== "constraint") {
      continue;
    }

    const flag = runtime.definition.objective.constraint?.engineFlag;

    if (flag !== "take_no_damage") {
      continue;
    }

    nextState = withQuestProgress(nextState, questId, {
      ...readQuestProgress(runtime.progress),
      constraintViolated: true,
    });
  }

  return nextState;
};

const markPlayerKill = (
  state: GameState,
  attribution: LootDropContext["attribution"],
): GameState => {
  if (attribution.kind !== "killer" || attribution.killerId !== "player") {
    return state;
  }

  let nextState = state;

  for (const questId of state.quests.activeQuestIds) {
    const runtime = state.quests.quests[questId];

    if (runtime === undefined || runtime.definition.objective.kind !== "constraint") {
      continue;
    }

    const flag = runtime.definition.objective.constraint?.engineFlag;

    if (flag !== "kill_nothing") {
      continue;
    }

    const progress = readQuestProgress(runtime.progress);
    const floorFlags = progress.floorFlags;

    nextState = withQuestProgress(nextState, questId, {
      ...progress,
      constraintViolated: true,
      floorFlags: {
        hpAtFloorStart: floorFlags?.hpAtFloorStart ?? state.player.hp.current,
        damageTaken: floorFlags?.damageTaken ?? false,
        playerKills: (floorFlags?.playerKills ?? 0) + 1,
      },
    });
  }

  return nextState;
};

const findActiveQuestByObjective = (
  state: GameState,
  kind: QuestDefinition["objective"]["kind"],
  predicate: (definition: QuestDefinition) => boolean,
): QuestRuntime | null => {
  for (const questId of state.quests.activeQuestIds) {
    const runtime = state.quests.quests[questId];

    if (
      runtime !== undefined &&
      runtime.definition.objective.kind === kind &&
      predicate(runtime.definition)
    ) {
      return runtime;
    }
  }

  return null;
};

const findEscortQuestForWard = (
  state: GameState,
  wardEntityId: EntityId,
): QuestRuntime | null => {
  for (const questId of state.quests.activeQuestIds) {
    const runtime = state.quests.quests[questId];

    if (runtime === undefined || runtime.definition.objective.kind !== "escort") {
      continue;
    }

    const progress = readQuestProgress(runtime.progress);

    if (progress.escortWardEntityId === wardEntityId) {
      return runtime;
    }
  }

  return null;
};

const enemyMatchesKillTarget = (
  victim: LootDropContext["victim"],
  targetTag: string,
): boolean => {
  const runtimeTag = victim.behaviorRuntime[QUEST_TARGET_TAG_KEY];

  if (typeof runtimeTag === "string" && runtimeTag === targetTag) {
    return true;
  }

  return victim.definition.id === targetTag;
};

const inventoryHasDefinition = (state: GameState, definitionId: string): boolean =>
  state.player.inventory.some((slot) => slot?.definition.id === definitionId);

const findInventoryDefinitionSlot = (
  state: GameState,
  definitionId: string,
): number | null => {
  const index = state.player.inventory.findIndex(
    (slot) => slot?.definition.id === definitionId,
  );

  return index === -1 ? null : index;
};

const featureAtPosition = (
  state: GameState,
  position: Position,
  featureId: string,
): boolean => {
  const opaque = state.floor.geometry.opaque as FloorRuntimeOpaque | null;
  const features = opaque?.knowledge?.decorativeFeatures ?? [];

  return features.some((feature) => {
    const id = feature.id;
    const x = feature.x;
    const y = feature.y;

    return (
      id === featureId &&
      typeof x === "number" &&
      typeof y === "number" &&
      x === position.x &&
      y === position.y
    );
  });
};

const recordEscortTrailPosition = (
  state: GameState,
  trailPosition: Position,
): GameState => {
  let nextState = state;

  for (const questId of state.quests.activeQuestIds) {
    const runtime = state.quests.quests[questId];

    if (runtime === undefined || runtime.definition.objective.kind !== "escort") {
      continue;
    }

    nextState = withQuestProgress(nextState, questId, {
      ...readQuestProgress(runtime.progress),
      escortTrailPosition: trailPosition,
    });
  }

  return nextState;
};

const withTrackedDepthOnActiveQuests = (state: GameState): GameState => {
  let nextState = state;

  for (const questId of state.quests.activeQuestIds) {
    const runtime = state.quests.quests[questId];

    if (runtime === undefined) {
      continue;
    }

    nextState = withQuestProgress(nextState, questId, {
      ...readQuestProgress(runtime.progress),
      trackedDepth: state.run.depth,
    });
  }

  return nextState;
};

const withQuestProgress = (
  state: GameState,
  questId: string,
  progress: QuestProgress,
): GameState => {
  const runtime = state.quests.quests[questId];

  if (runtime === undefined) {
    return state;
  }

  return {
    ...state,
    quests: {
      ...state.quests,
      quests: {
        ...state.quests.quests,
        [questId]: {
          ...runtime,
          progress: questProgressRecord(progress),
        },
      },
    },
  };
};

const withNpcPosition = (
  state: GameState,
  npcId: EntityId,
  position: Position,
): GameState => {
  const npc = state.entities[npcId];

  if (npc?.kind !== "npc") {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [npcId]: {
        ...npc,
        position,
      },
    },
  };
};

const gridFromOpaque = (state: GameState): TileGrid | null =>
  gridFromState(state);

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;

const comparePositions = (left: Position, right: Position): number => {
  if (left.y !== right.y) {
    return left.y - right.y;
  }

  return left.x - right.x;
};

const directionBetween = (from: Position, to: Position): MoveDirection | null => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  for (const entry of MOVE_DIRECTIONS) {
    if (entry.offset.x === dx && entry.offset.y === dy) {
      return entry.direction;
    }
  }

  return null;
};

const requireCatalog = (): QuestItemCatalog => {
  if (questItemCatalog === null) {
    throw new Error("quest item catalog is not configured");
  }

  return questItemCatalog;
};

const questEvent = <Type extends keyof import("../state/types.js").EngineLogEventDataByType>(
  state: GameState,
  type: Type,
  data: import("../state/types.js").EngineLogEventDataByType[Type],
): TurnEvent =>
  ({
    turn: state.run.turn,
    type,
    data,
  }) as TurnEvent;

const illegal = (reason: string): QuestOperationResult => ({
  illegal: true,
  reason,
});
