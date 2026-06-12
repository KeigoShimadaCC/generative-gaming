import "../../engine/effects/core.js";
import "../../engine/effects/spatial.js";
import "../../engine/items/triggers.js";
import "../../engine/npc/dialogue.js";
import "../../engine/systems/combat.js";
import "../../engine/systems/inventory.js";
import "../../engine/systems/movement.js";
import "../../engine/systems/player.js";
import "../../engine/systems/status.js";

import { bounds, config as defaultConfig } from "../../config/index.js";
import { assembleEnemy, rosterCost } from "../../engine/enemies/index.js";
import {
  generateFloor,
  type GeneratedFloor,
} from "../../engine/floorgen/index.js";
import {
  allocateCells,
  type PlacementAllocation,
  type PlacementDeviation,
  type PlacementGrid,
  type PlacementHint,
  type PlacementRequest,
} from "../../engine/floorgen/place.js";
import {
  createFloorGeometrySlot,
  getTile,
  Terrain,
  type TileGrid,
} from "../../engine/map/index.js";
import { path } from "../../engine/map/path.js";
import { createRng } from "../../engine/rng/index.js";
import type { RunAction } from "../../engine/run/loop.js";
import { stepRun, type FloorContentProvider } from "../../engine/run/loop.js";
import {
  allocateEntityId,
  createInitialState,
  type EntityIdCounters,
  type EntityInstance,
  type EntityMap,
  type GameState,
  type GroundItemEntityInstance,
  type NpcEntityInstance,
  type Position,
  type QuestRuntime,
  type SerializableRecord,
  type TerminalStatus,
  type TrapEntityInstance,
} from "../../engine/state/index.js";
import type {
  DepthBand,
  EnemyDefinition,
  ItemDefinition,
  NpcDefinition,
  QuestDefinition,
  TrapDefinition,
} from "../../schemas/entities/index.js";
import type {
  FloorManifest,
  ManifestItemEntry,
  ManifestNpcEntry,
  ManifestPlacementHint,
  ManifestRosterEntry,
  ManifestTrapEntry,
} from "../../schemas/manifest.js";
import {
  createBotStateView,
  createEmptyBotMemory,
  updateBotMemory,
  type BotMemory,
  type BotPolicy,
  type BotPolicyName,
} from "../../harness/bots/index.js";
import {
  aggressivePolicy,
  balancedPolicy,
  cautiousPolicy,
} from "../../harness/bots/policies/index.js";
import {
  actionKey,
  fallbackAction,
  hasAction,
} from "../../harness/bots/policies/helpers.js";
import { judgeGate2, type Gate2Report } from "./judge.js";

export type Gate2Clock = {
  readonly now: () => number;
};

export const createCounterClock = (start = 0): Gate2Clock => {
  let value = start;

  return {
    now: () => {
      const current = value;
      value += 1;
      return current;
    },
  };
};

export type Gate2Threshold = {
  readonly clearRateMinPercent: number;
  readonly medianHpRetentionPercent: {
    readonly min: number;
    readonly max: number;
  };
  readonly hardRejects: {
    readonly anyBotDeathThroughFloor?: number;
    readonly clearRateBelowPercent?: number;
  };
};

export type Gate2Config = {
  readonly policies: readonly BotPolicyName[];
  readonly seeds: readonly string[];
  readonly maxTurns: number;
  readonly thresholdsByBand: Readonly<Record<DepthBand, Gate2Threshold>>;
  readonly zeroThreatRejectBelowDepth: number;
  readonly wallClockBudgetMs: number;
};

export type CandidateFloorTransform = (
  floor: GeneratedFloor,
  manifest: FloorManifest,
) => GeneratedFloor;

export type Gate2RunOptions = {
  readonly config?: Gate2Config;
  readonly clock?: Gate2Clock;
  readonly transformFloor?: CandidateFloorTransform;
};

export type CandidateFloor = {
  readonly manifest: FloorManifest;
  readonly initialState: GameState;
  readonly generated: GeneratedFloor;
  readonly placements: readonly PlacementAllocation[];
  readonly placementDeviations: readonly PlacementDeviation[];
  readonly pathToStairs: readonly Position[] | null;
  readonly hasThreatOnPath: boolean;
};

export type Gate2RunMetrics = {
  readonly policy: BotPolicyName;
  readonly seed: string;
  readonly reachedStairs: boolean;
  readonly questCompleted: boolean;
  readonly cleared: boolean;
  readonly hpRetention: number;
  readonly turns: number;
  readonly died: boolean;
  readonly terminal: TerminalStatus;
  readonly maxTurnsHit: boolean;
};

export type Gate2AggregateMetrics = {
  readonly totalRuns: number;
  readonly clearCount: number;
  readonly reachedStairsCount: number;
  readonly questCompletedCount: number;
  readonly deathCount: number;
  readonly clearRatePercent: number;
  readonly medianHpRetentionPercent: number;
  readonly minTurns: number;
  readonly maxTurns: number;
};

export type Gate2Evaluation = {
  readonly gate: 2;
  readonly depth: number;
  readonly band: DepthBand;
  readonly candidate: {
    readonly seed: string;
    readonly stairsReachable: boolean;
    readonly pathLength: number | null;
    readonly hasThreatOnPath: boolean;
    readonly placementDeviationCount: number;
  };
  readonly ensemble: {
    readonly policies: readonly BotPolicyName[];
    readonly seeds: readonly string[];
    readonly maxTurns: number;
  };
  readonly runs: readonly Gate2RunMetrics[];
  readonly aggregate: Gate2AggregateMetrics;
  readonly thresholds: Gate2Config["thresholdsByBand"];
  readonly zeroThreatRejectBelowDepth: number;
  readonly elapsedMs: number;
  readonly wallClockBudgetMs: number;
};

type CandidateContentRequest =
  | {
      readonly request: PlacementRequest;
      readonly kind: "enemy";
      readonly definition: ManifestRosterEntry;
    }
  | {
      readonly request: PlacementRequest;
      readonly kind: "item";
      readonly definition: ManifestItemEntry;
    }
  | {
      readonly request: PlacementRequest;
      readonly kind: "trap";
      readonly definition: ManifestTrapEntry;
    }
  | {
      readonly request: PlacementRequest;
      readonly kind: "npc";
      readonly definition: ManifestNpcEntry;
    };

type StallTracker = {
  readonly previousActionKey: string | null;
  readonly previousProgressKey: string | null;
  readonly repeatCount: number;
};

const DEFAULT_STALL_LIMIT = 4;
const DEFAULT_WALL_CLOCK_BUDGET_MS = 8_000;
const POLICY_BY_NAME: Readonly<Record<BotPolicyName, BotPolicy>> = {
  cautious: cautiousPolicy,
  balanced: balancedPolicy,
  aggressive: aggressivePolicy,
};
const UNUSED_PROVIDER: FloorContentProvider = {
  getFloor: (depth) => {
    throw new Error(`Gate 2 single-floor evaluation cannot load depth ${depth}`);
  },
};
export const defaultGate2Config = (manifest: FloorManifest): Gate2Config => {
  const seedCount = defaultConfig.difficultyGate.botEnsemble.seedsPerPolicy;

  return {
    policies: defaultConfig.difficultyGate.botEnsemble.policies,
    seeds: Array.from(
      { length: seedCount },
      (_, index) => `${manifest.params.seed}:gate2:${index + 1}`,
    ),
    maxTurns: defaultConfig.runStructure.perFloorSoftCapTurns,
    thresholdsByBand: {
      shallows: widenThreshold(
        defaultConfig.difficultyGate.thresholdsByBand.shallows,
      ),
      middle: widenThreshold(defaultConfig.difficultyGate.thresholdsByBand.middle),
      lowest: widenThreshold(defaultConfig.difficultyGate.thresholdsByBand.lowest),
    },
    zeroThreatRejectBelowDepth: bounds.difficultyGate.rejectsZeroThreatBelowDepth,
    wallClockBudgetMs: DEFAULT_WALL_CLOCK_BUDGET_MS,
  };
};

export const runGate2 = (
  manifest: FloorManifest,
  options: Gate2RunOptions = {},
): Gate2Report => judgeGate2(evaluateGate2(manifest, options));

export const evaluateGate2 = (
  manifest: FloorManifest,
  options: Gate2RunOptions = {},
): Gate2Evaluation => {
  const gateConfig = options.config ?? defaultGate2Config(manifest);
  const clock = options.clock ?? createCounterClock();
  const startedAt = clock.now();
  const candidate = makeCandidateFloor(manifest, {
    transformFloor: options.transformFloor,
  });
  const policies = gateConfig.policies.map((name) => POLICY_BY_NAME[name]);
  const runs = policies.flatMap((policy) =>
    gateConfig.seeds.map((seed) =>
      runSingleFloorBot(policy, seed, candidate, gateConfig.maxTurns),
    ),
  );
  const elapsedMs = Math.max(0, clock.now() - startedAt);

  return {
    gate: 2,
    depth: manifest.depth,
    band: manifest.band,
    candidate: {
      seed: manifest.params.seed,
      stairsReachable: candidate.pathToStairs !== null,
      pathLength: candidate.pathToStairs?.length ?? null,
      hasThreatOnPath: candidate.hasThreatOnPath,
      placementDeviationCount: candidate.placementDeviations.length,
    },
    ensemble: {
      policies: gateConfig.policies,
      seeds: gateConfig.seeds,
      maxTurns: gateConfig.maxTurns,
    },
    runs,
    aggregate: aggregateRuns(runs),
    thresholds: gateConfig.thresholdsByBand,
    zeroThreatRejectBelowDepth: gateConfig.zeroThreatRejectBelowDepth,
    elapsedMs,
    wallClockBudgetMs: gateConfig.wallClockBudgetMs,
  };
};

// TODO-PHASE-35: replace this local materializer with the shared materialize().
export const makeCandidateFloor = (
  manifest: FloorManifest,
  options: Pick<Gate2RunOptions, "transformFloor"> = {},
): CandidateFloor => {
  const generated = generateFloor(manifest.params);
  if (!generated.ok) {
    throw new Error(`Gate 2 floor generation failed: ${generated.error.message}`);
  }

  const floor = options.transformFloor?.(generated.floor, manifest) ?? generated.floor;
  const requests = contentRequests(manifest);
  const allocation = allocateCells(
    placementGrid(floor),
    requests.map(({ request }) => request),
    createRng(manifest.params.seed).fork("gate2").fork(`place:${manifest.depth}`),
  );

  if (!allocation.ok) {
    throw new Error(`Gate 2 placement failed: ${allocation.error.message}`);
  }

  const baseState = createInitialState(manifest.params.seed);
  const assembled = assembleEntities(
    baseState.ids.entityCounters,
    requests,
    allocation.placements,
  );
  const pathToStairs = path(floor.grid, floor.entrance, floor.stairsDown, {
    openDoors: true,
  });
  const state = withCandidateFloorState(
    baseState,
    manifest,
    floor,
    assembled.entities,
    assembled.counters,
  );

  return {
    manifest,
    initialState: state,
    generated: floor,
    placements: allocation.placements,
    placementDeviations: allocation.deviations,
    pathToStairs,
    hasThreatOnPath: threatPossibleOnPath(floor.grid, floor.entrance, pathToStairs, assembled.entities),
  };
};

const runSingleFloorBot = (
  policy: BotPolicy,
  seed: string,
  candidate: CandidateFloor,
  maxTurns: number,
): Gate2RunMetrics => {
  assertMaxTurns(maxTurns);

  let state = stateForBotSeed(candidate.initialState, seed);
  let memory: BotMemory = createEmptyBotMemory();
  let stall: StallTracker = {
    previousActionKey: null,
    previousProgressKey: null,
    repeatCount: 0,
  };
  let reachedStairs = false;
  let questCompleted = floorQuestCompleted(state, candidate.manifest.quest);
  let turns = 0;

  while (
    state.run.terminalStatus === "ACTIVE" &&
    turns < maxTurns &&
    !reachedStairs &&
    !questCompleted
  ) {
    const view = createBotStateView(state, {
      policyName: policy.name,
      memory,
    });
    memory = updateBotMemory(memory, view);
    const decided = legalizeDecision(view, policy.decide(view));
    const breaker = breakStall(view, decided, stall);
    const action = breaker.action;
    stall = breaker.stall;
    turns += 1;

    if (action.kind === "descend" && hasAction(view, action)) {
      reachedStairs = true;
      break;
    }

    const stepped = stepRun(state, action, UNUSED_PROVIDER);
    if (!stepped.ok) {
      throw new Error(
        `Gate 2 bot step failed at turn ${state.run.turn} for ${policy.name}: ${stepped.error.message}`,
      );
    }

    state = stepped.state;
    questCompleted = floorQuestCompleted(state, candidate.manifest.quest);
  }

  return {
    policy: policy.name,
    seed,
    reachedStairs,
    questCompleted,
    cleared: reachedStairs || questCompleted,
    hpRetention:
      state.player.hp.max <= 0 ? 0 : state.player.hp.current / state.player.hp.max,
    turns,
    died: state.run.terminalStatus === defaultConfig.runStructure.terminalStates.loss,
    terminal: state.run.terminalStatus,
    maxTurnsHit:
      turns >= maxTurns &&
      state.run.terminalStatus === "ACTIVE" &&
      !reachedStairs &&
      !questCompleted,
  };
};

const stateForBotSeed = (state: GameState, seed: string): GameState => ({
  ...state,
  run: {
    ...state.run,
    runId: `run#gate2-${seed}`,
    seed,
    turn: 0,
    terminalStatus: "ACTIVE",
  },
  rng: {
    ...state.rng,
    rootSeed: seed,
    streams: {
      ...state.rng.streams,
      root: {
        streamId: "root",
        seed,
        parentStreamId: null,
        draws: 0,
      },
    },
  },
});

const aggregateRuns = (
  runs: readonly Gate2RunMetrics[],
): Gate2AggregateMetrics => {
  const totalRuns = runs.length;
  const clearCount = runs.filter((run) => run.cleared).length;
  const hpRetention = median(runs.map((run) => run.hpRetention * 100));
  const turns = runs.map((run) => run.turns);

  return {
    totalRuns,
    clearCount,
    reachedStairsCount: runs.filter((run) => run.reachedStairs).length,
    questCompletedCount: runs.filter((run) => run.questCompleted).length,
    deathCount: runs.filter((run) => run.died).length,
    clearRatePercent: totalRuns === 0 ? 0 : (clearCount / totalRuns) * 100,
    medianHpRetentionPercent: hpRetention,
    minTurns: turns.length === 0 ? 0 : Math.min(...turns),
    maxTurns: turns.length === 0 ? 0 : Math.max(...turns),
  };
};

const contentRequests = (
  manifest: FloorManifest,
): readonly CandidateContentRequest[] => [
  ...manifest.roster.map((definition, index) => ({
    request: {
      id: `enemy:${index}:${definition.id}`,
      kind: "enemy" as const,
      hint: placementHint(definition.placementHint),
    },
    kind: "enemy" as const,
    definition,
  })),
  ...manifest.items.map((definition, index) => ({
    request: {
      id: `item:${index}:${definition.id}`,
      kind: "item" as const,
      hint: placementHint(definition.placementHint),
    },
    kind: "item" as const,
    definition,
  })),
  ...manifest.traps.map((definition, index) => ({
    request: {
      id: `trap:${index}:${definition.id}`,
      kind: "trap" as const,
      hint: placementHint(definition.placementHint),
    },
    kind: "trap" as const,
    definition,
  })),
  ...manifest.npcs.map((definition, index) => ({
    request: {
      id: `npc:${index}:${definition.id}`,
      kind: "npc" as const,
      hint: placementHint(definition.placementHint),
    },
    kind: "npc" as const,
    definition,
  })),
];

const placementHint = (
  hint: ManifestPlacementHint | null,
): PlacementHint | undefined => {
  if (hint === null) {
    return undefined;
  }

  return {
    ...(hint.roomIndex === null ? {} : { roomIndex: hint.roomIndex }),
    ...(hint.distance === null ? {} : { distance: hint.distance }),
    ...(hint.spread ? { spread: true } : {}),
  };
};

const assembleEntities = (
  counters: EntityIdCounters,
  requests: readonly CandidateContentRequest[],
  placements: readonly PlacementAllocation[],
): { readonly counters: EntityIdCounters; readonly entities: EntityMap } => {
  let nextCounters = counters;
  const entities: Record<string, EntityInstance> = {};
  const byRequestId = new Map(
    requests.map((request) => [request.request.id, request]),
  );

  for (const placement of placements) {
    const request = byRequestId.get(placement.requestId);
    if (request === undefined) {
      continue;
    }

    const allocation = allocateEntityId(nextCounters, request.kind);
    nextCounters = allocation.entityCounters;

    switch (request.kind) {
      case "enemy": {
        const definition = enemyDefinition(request.definition);
        const entity = assembleEnemy(definition, {
          id: allocation.id,
          position: placement.position,
        });
        entities[entity.id] = entity;
        break;
      }
      case "item": {
        const definition = itemDefinition(request.definition);
        const entity: GroundItemEntityInstance = {
          id: allocation.id,
          kind: "item",
          definition,
          position: placement.position,
          currentHP: null,
          statuses: [],
          behaviorRuntime: {},
          quantity: 1,
          identified: !["draught", "note", "charm"].includes(definition.kind),
        };
        entities[entity.id] = entity;
        break;
      }
      case "trap": {
        const definition = trapDefinition(request.definition);
        const entity: TrapEntityInstance = {
          id: allocation.id,
          kind: "trap",
          definition,
          position: placement.position,
          currentHP: null,
          statuses: [],
          behaviorRuntime: {},
          armed: true,
        };
        entities[entity.id] = entity;
        break;
      }
      case "npc": {
        const definition = npcDefinition(request.definition);
        const entity: NpcEntityInstance = {
          id: allocation.id,
          kind: "npc",
          definition,
          position: placement.position,
          currentHP: null,
          statuses: [],
          behaviorRuntime: {},
          dialogueRuntime: {},
        };
        entities[entity.id] = entity;
        break;
      }
    }
  }

  return {
    counters: nextCounters,
    entities,
  };
};

const withCandidateFloorState = (
  state: GameState,
  manifest: FloorManifest,
  floor: GeneratedFloor,
  entities: EntityMap,
  counters: EntityIdCounters,
): GameState => ({
  ...state,
  run: {
    ...state.run,
    depth: manifest.depth,
    band: manifest.band,
    turn: 0,
    terminalStatus: "ACTIVE",
  },
  floor: {
    floorId: `floor#${manifest.depth}`,
    depth: manifest.depth,
    band: manifest.band,
    geometry: createCandidateGeometrySlot(manifest, floor),
  },
  player: {
    ...state.player,
    position: floor.entrance,
  },
  entities,
  quests: withFloorQuest(state, manifest.quest),
  ids: {
    ...state.ids,
    entityCounters: counters,
  },
});

const createCandidateGeometrySlot = (
  manifest: FloorManifest,
  floor: GeneratedFloor,
) => {
  const roster = manifest.roster.map(enemyDefinition);
  const runtime = {
    depth: manifest.depth,
    enteredTurn: 0,
    seed: manifest.params.seed,
    entrance: floor.entrance,
    stairsDown: floor.stairsDown,
    roster,
    initialSpawnBudgetSpent: rosterCost(roster),
    reinforcementSpawnBudgetSpent: 0,
    hoard: null,
  };
  const opaque: TileGrid & {
    readonly knowledge: SerializableRecord;
  } = {
    ...floor.grid,
    knowledge: {
      mapRevealed: true,
      run: runtime,
    } as unknown as SerializableRecord,
  };

  return createFloorGeometrySlot(
    `gate2-floor-geometry#${manifest.depth}`,
    opaque,
  );
};

const withFloorQuest = (
  state: GameState,
  quest: QuestDefinition | null,
): GameState["quests"] => {
  if (quest === null) {
    return state.quests;
  }

  const runtime: QuestRuntime = {
    definition: quest,
    status: "available",
    progress: {},
  };

  return {
    ...state.quests,
    quests: {
      ...state.quests.quests,
      [quest.id]: runtime,
    },
  };
};

const enemyDefinition = (entry: ManifestRosterEntry): EnemyDefinition =>
  withoutPlacementHint(entry);

const itemDefinition = (entry: ManifestItemEntry): ItemDefinition =>
  withoutPlacementHint(entry);

const trapDefinition = (entry: ManifestTrapEntry): TrapDefinition =>
  withoutPlacementHint(entry);

const npcDefinition = (entry: ManifestNpcEntry): NpcDefinition =>
  withoutPlacementHint(entry);

const withoutPlacementHint = <
  T extends { readonly placementHint: ManifestPlacementHint | null },
>(
  entry: T,
): Omit<T, "placementHint"> => {
  const copy = { ...entry } as {
    placementHint?: ManifestPlacementHint | null;
  } & Record<string, unknown>;
  delete copy.placementHint;
  return copy as Omit<T, "placementHint">;
};

const threatPossibleOnPath = (
  grid: TileGrid,
  entrance: Position,
  route: readonly Position[] | null,
  entities: EntityMap,
): boolean => {
  if (route === null) {
    return false;
  }

  const routeKeys = new Set(route.map(positionKey));

  return Object.values(entities)
    .filter((entity) => entity.kind === "enemy")
    .some((enemy) => {
      if (routeKeys.has(positionKey(enemy.position))) {
        return true;
      }

      if (route.some((cell) => chebyshev(cell, enemy.position) <= 1)) {
        return true;
      }

      return path(grid, enemy.position, entrance, { openDoors: true }) !== null;
    });
};

const floorQuestCompleted = (
  state: GameState,
  quest: QuestDefinition | null,
): boolean => quest !== null && state.quests.completedQuestIds.includes(quest.id);

const legalizeDecision = (
  view: ReturnType<typeof createBotStateView>,
  action: RunAction,
): RunAction => {
  if (hasAction(view, action)) {
    return action;
  }

  return fallbackAction(view);
};

const breakStall = (
  view: ReturnType<typeof createBotStateView>,
  action: RunAction,
  stall: StallTracker,
): { readonly action: RunAction; readonly stall: StallTracker } => {
  const progressKey = progressSignature(view);
  const key = actionKey(action);
  const repeatCount =
    stall.previousActionKey === key && stall.previousProgressKey === progressKey
      ? stall.repeatCount + 1
      : 1;

  if (repeatCount < DEFAULT_STALL_LIMIT) {
    return {
      action,
      stall: {
        previousActionKey: key,
        previousProgressKey: progressKey,
        repeatCount,
      },
    };
  }

  const alternative = forcedAlternative(view, key);

  return {
    action: alternative,
    stall: {
      previousActionKey: actionKey(alternative),
      previousProgressKey: progressKey,
      repeatCount: 1,
    },
  };
};

const forcedAlternative = (
  view: ReturnType<typeof createBotStateView>,
  repeatedActionKey: string,
): RunAction => {
  const candidates = [
    ...view.availableActions.filter((action) => action.kind === "descend"),
    ...view.availableActions.filter((action) => action.kind === "pickup"),
    ...view.availableActions.filter((action) => action.kind === "attack"),
    ...view.availableActions.filter((action) => action.kind === "move"),
    ...view.availableActions.filter((action) => action.kind === "wait"),
    ...view.availableActions.filter((action) => action.kind === "use_item"),
    ...view.availableActions.filter((action) => action.kind === "abort"),
  ].filter((candidate) => actionKey(candidate) !== repeatedActionKey);

  return candidates[0] ?? { kind: "abort" };
};

const progressSignature = (
  view: ReturnType<typeof createBotStateView>,
): string =>
  JSON.stringify({
    depth: view.run.depth,
    terminal: view.run.terminalStatus,
    position: view.player.position,
    hp: view.player.hp.current,
    fullness: view.player.fullness.current,
    inventory: view.player.inventory.map((item) => [
      item.itemInstanceId,
      item.definitionId,
      item.quantity,
    ]),
    enemies: view.visible.enemies.map((enemy) => [
      enemy.id,
      enemy.position,
      enemy.hp.current,
    ]),
  });

const placementGrid = (floor: GeneratedFloor): PlacementGrid => ({
  grid: floor.grid,
  entrance: floor.entrance,
  stairsDown: floor.stairsDown,
  rooms: floor.rooms,
});

const median = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle];
  if (right === undefined) {
    return 0;
  }

  if (sorted.length % 2 === 1) {
    return right;
  }

  const left = sorted[middle - 1] ?? right;
  return (left + right) / 2;
};

const widenThreshold = (
  threshold: (typeof defaultConfig.difficultyGate.thresholdsByBand)[DepthBand],
): Gate2Threshold => ({
  clearRateMinPercent: threshold.clearRateMinPercent,
  medianHpRetentionPercent: {
    min: threshold.medianHpRetentionPercent.min,
    max: threshold.medianHpRetentionPercent.max,
  },
  hardRejects: {
    ...threshold.hardRejects,
  },
});

const assertMaxTurns = (maxTurns: number): void => {
  if (!Number.isSafeInteger(maxTurns) || maxTurns <= 0) {
    throw new RangeError("maxTurns must be a positive safe integer");
  }
};

const positionKey = (position: Position): string => `${position.x},${position.y}`;

const chebyshev = (left: Position, right: Position): number =>
  Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));

export const isStairsDown = (grid: TileGrid, position: Position): boolean =>
  getTile(grid, position).terrain === Terrain.StairsDown;
