import { bounds } from "../../config/index.js";
import type { Behavior } from "../../schemas/entities/index.js";
import {
  getTile,
  inBounds,
  isWalkableTile,
  Terrain,
  type Tile,
} from "../map/index.js";
import { path } from "../map/path.js";
import { createRng, type Rng } from "../rng/index.js";
import { resolveAttack } from "../systems/combat.js";
import { isStunned } from "../systems/status.js";
import type {
  EngineLogEventDataByType,
  EnemyEntityInstance,
  EntityId,
  GameState,
  Position,
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
import {
  atTether,
  distanceTo,
  guardPostFor,
  isPatrolEngaged,
  isTerritorialProvoked,
  patrolIndexFor,
  playerVisible,
  readWaypointList,
} from "./perception.js";

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly enemy_moved: {
      readonly actorId: EntityId;
      readonly from: Position;
      readonly to: Position;
      readonly direction: MoveDirection;
    };
    readonly enemy_waited: {
      readonly actorId: EntityId;
    };
  }
}

export type BehaviorAction =
  | {
      readonly kind: "wait";
    }
  | {
      readonly kind: "move";
      readonly direction: MoveDirection;
    }
  | {
      readonly kind: "attack";
      readonly targetId: EntityId | "player";
    };

const AI_RNG_STREAM_ID = "ai";
const ROOT_RNG_STREAM_ID = "root";
const UINT32_SIZE = 0x1_0000_0000;

const KEEP_RANGE_MIN = bounds.enemyDesign.behaviorVocabulary.parameters
  .keepRangeDistanceTiles.min;
const KEEP_RANGE_MAX = bounds.enemyDesign.behaviorVocabulary.parameters
  .keepRangeDistanceTiles.max;

type MutableRngContext = {
  readonly base: Rng;
  rng: Rng;
  initialDraws: number;
  drawsUsed: number;
};

export const evaluateBehaviors = (
  state: GameState,
  enemyId: EntityId,
  rng: Rng | AiRngContext = aiRngContextFor(state),
): BehaviorAction => {
  const enemy = state.entities[enemyId];
  const context = isAiRngContext(rng) ? rng : aiRngContextFor(state);

  if (enemy?.kind !== "enemy") {
    return { kind: "wait" };
  }

  for (const behavior of enemy.definition.behaviors) {
    if (!behaviorConditionFires(state, enemy, behavior)) {
      continue;
    }

    return evaluateBehavior(state, enemyId, behavior, context);
  }

  return { kind: "wait" };
};

export type AiRngContext = MutableRngContext;

export const evaluateBehavior = (
  state: GameState,
  enemyId: EntityId,
  behavior: Behavior,
  rng: AiRngContext,
): BehaviorAction => {
  switch (behavior.kind) {
    case "approach_melee":
      return evaluateApproachMelee(state, enemyId);
    case "keep_range":
      return evaluateKeepRange(state, enemyId, behavior.keepRange?.distanceTiles);
    case "flee_low_hp":
      return evaluateFleeLowHp(state, enemyId, rng);
    case "territorial":
      return evaluateTerritorial(
        state,
        enemyId,
        behavior.territorial?.radiusTiles ?? KEEP_RANGE_MIN,
      );
    case "guard":
      return evaluateGuard(state, enemyId, behavior.guard);
    case "patrol":
      return evaluatePatrol(state, enemyId);
    default:
      return { kind: "wait" };
  }
};

export const executeBehaviorAction = (
  state: GameState,
  enemyId: EntityId,
  action: BehaviorAction,
): TurnHookResult => {
  switch (action.kind) {
    case "wait":
      return {
        state,
        events: [enemyEvent(state, "enemy_waited", { actorId: enemyId })],
      };
    case "attack": {
      const attackResult = resolveAttack(state, enemyId, action.targetId);

      if ("illegal" in attackResult) {
        return executeBehaviorAction(state, enemyId, { kind: "wait" });
      }

      return attackResult;
    }
    case "move":
      return resolveEnemyMove(state, enemyId, action.direction);
  }
};

export const behaviorActorTurnHook: ActorTurnHook = ({ state, actor }) => {
  if (actor.kind !== "enemy") {
    return { state };
  }

  const enemy = state.entities[actor.id];

  if (enemy?.kind !== "enemy" || enemy.definition.behaviors.length === 0) {
    return { state };
  }

  if (isStunned(enemy.statuses)) {
    return executeBehaviorAction(state, actor.id, { kind: "wait" });
  }

  const rngContext = aiRngContextFor(state);
  const action = evaluateBehaviors(state, actor.id, rngContext);
  const result = executeBehaviorAction(state, actor.id, action);
  const nextState = withAiRngCursor(normalizeHookState(result), rngContext);

  return {
    state: nextState,
    events: normalizeHookEvents(result),
  };
};

export const behaviorTurnHooks = (): TurnHooks => ({
  actorTurn: behaviorActorTurnHook,
});

let registeredBehaviorActorTurnHook: ActorTurnHook | null = null;

export const registerBehaviorActorTurnHook = (): (() => void) => {
  const previous = registeredBehaviorActorTurnHook;
  registeredBehaviorActorTurnHook = behaviorActorTurnHook;

  return () => {
    if (registeredBehaviorActorTurnHook === behaviorActorTurnHook) {
      registeredBehaviorActorTurnHook = previous;
    }
  };
};

export const resolveRegisteredBehaviorActorTurnHook = (): ActorTurnHook =>
  registeredBehaviorActorTurnHook ?? behaviorActorTurnHook;

export const createAiRngContext = (state: GameState): AiRngContext =>
  aiRngContextFor(state);

export const behaviorConditionFires = (
  state: GameState,
  enemy: EnemyEntityInstance,
  behavior: Behavior,
): boolean => {
  switch (behavior.kind) {
    case "flee_low_hp": {
      const threshold = behavior.fleeLowHp?.thresholdPercent;

      if (threshold === undefined) {
        return false;
      }

      return (
        enemy.currentHP * 100 <=
        threshold * enemy.definition.stats.hp
      );
    }
    case "approach_melee":
    case "keep_range":
    case "territorial":
    case "guard":
    case "patrol":
      return true;
    default:
      return false;
  }
};

const evaluateApproachMelee = (
  state: GameState,
  enemyId: EntityId,
): BehaviorAction => {
  const enemy = state.entities[enemyId];

  if (enemy?.kind !== "enemy") {
    return { kind: "wait" };
  }

  if (isAdjacent(enemy.position, state.player.position)) {
    return { kind: "attack", targetId: "player" };
  }

  const approachGoal = approachGoalFor(state, enemyId);

  if (approachGoal === null) {
    return { kind: "wait" };
  }

  return stepToward(state, enemyId, approachGoal, {});
};

const evaluateKeepRange = (
  state: GameState,
  enemyId: EntityId,
  preferredDistance: number | undefined,
): BehaviorAction => {
  const distance = distanceTo(state, enemyId);

  if (distance >= KEEP_RANGE_MIN && distance <= KEEP_RANGE_MAX) {
    return { kind: "wait" };
  }

  if (distance < KEEP_RANGE_MIN) {
    return stepAwayFromPlayer(state, enemyId, {});
  }

  const approachGoal = approachGoalFor(state, enemyId);

  if (approachGoal === null) {
    return { kind: "wait" };
  }

  if (preferredDistance !== undefined && distance > preferredDistance) {
    return stepToward(state, enemyId, approachGoal, {});
  }

  return stepToward(state, enemyId, approachGoal, {});
};

const evaluateFleeLowHp = (
  state: GameState,
  enemyId: EntityId,
  rng: AiRngContext,
): BehaviorAction =>
  stepAwayFromPlayer(state, enemyId, { rng, maximizeDistance: true });

const evaluateTerritorial = (
  state: GameState,
  enemyId: EntityId,
  radiusTiles: number,
): BehaviorAction => {
  const enemy = state.entities[enemyId];

  if (enemy?.kind !== "enemy") {
    return { kind: "wait" };
  }

  const provoked = isTerritorialProvoked(enemy);
  const playerInside =
    playerVisible(state, enemyId) &&
    distanceTo(state, enemyId) <= radiusTiles;

  if (!provoked && !playerInside) {
    return { kind: "wait" };
  }

  return evaluateApproachMelee(state, enemyId);
};

const evaluateGuard = (
  state: GameState,
  enemyId: EntityId,
  guard:
    | {
        readonly tetherId: string;
        readonly tetherRadiusTiles: number;
      }
    | null
    | undefined,
): BehaviorAction => {
  const enemy = state.entities[enemyId];

  if (enemy?.kind !== "enemy" || guard === null || guard === undefined) {
    return { kind: "wait" };
  }

  const post = guardPostFor(enemy);
  const radius = guard.tetherRadiusTiles;

  if (
    playerVisible(state, enemyId) &&
    atTether(state, enemyId, post, radius) &&
    isAdjacent(enemy.position, state.player.position)
  ) {
    return { kind: "attack", targetId: "player" };
  }

  if (
    playerVisible(state, enemyId) &&
    distanceTo(state, enemyId) <= radius &&
    !isAdjacent(enemy.position, state.player.position)
  ) {
    return stepToward(state, enemyId, state.player.position, {
      post,
      tetherRadius: radius,
    });
  }

  if (!atTether(state, enemyId, post, radius)) {
    return stepToward(state, enemyId, post, {
      post,
      tetherRadius: radius,
    });
  }

  return { kind: "wait" };
};

const evaluatePatrol = (
  state: GameState,
  enemyId: EntityId,
): BehaviorAction => {
  const enemy = state.entities[enemyId];

  if (enemy?.kind !== "enemy") {
    return { kind: "wait" };
  }

  if (isPatrolEngaged(enemy) || playerVisible(state, enemyId)) {
    return evaluateApproachMelee(state, enemyId);
  }

  const waypoints = readWaypointList(enemy);

  if (waypoints.length === 0) {
    return { kind: "wait" };
  }

  const index = patrolIndexFor(enemy) % waypoints.length;
  const waypoint = waypoints[index];

  if (waypoint === undefined) {
    return { kind: "wait" };
  }

  if (samePosition(enemy.position, waypoint)) {
    return { kind: "wait" };
  }

  return stepToward(state, enemyId, waypoint, {});
};

type StepConstraints = {
  readonly post?: Position;
  readonly tetherRadius?: number;
  readonly rng?: AiRngContext;
  readonly maximizeDistance?: boolean;
};

const approachGoalFor = (
  state: GameState,
  enemyId: EntityId,
): Position | null => {
  const enemy = state.entities[enemyId];
  const grid = gridFromState(state);

  if (enemy?.kind !== "enemy" || grid === null) {
    return null;
  }

  const playerPosition = state.player.position;
  const candidates = MOVE_DIRECTIONS.map((entry) =>
    destinationForMove(playerPosition, entry.direction),
  ).filter((position) =>
    inBounds(grid, position) &&
    isWalkableTile(getTile(grid, position)) &&
    !isClosedDoor(getTile(grid, position)) &&
    !occupiedPredicate(state, enemyId)(position),
  );

  if (candidates.length === 0) {
    return null;
  }

  let best: Position | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const route = path(grid, enemy.position, candidate, {
      isOccupied: occupiedPredicate(state, enemyId),
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

const stepToward = (
  state: GameState,
  enemyId: EntityId,
  goal: Position,
  constraints: StepConstraints,
): BehaviorAction => {
  const enemy = state.entities[enemyId];
  const grid = gridFromState(state);

  if (enemy?.kind !== "enemy" || grid === null) {
    return { kind: "wait" };
  }

  if (isAdjacent(enemy.position, state.player.position)) {
    return { kind: "attack", targetId: "player" };
  }

  const route = path(grid, enemy.position, goal, {
    isOccupied: occupiedPredicate(state, enemyId),
  });

  if (route === null || route.length < 2) {
    return { kind: "wait" };
  }

  const next = route[1];

  if (next === undefined) {
    return { kind: "wait" };
  }

  if (!moveAllowed(state, enemyId, enemy.position, next, constraints)) {
    return { kind: "wait" };
  }

  const direction = directionBetween(enemy.position, next);

  return direction === null ? { kind: "wait" } : { kind: "move", direction };
};

const stepAwayFromPlayer = (
  state: GameState,
  enemyId: EntityId,
  constraints: StepConstraints,
): BehaviorAction => {
  const enemy = state.entities[enemyId];
  const grid = gridFromState(state);

  if (enemy?.kind !== "enemy" || grid === null) {
    return { kind: "wait" };
  }

  const playerPosition = state.player.position;
  const candidates = MOVE_DIRECTIONS.map((entry) => ({
    direction: entry.direction,
    position: destinationForMove(enemy.position, entry.direction),
  })).filter((candidate) =>
    moveAllowed(state, enemyId, enemy.position, candidate.position, constraints),
  );

  if (candidates.length === 0) {
    return { kind: "wait" };
  }

  const currentDistance = chebyshevDistance(enemy.position, playerPosition);
  let bestDistance = currentDistance;
  let bestCandidates: typeof candidates = [];

  for (const candidate of candidates) {
    const nextDistance = chebyshevDistance(candidate.position, playerPosition);

    if (nextDistance > bestDistance) {
      bestDistance = nextDistance;
      bestCandidates = [candidate];
      continue;
    }

    if (nextDistance === bestDistance) {
      bestCandidates.push(candidate);
    }
  }

  if (bestDistance <= currentDistance && !constraints.maximizeDistance) {
    return { kind: "wait" };
  }

  const sorted = [...bestCandidates].sort((left, right) =>
    left.direction.localeCompare(right.direction),
  );
  const index =
    constraints.rng === undefined
      ? 0
      : rollInt(constraints.rng, 0, sorted.length - 1);
  const chosen = sorted[index];

  if (chosen === undefined) {
    return { kind: "wait" };
  }

  return { kind: "move", direction: chosen.direction };
};

const moveAllowed = (
  state: GameState,
  enemyId: EntityId,
  from: Position,
  to: Position,
  constraints: StepConstraints,
): boolean => {
  const grid = gridFromState(state);

  if (grid === null || !inBounds(grid, to)) {
    return false;
  }

  const tile = getTile(grid, to);

  if (!isWalkableTile(tile) || isClosedDoor(tile)) {
    return false;
  }

  if (occupiedPredicate(state, enemyId)(to)) {
    return false;
  }

  if (constraints.post !== undefined && constraints.tetherRadius !== undefined) {
    const fromDistance = chebyshevDistance(from, constraints.post);
    const toDistance = chebyshevDistance(to, constraints.post);

    if (
      fromDistance <= constraints.tetherRadius &&
      toDistance > constraints.tetherRadius
    ) {
      return false;
    }
  }

  return true;
};

const resolveEnemyMove = (
  state: GameState,
  enemyId: EntityId,
  direction: MoveDirection,
): TurnHookResult => {
  const enemy = state.entities[enemyId];
  const grid = gridFromState(state);

  if (enemy?.kind !== "enemy" || grid === null) {
    return { state, events: [] };
  }

  const from = enemy.position;
  const to = destinationForMove(from, direction);

  if (!inBounds(grid, to)) {
    return executeBehaviorAction(state, enemyId, { kind: "wait" });
  }

  const tile = getTile(grid, to);

  if (!isWalkableTile(tile) || isClosedDoor(tile)) {
    return executeBehaviorAction(state, enemyId, { kind: "wait" });
  }

  if (samePosition(to, state.player.position)) {
    const attackResult = resolveAttack(state, enemyId, "player");

    if ("illegal" in attackResult) {
      return executeBehaviorAction(state, enemyId, { kind: "wait" });
    }

    return attackResult;
  }

  if (occupiedPredicate(state, enemyId)(to)) {
    return executeBehaviorAction(state, enemyId, { kind: "wait" });
  }

  let nextState = withEnemyPosition(state, enemyId, to);
  nextState = advancePatrolRuntime(nextState, enemyId, from, to);

  if (playerVisible(nextState, enemyId)) {
    nextState = withEnemyBehaviorRuntime(nextState, enemyId, {
      patrolEngaged: true,
    });
  }

  return {
    state: nextState,
    events: [
      enemyEvent(state, "enemy_moved", {
        actorId: enemyId,
        from,
        to,
        direction,
      }),
    ],
  };
};

const advancePatrolRuntime = (
  state: GameState,
  enemyId: EntityId,
  from: Position,
  to: Position,
): GameState => {
  const enemy = state.entities[enemyId];

  if (enemy?.kind !== "enemy" || isPatrolEngaged(enemy)) {
    return state;
  }

  const waypoints = readWaypointList(enemy);

  if (waypoints.length === 0) {
    return state;
  }

  const index = patrolIndexFor(enemy) % waypoints.length;
  const waypoint = waypoints[index];

  if (waypoint === undefined || !samePosition(to, waypoint)) {
    return state;
  }

  return withEnemyBehaviorRuntime(state, enemyId, {
    patrolIndex: (index + 1) % waypoints.length,
  });
};

const occupiedPredicate =
  (state: GameState, selfId: EntityId) =>
  (position: Position): boolean => {
    if (samePosition(position, state.player.position)) {
      return true;
    }

    return Object.values(state.entities).some(
      (entity) =>
        (entity.kind === "enemy" || entity.kind === "npc") &&
        entity.id !== selfId &&
        samePosition(entity.position, position),
    );
  };

const withEnemyPosition = (
  state: GameState,
  enemyId: EntityId,
  position: Position,
): GameState => {
  const enemy = state.entities[enemyId];

  if (enemy?.kind !== "enemy") {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [enemyId]: {
        ...enemy,
        position,
      },
    },
  };
};

const withEnemyBehaviorRuntime = (
  state: GameState,
  enemyId: EntityId,
  patch: SerializableRecord,
): GameState => {
  const enemy = state.entities[enemyId];

  if (enemy?.kind !== "enemy") {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [enemyId]: {
        ...enemy,
        behaviorRuntime: {
          ...enemy.behaviorRuntime,
          ...patch,
        },
      },
    },
  };
};

const aiRngContextFor = (state: GameState): MutableRngContext => {
  const previousDraws = state.rng.streams[AI_RNG_STREAM_ID]?.draws ?? 0;
  const base = createRng(state.rng.rootSeed).fork(AI_RNG_STREAM_ID);

  for (let index = 0; index < previousDraws; index += 1) {
    base.nextUint32();
  }

  const context: MutableRngContext = {
    base,
    rng: base,
    initialDraws: previousDraws,
    drawsUsed: 0,
  };
  context.rng = trackingRng(context);

  return context;
};

const trackingRng = (context: MutableRngContext): Rng => ({
  nextUint32: () => drawUint32(context),
  fork: (label: string) => {
    const forkedBase = context.base.fork(label);
    const forkedContext: MutableRngContext = {
      base: forkedBase,
      rng: forkedBase,
      initialDraws: 0,
      drawsUsed: 0,
    };
    forkedContext.rng = trackingRng(forkedContext);

    return forkedContext.rng;
  },
  int: (min: number, max: number) => rollInt(context, min, max),
  pick: <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new RangeError("items must not be empty");
    }

    return items[rollInt(context, 0, items.length - 1)] as T;
  },
  weightedPick: <T>(items: readonly T[], weights: readonly number[]): T => {
    let total = 0;

    for (const weight of weights) {
      total += weight;
    }

    const roll = rollInt(context, 1, total);
    let runningTotal = 0;

    for (let index = 0; index < weights.length; index += 1) {
      runningTotal += weights[index] ?? 0;

      if (roll <= runningTotal) {
        return items[index] as T;
      }
    }

    return items[items.length - 1] as T;
  },
  shuffle: <T>(items: readonly T[]): T[] => {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = rollInt(context, 0, index);
      const value = shuffled[index];
      shuffled[index] = shuffled[swapIndex] as T;
      shuffled[swapIndex] = value as T;
    }

    return shuffled;
  },
  percent: (p: number) => rollInt(context, 1, 100) <= p,
});

const withAiRngCursor = (
  state: GameState,
  context: MutableRngContext,
): GameState => {
  const existing = state.rng.streams[AI_RNG_STREAM_ID];

  return {
    ...state,
    rng: {
      ...state.rng,
      streams: {
        ...state.rng.streams,
        [AI_RNG_STREAM_ID]: {
          streamId: AI_RNG_STREAM_ID,
          seed: existing?.seed ?? state.rng.rootSeed,
          parentStreamId: existing?.parentStreamId ?? ROOT_RNG_STREAM_ID,
          draws: context.initialDraws + context.drawsUsed,
        },
      },
    },
  };
};

const rollInt = (context: MutableRngContext, min: number, max: number): number => {
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

  return context.base.nextUint32();
};

const normalizeHookState = (result: TurnHookResult): GameState =>
  typeof result === "object" && "state" in result ? result.state : result;

const normalizeHookEvents = (
  result: TurnHookResult,
): readonly TurnEvent[] =>
  typeof result === "object" && "events" in result && result.events !== undefined
    ? result.events
    : [];

const enemyEvent = <Type extends "enemy_moved" | "enemy_waited">(
  state: GameState,
  type: Type,
  data: EngineLogEventDataByType[Type],
): Extract<TurnEvent, { readonly type: Type }> =>
  ({
    turn: state.run.turn,
    type,
    data,
  }) as Extract<TurnEvent, { readonly type: Type }>;

const isAdjacent = (a: Position, b: Position): boolean =>
  chebyshevDistance(a, b) <= 1;

const chebyshevDistance = (a: Position, b: Position): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const comparePositions = (left: Position, right: Position): number => {
  if (left.y !== right.y) {
    return left.y - right.y;
  }

  return left.x - right.x;
};

const isClosedDoor = (tile: Tile): boolean =>
  tile.terrain === Terrain.Door && tile.door === "closed";

const directionBetween = (
  from: Position,
  to: Position,
): MoveDirection | null => {
  const offset = {
    x: to.x - from.x,
    y: to.y - from.y,
  };
  const entry = MOVE_DIRECTIONS.find(
    (candidate) =>
      candidate.offset.x === offset.x && candidate.offset.y === offset.y,
  );

  return entry?.direction ?? null;
};

const isAiRngContext = (value: Rng | AiRngContext): value is AiRngContext =>
  typeof value === "object" &&
  "initialDraws" in value &&
  "drawsUsed" in value;
