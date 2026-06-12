/*
 * PHASE-21 FROZEN FLOOR CONTENT INJECTION INTERFACE
 *
 * The run loop consumes floor content; it never selects content. Fallback packs and
 * the Director both implement FloorContentProvider#getFloor(depth, seed), returning
 * already-authored floor params plus content definitions. The engine validates,
 * generates geometry, places content, and assembles runtime entities through
 * deterministic code only.
 */

import {
  config as defaultConfig,
  type GameConfig
} from "../../config/index.js";
import {
  EnemyDefinitionSchema,
  ItemDefinitionSchema,
  NpcDefinitionSchema,
  QuestDefinitionSchema,
  TrapDefinitionSchema,
  type DepthBand,
  type EnemyDefinition,
  type ItemDefinition,
  type NpcDefinition,
  type QuestDefinition,
  type TrapDefinition
} from "../../schemas/entities/index.js";
import {
  LAYOUT_FLAVORS,
  generateFloor,
  type FloorParams,
  type GeneratedFloor,
  type LayoutFlavor,
  type RoomCountRange
} from "../floorgen/index.js";
import {
  allocateCells,
  collectLegalPlacementCells,
  type PlacementDeviation,
  type PlacementGrid,
  type PlacementHint,
  type PlacementRequest
} from "../floorgen/place.js";
import { costOf, rosterAffordable, rosterCost } from "../enemies/index.js";
import { assembleEnemy } from "../enemies/index.js";
import { specialBehaviorActorTurnHook } from "../behaviors/special.js";
import { createFloorGeometrySlot, type TileGrid } from "../map/index.js";
import { createRng, type Rng } from "../rng/index.js";
import {
  allocateEntityId,
  depthBandForDepth,
  type EntityIdCounters,
  type EntityMap,
  type EntityInstance,
  type GameState,
  type GroundItemEntityInstance,
  type NpcEntityInstance,
  type Position,
  type QuestRuntime,
  type SerializableRecord,
  type TrapEntityInstance
} from "../state/index.js";
import {
  step as turnStep,
  start as turnStart,
  type PlayerAction,
  type TurnEvent,
  type TurnHooks
} from "../turn/index.js";
import { takeOneThingAtHoard, type TakeHoardAction } from "./endings.js";
import { appendRunLog, runEvent, type RunEvent } from "./events.js";

export type HoardFeatureParams = {
  readonly id?: string;
  readonly name?: string;
  readonly hint?: PlacementHint;
};

export type RunFloorParams = FloorParams & {
  readonly hoard?: HoardFeatureParams;
};

export type FloorContent = {
  readonly params: RunFloorParams;
  readonly roster: readonly EnemyDefinition[];
  readonly items: readonly ItemDefinition[];
  readonly traps: readonly TrapDefinition[];
  readonly npcs: readonly NpcDefinition[];
  readonly quest?: QuestDefinition;
};

export interface FloorContentProvider {
  readonly getFloor: (depth: number, seed: string) => FloorContent;
}

export type RunAction = PlayerAction | TakeHoardAction;

export type RunStepOptions = {
  readonly hooks?: TurnHooks;
  readonly config?: GameConfig;
};

export type RunStartOptions = {
  readonly config?: GameConfig;
};

export const runGameplayTurnHooks = (): TurnHooks => ({
  actorTurn: specialBehaviorActorTurnHook,
});

export type RunLoopErrorCode =
  | "provider_threw"
  | "provider_result_malformed"
  | "roster_unaffordable"
  | "floor_generation_failed"
  | "placement_failed"
  | "depth_out_of_range";

export type RunLoopError = {
  readonly kind: "run-loop-error";
  readonly code: RunLoopErrorCode;
  readonly depth: number;
  readonly message: string;
};

export type RunLoopSuccess = {
  readonly ok: true;
  readonly state: GameState;
  readonly events: readonly RunEvent[];
};

export type RunLoopFailure = {
  readonly ok: false;
  readonly state: GameState;
  readonly events: readonly RunEvent[];
  readonly error: RunLoopError;
};

export type RunLoopResult = RunLoopSuccess | RunLoopFailure;

type FloorRuntime = {
  readonly depth: number;
  readonly enteredTurn: number;
  readonly seed: string;
  readonly entrance: Position;
  readonly stairsDown: Position;
  readonly roster: readonly EnemyDefinition[];
  readonly initialSpawnBudgetSpent: number;
  readonly reinforcementSpawnBudgetSpent: number;
  readonly hoard: HoardRuntime | null;
};

type HoardRuntime = {
  readonly id: string;
  readonly name: string;
  readonly position: Position;
};

type FloorRuntimeOpaque = TileGrid & {
  readonly knowledge?: {
    readonly decorativeFeatures?: readonly SerializableRecord[];
    readonly run?: FloorRuntime;
  };
};

type ContentRequest =
  | {
      readonly request: PlacementRequest;
      readonly kind: "enemy";
      readonly definition: EnemyDefinition;
    }
  | {
      readonly request: PlacementRequest;
      readonly kind: "item";
      readonly definition: ItemDefinition;
    }
  | {
      readonly request: PlacementRequest;
      readonly kind: "trap";
      readonly definition: TrapDefinition;
    }
  | {
      readonly request: PlacementRequest;
      readonly kind: "npc";
      readonly definition: NpcDefinition;
    }
  | {
      readonly request: PlacementRequest;
      readonly kind: "hoard";
      readonly params: Required<Pick<HoardFeatureParams, "id" | "name">> &
        Pick<HoardFeatureParams, "hint">;
    };

export const startRun = (
  seed: string,
  provider: FloorContentProvider,
  options: RunStartOptions = {}
): RunLoopResult => {
  const gameConfig = options.config ?? defaultConfig;
  const state = turnStart(seed, { config: gameConfig });

  return enterFloor(state, provider, state.run.depth, gameConfig);
};

export const stepRun = (
  state: GameState,
  action: RunAction,
  provider: FloorContentProvider,
  options: RunStepOptions = {}
): RunLoopResult => {
  const gameConfig = options.config ?? defaultConfig;

  if (action.kind === "take_hoard") {
    const resolved = takeOneThingAtHoard(state);
    if ("illegal" in resolved) {
      return success(state, [
        runEvent(state.run.turn, "run_action_illegal", {
          actionKind: action.kind,
          reason: resolved.reason
        })
      ]);
    }

    const events = [
      runEvent(state.run.turn, "run_action_resolved", {
        actionKind: action.kind
      }),
      ...resolved.events
    ];

    return success(appendRunLog(resolved.state, events), events);
  }

  if (
    action.kind === "descend" &&
    state.run.depth >= gameConfig.runStructure.depthFloors
  ) {
    return success(state, [
      runEvent(state.run.turn, "run_action_illegal", {
        actionKind: action.kind,
        reason: "the final floor ends at the Hoard, not the stairs"
      })
    ]);
  }

  const stepped = turnStep(state, action, { hooks: options.hooks });
  if (
    actionWasIllegal(stepped.events) ||
    stepped.state.run.terminalStatus !== "ACTIVE"
  ) {
    return success(stepped.state, stepped.events);
  }

  if (action.kind === "descend") {
    const nextDepth = state.run.depth + 1;
    const entered = enterFloor(stepped.state, provider, nextDepth, gameConfig);
    if (!entered.ok) {
      return entered;
    }

    return success(entered.state, [...stepped.events, ...entered.events]);
  }

  const softCap = applySoftCap(stepped.state, gameConfig);
  return success(softCap.state, [...stepped.events, ...softCap.events]);
};

export const currentFloorRuntime = (state: GameState): FloorRuntime | null =>
  runtimeOpaque(state)?.knowledge?.run ?? null;

const enterFloor = (
  state: GameState,
  provider: FloorContentProvider,
  depth: number,
  gameConfig: GameConfig
): RunLoopResult => {
  if (depth < 1 || depth > gameConfig.runStructure.depthFloors) {
    return failure(state, {
      kind: "run-loop-error",
      code: "depth_out_of_range",
      depth,
      message: `depth ${depth} is outside run depth 1-${gameConfig.runStructure.depthFloors}`
    });
  }

  const band = depthBandForDepth(depth, gameConfig);
  const contentSeed = floorSeed(state.run.seed, depth);
  const contentResult = loadFloorContent(
    provider,
    depth,
    band,
    contentSeed,
    gameConfig
  );

  if (!contentResult.ok) {
    return failure(state, contentResult.error);
  }

  const generated = generateFloor(contentResult.content.params, gameConfig);
  if (!generated.ok) {
    return failure(state, {
      kind: "run-loop-error",
      code: "floor_generation_failed",
      depth,
      message: generated.error.message
    });
  }

  const requests = contentRequests(contentResult.content);
  const allocation = allocateCells(
    placementGrid(generated.floor),
    requests.map(({ request }) => request),
    runRng(state.run.seed).fork(`place:${depth}`)
  );

  if (!allocation.ok) {
    return failure(state, {
      kind: "run-loop-error",
      code: "placement_failed",
      depth,
      message: allocation.error.message
    });
  }

  const assembled = assembleEntities(
    state.ids.entityCounters,
    requests,
    allocation.placements
  );
  const hoard = hoardRuntime(requests, allocation.placements);
  const runtime: FloorRuntime = {
    depth,
    enteredTurn: state.run.turn,
    seed: contentSeed,
    entrance: generated.floor.entrance,
    stairsDown: generated.floor.stairsDown,
    roster: contentResult.content.roster,
    initialSpawnBudgetSpent: rosterCost(contentResult.content.roster),
    reinforcementSpawnBudgetSpent: 0,
    hoard
  };
  const floorId = `floor#${depth}`;
  const nextState = appendRunLog(
    {
      ...state,
      run: {
        ...state.run,
        depth,
        band
      },
      floor: {
        floorId,
        depth,
        band,
        geometry: createRuntimeGeometrySlot(
          `floor-geometry#${depth}`,
          generated.floor.grid,
          runtime
        )
      },
      player: {
        ...state.player,
        position: generated.floor.entrance
      },
      entities: assembled.entities,
      quests: withFloorQuest(state, contentResult.content.quest),
      ids: {
        ...state.ids,
        entityCounters: assembled.counters
      }
    },
    [
      runEvent(state.run.turn, "run_floor_entered", {
        floorId,
        depth,
        band,
        seed: contentSeed,
        rosterCost: runtime.initialSpawnBudgetSpent,
        spawnBudget: gameConfig.enemyDesign.spawnBudgetPoints[band],
        placementDeviationCount: allocation.deviations.length,
        hoardFeatureId: hoard?.id ?? null
      }),
      ...placementDeviationEvents(state.run.turn, allocation.deviations)
    ]
  );

  return success(nextState, nextState.log.slice(state.log.length));
};

const applySoftCap = (
  state: GameState,
  gameConfig: GameConfig
): { readonly state: GameState; readonly events: readonly RunEvent[] } => {
  const runtime = currentFloorRuntime(state);
  if (runtime === null) {
    return { state, events: [] };
  }

  const floorTurn = state.run.turn - runtime.enteredTurn;
  const softCap = gameConfig.runStructure.perFloorSoftCapTurns;
  const interval = gameConfig.runStructure.reinforcementIntervalTurns;

  if (floorTurn <= softCap || (floorTurn - softCap) % interval !== 0) {
    return { state, events: [] };
  }

  const wave = (floorTurn - softCap) / interval;
  const spawnBudget = gameConfig.enemyDesign.spawnBudgetPoints[state.run.band];
  const spent =
    runtime.initialSpawnBudgetSpent + runtime.reinforcementSpawnBudgetSpent;
  const budgetRemaining = Math.max(0, spawnBudget - spent);
  const candidates = runtime.roster.filter(
    (definition) => costOf(definition) <= budgetRemaining
  );

  if (candidates.length === 0) {
    const event = runEvent(state.run.turn, "run_boredom", {
      depth: state.run.depth,
      floorTurn,
      wave,
      budgetRemaining,
      reason: "budget_exhausted"
    });
    return { state: appendRunLog(state, [event]), events: [event] };
  }

  const cells = legalReinforcementCells(state);
  if (cells.length === 0) {
    const event = runEvent(state.run.turn, "run_boredom", {
      depth: state.run.depth,
      floorTurn,
      wave,
      budgetRemaining,
      reason: "no_legal_cell"
    });
    return { state: appendRunLog(state, [event]), events: [event] };
  }

  const rng = runRng(state.run.seed).fork(
    `reinforcement:${state.run.depth}:${wave}`
  );
  const definition = rng.pick(candidates);
  const position = pickStable(cells, rng);
  const allocation = allocateEntityId(state.ids.entityCounters, "enemy");
  const entity = assembleEnemy(definition, {
    id: allocation.id,
    position
  });
  const cost = costOf(definition);
  const nextRuntime: FloorRuntime = {
    ...runtime,
    reinforcementSpawnBudgetSpent: runtime.reinforcementSpawnBudgetSpent + cost
  };
  const nextBudgetRemaining = Math.max(0, budgetRemaining - cost);
  const events = [
    runEvent(state.run.turn, "run_boredom", {
      depth: state.run.depth,
      floorTurn,
      wave,
      budgetRemaining,
      reason: "reinforcement_spawned"
    }),
    runEvent(state.run.turn, "run_reinforcement_spawned", {
      entityId: allocation.id,
      definitionId: definition.id,
      depth: state.run.depth,
      position,
      cost,
      budgetRemaining: nextBudgetRemaining,
      wave
    })
  ];
  const nextState = appendRunLog(
    withRuntime(
      {
        ...state,
        entities: {
          ...state.entities,
          [entity.id]: entity
        },
        ids: {
          ...state.ids,
          entityCounters: allocation.entityCounters
        }
      },
      nextRuntime
    ),
    events
  );

  return { state: nextState, events };
};

const loadFloorContent = (
  provider: FloorContentProvider,
  depth: number,
  band: DepthBand,
  seed: string,
  gameConfig: GameConfig
):
  | { readonly ok: true; readonly content: FloorContent }
  | { readonly ok: false; readonly error: RunLoopError } => {
  let raw: unknown;

  try {
    raw = provider.getFloor(depth, seed);
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "run-loop-error",
        code: "provider_threw",
        depth,
        message:
          error instanceof Error
            ? error.message
            : "floor content provider threw a non-error value"
      }
    };
  }

  const record = asRecord(raw);
  if (record === null) {
    return malformed(depth, "provider result must be an object");
  }

  const params = parseRunFloorParams(record.params, depth, gameConfig);
  if (!params.ok) {
    return malformed(depth, params.message);
  }

  const roster = EnemyDefinitionSchema.array().safeParse(record.roster);
  if (!roster.success) {
    return malformed(depth, `roster is malformed: ${roster.error.message}`);
  }

  if (!rosterAffordable(roster.data, band)) {
    return {
      ok: false,
      error: {
        kind: "run-loop-error",
        code: "roster_unaffordable",
        depth,
        message: `roster is outside ${band} spawn budget`
      }
    };
  }

  const items = ItemDefinitionSchema.array().safeParse(record.items);
  if (!items.success) {
    return malformed(depth, `items are malformed: ${items.error.message}`);
  }

  const traps = TrapDefinitionSchema.array().safeParse(record.traps);
  if (!traps.success) {
    return malformed(depth, `traps are malformed: ${traps.error.message}`);
  }

  const npcs = NpcDefinitionSchema.array().safeParse(record.npcs);
  if (!npcs.success) {
    return malformed(depth, `npcs are malformed: ${npcs.error.message}`);
  }

  const quest =
    record.quest === undefined
      ? undefined
      : QuestDefinitionSchema.safeParse(record.quest);
  if (quest !== undefined && !quest.success) {
    return malformed(depth, `quest is malformed: ${quest.error.message}`);
  }

  return {
    ok: true,
    content: {
      params: params.value,
      roster: roster.data,
      items: items.data,
      traps: traps.data,
      npcs: npcs.data,
      ...(quest?.success ? { quest: quest.data } : {})
    }
  };
};

const parseRunFloorParams = (
  value: unknown,
  depth: number,
  gameConfig: GameConfig
):
  | { readonly ok: true; readonly value: RunFloorParams }
  | { readonly ok: false; readonly message: string } => {
  const record = asRecord(value);
  if (record === null) {
    return { ok: false, message: "params must be an object" };
  }

  const bandOrSize = parseBandOrSize(record.bandOrSize);
  if (bandOrSize === null) {
    return { ok: false, message: "params.bandOrSize is malformed" };
  }

  const roomCountRange = parseRoomCountRange(record.roomCountRange);
  if (roomCountRange === null) {
    return { ok: false, message: "params.roomCountRange is malformed" };
  }

  if (!isLayoutFlavor(record.flavor)) {
    return { ok: false, message: "params.flavor is malformed" };
  }

  if (typeof record.seed !== "string" || record.seed.length === 0) {
    return { ok: false, message: "params.seed must be a non-empty string" };
  }

  const hoard =
    record.hoard === undefined ? undefined : parseHoardParams(record.hoard);
  if (hoard === null) {
    return { ok: false, message: "params.hoard is malformed" };
  }

  const finalDepth = gameConfig.runStructure.depthFloors;
  if (depth === finalDepth && hoard === undefined) {
    return {
      ok: false,
      message: "final floor params must include params.hoard"
    };
  }

  if (depth !== finalDepth && hoard !== undefined) {
    return {
      ok: false,
      message: "params.hoard is only valid on the final floor"
    };
  }

  return {
    ok: true,
    value: {
      bandOrSize,
      roomCountRange,
      flavor: record.flavor,
      seed: record.seed,
      ...(hoard === undefined ? {} : { hoard })
    }
  };
};

const parseBandOrSize = (value: unknown): FloorParams["bandOrSize"] | null => {
  if (value === "shallows" || value === "middle" || value === "lowest") {
    return value;
  }

  const record = asRecord(value);
  if (
    record !== null &&
    isPositiveSafeInteger(record.width) &&
    isPositiveSafeInteger(record.height)
  ) {
    return {
      width: record.width,
      height: record.height
    };
  }

  return null;
};

const parseRoomCountRange = (value: unknown): RoomCountRange | null => {
  const record = asRecord(value);
  if (
    record !== null &&
    isPositiveSafeInteger(record.min) &&
    isPositiveSafeInteger(record.max) &&
    record.min <= record.max
  ) {
    return {
      min: record.min,
      max: record.max
    };
  }

  return null;
};

const parseHoardParams = (value: unknown): HoardFeatureParams | null => {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }

  const id = record.id === undefined ? "hoard" : parseNonEmptyString(record.id);
  if (id === null) {
    return null;
  }

  const name =
    record.name === undefined ? "The Hoard" : parseNonEmptyString(record.name);
  if (name === null) {
    return null;
  }

  const hint =
    record.hint === undefined ? undefined : parsePlacementHint(record.hint);
  if (hint === null) {
    return null;
  }

  return {
    id,
    name,
    ...(hint === undefined ? {} : { hint })
  };
};

const parsePlacementHint = (
  value: unknown
): PlacementHint | undefined | null => {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }

  const hint: {
    roomIndex?: number;
    distance?: "near_entrance" | "far_from_entrance";
    spread?: boolean;
  } = {};

  const roomIndex = record.roomIndex;
  if (roomIndex !== undefined) {
    if (
      typeof roomIndex !== "number" ||
      !Number.isSafeInteger(roomIndex) ||
      roomIndex < 0
    ) {
      return null;
    }
    hint.roomIndex = roomIndex;
  }

  if (record.distance !== undefined) {
    if (
      record.distance !== "near_entrance" &&
      record.distance !== "far_from_entrance"
    ) {
      return null;
    }
    hint.distance = record.distance;
  }

  if (record.spread !== undefined) {
    if (typeof record.spread !== "boolean") {
      return null;
    }
    hint.spread = record.spread;
  }

  return hint;
};

const contentRequests = (content: FloorContent): readonly ContentRequest[] => {
  const requests: ContentRequest[] = [];

  content.roster.forEach((definition, index) => {
    requests.push({
      request: {
        id: `enemy:${index}:${definition.id}`,
        kind: "enemy"
      },
      kind: "enemy",
      definition
    });
  });

  content.items.forEach((definition, index) => {
    requests.push({
      request: {
        id: `item:${index}:${definition.id}`,
        kind: "item"
      },
      kind: "item",
      definition
    });
  });

  content.traps.forEach((definition, index) => {
    requests.push({
      request: {
        id: `trap:${index}:${definition.id}`,
        kind: "trap"
      },
      kind: "trap",
      definition
    });
  });

  content.npcs.forEach((definition, index) => {
    requests.push({
      request: {
        id: `npc:${index}:${definition.id}`,
        kind: "npc"
      },
      kind: "npc",
      definition
    });
  });

  if (content.params.hoard !== undefined) {
    requests.push({
      request: {
        id: `hoard:${content.params.hoard.id ?? "hoard"}`,
        kind: "item",
        hint: content.params.hoard.hint
      },
      kind: "hoard",
      params: {
        id: content.params.hoard.id ?? "hoard",
        name: content.params.hoard.name ?? "The Hoard",
        ...(content.params.hoard.hint === undefined
          ? {}
          : { hint: content.params.hoard.hint })
      }
    });
  }

  return requests;
};

const assembleEntities = (
  counters: EntityIdCounters,
  requests: readonly ContentRequest[],
  placements: readonly {
    readonly requestId: string;
    readonly position: Position;
  }[]
): { readonly counters: EntityIdCounters; readonly entities: EntityMap } => {
  let nextCounters = counters;
  const entities: Record<string, EntityInstance> = {};
  const byRequestId = new Map(
    requests.map((request) => [request.request.id, request])
  );

  for (const placement of placements) {
    const request = byRequestId.get(placement.requestId);
    if (request === undefined || request.kind === "hoard") {
      continue;
    }

    const allocation = allocateEntityId(nextCounters, request.kind);
    nextCounters = allocation.entityCounters;

    switch (request.kind) {
      case "enemy": {
        const entity = assembleEnemy(request.definition, {
          id: allocation.id,
          position: placement.position
        });
        entities[entity.id] = entity;
        break;
      }
      case "item": {
        const entity: GroundItemEntityInstance = {
          id: allocation.id,
          kind: "item",
          definition: request.definition,
          position: placement.position,
          currentHP: null,
          statuses: [],
          behaviorRuntime: {},
          quantity: 1,
          identified: !["draught", "note", "charm"].includes(
            request.definition.kind
          )
        };
        entities[entity.id] = entity;
        break;
      }
      case "trap": {
        const entity: TrapEntityInstance = {
          id: allocation.id,
          kind: "trap",
          definition: request.definition,
          position: placement.position,
          currentHP: null,
          statuses: [],
          behaviorRuntime: {},
          armed: true
        };
        entities[entity.id] = entity;
        break;
      }
      case "npc": {
        const entity: NpcEntityInstance = {
          id: allocation.id,
          kind: "npc",
          definition: request.definition,
          position: placement.position,
          currentHP: null,
          statuses: [],
          behaviorRuntime: {},
          dialogueRuntime: {}
        };
        entities[entity.id] = entity;
        break;
      }
    }
  }

  return {
    counters: nextCounters,
    entities
  };
};

const hoardRuntime = (
  requests: readonly ContentRequest[],
  placements: readonly {
    readonly requestId: string;
    readonly position: Position;
  }[]
): HoardRuntime | null => {
  const hoard = requests.find((request) => request.kind === "hoard");
  if (hoard === undefined || hoard.kind !== "hoard") {
    return null;
  }

  const placement = placements.find(
    (candidate) => candidate.requestId === hoard.request.id
  );
  if (placement === undefined) {
    return null;
  }

  return {
    id: hoard.params.id,
    name: hoard.params.name,
    position: placement.position
  };
};

const createRuntimeGeometrySlot = (
  refId: string,
  grid: TileGrid,
  runtime: FloorRuntime
) => {
  const decorated: FloorRuntimeOpaque = {
    ...grid,
    knowledge: {
      ...(runtime.hoard === null
        ? {}
        : {
            decorativeFeatures: [
              {
                id: runtime.hoard.id,
                kind: "hoard",
                name: runtime.hoard.name,
                x: runtime.hoard.position.x,
                y: runtime.hoard.position.y,
                depth: runtime.depth
              }
            ]
          }),
      run: runtime
    }
  };

  return createFloorGeometrySlot(refId, decorated);
};

const withRuntime = (state: GameState, runtime: FloorRuntime): GameState => {
  const opaque = runtimeOpaque(state);
  if (opaque === null) {
    return state;
  }

  const nextOpaque: FloorRuntimeOpaque = {
    ...opaque,
    knowledge: {
      ...(opaque.knowledge ?? {}),
      run: runtime
    }
  };

  return {
    ...state,
    floor: {
      ...state.floor,
      geometry: {
        ...state.floor.geometry,
        opaque: nextOpaque as unknown as SerializableRecord
      }
    }
  };
};

const withFloorQuest = (
  state: GameState,
  quest: QuestDefinition | undefined
): GameState["quests"] => {
  if (quest === undefined) {
    return state.quests;
  }

  const runtime: QuestRuntime = {
    definition: quest,
    status: "available",
    progress: {}
  };

  return {
    ...state.quests,
    quests: {
      ...state.quests.quests,
      [quest.id]: runtime
    }
  };
};

const legalReinforcementCells = (state: GameState): readonly Position[] => {
  const opaque = runtimeOpaque(state);
  const runtime = currentFloorRuntime(state);
  if (opaque === null || runtime === null) {
    return [];
  }

  const occupied = new Set<string>([
    positionKey(state.player.position),
    ...Object.values(state.entities).map((entity) =>
      positionKey(entity.position)
    )
  ]);

  return collectLegalPlacementCells({
    grid: opaque,
    entrance: runtime.entrance,
    stairsDown: runtime.stairsDown,
    rooms: []
  }).filter((position) => !occupied.has(positionKey(position)));
};

const placementGrid = (floor: GeneratedFloor): PlacementGrid => ({
  grid: floor.grid,
  entrance: floor.entrance,
  stairsDown: floor.stairsDown,
  rooms: floor.rooms
});

const placementDeviationEvents = (
  turn: number,
  deviations: readonly PlacementDeviation[]
): readonly RunEvent[] =>
  deviations.map((deviation) =>
    runEvent(turn, "run_placement_deviation", {
      requestId: deviation.requestId,
      reasons: deviation.reasons
    })
  );

const runtimeOpaque = (state: GameState): FloorRuntimeOpaque | null => {
  const opaque = state.floor.geometry.opaque;

  if (!isRuntimeOpaque(opaque)) {
    return null;
  }

  return opaque;
};

const isRuntimeOpaque = (
  value: SerializableRecord | null
): value is SerializableRecord & FloorRuntimeOpaque => {
  if (value === null) {
    return false;
  }

  return (
    value.kind === "tile-grid" &&
    Number.isSafeInteger(value.width) &&
    Number.isSafeInteger(value.height) &&
    Array.isArray(value.tiles)
  );
};

const floorSeed = (seed: string, depth: number): string => {
  const value = runRng(seed).fork(`floor:${depth}`).nextUint32();
  return `${seed}:run:${depth}:${value}`;
};

const runRng = (seed: string): Rng => createRng(seed).fork("run");

const pickStable = (positions: readonly Position[], rng: Rng): Position =>
  rng.pick(
    [...positions].sort((left, right) =>
      left.y === right.y ? left.x - right.x : left.y - right.y
    )
  );

const actionWasIllegal = (events: readonly TurnEvent[]): boolean =>
  events.some((event) => event.type === "action_illegal");

const success = (
  state: GameState,
  events: readonly RunEvent[]
): RunLoopSuccess => ({
  ok: true,
  state,
  events
});

const failure = (state: GameState, error: RunLoopError): RunLoopFailure => ({
  ok: false,
  state,
  events: [],
  error
});

const malformed = (
  depth: number,
  message: string
): { readonly ok: false; readonly error: RunLoopError } => ({
  ok: false,
  error: {
    kind: "run-loop-error",
    code: "provider_result_malformed",
    depth,
    message
  }
});

const isLayoutFlavor = (value: unknown): value is LayoutFlavor =>
  typeof value === "string" &&
  (LAYOUT_FLAVORS as readonly string[]).includes(value);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const isPositiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && typeof value === "number" && value > 0;

const parseNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const positionKey = (position: Position): string =>
  `${position.x},${position.y}`;
