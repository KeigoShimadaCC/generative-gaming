import { rosterCost } from "../../engine/enemies/index.js";
import { assembleEnemy } from "../../engine/enemies/index.js";
import { generateFloor, type GeneratedFloor } from "../../engine/floorgen/index.js";
import {
  allocateCells,
  type PlacementAllocation,
  type PlacementDeviation,
  type PlacementGrid,
  type PlacementHint,
  type PlacementRequest,
} from "../../engine/floorgen/place.js";
import { createFloorGeometrySlot, type TileGrid } from "../../engine/map/index.js";
import { createRng } from "../../engine/rng/index.js";
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
  type TrapEntityInstance,
} from "../../engine/state/index.js";
import type {
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

export type MaterializeErrorCode = "floor_generation_failed" | "placement_failed";

export class MaterializeError extends Error {
  readonly kind = "materialize-error";
  readonly code: MaterializeErrorCode;
  readonly source: unknown;

  constructor(code: MaterializeErrorCode, message: string, source: unknown) {
    super(message);
    this.name = "MaterializeError";
    this.code = code;
    this.source = source;
  }
}

export type MaterializeOptions = {
  readonly transformFloor?: (
    floor: GeneratedFloor,
    manifest: FloorManifest,
  ) => GeneratedFloor;
  readonly revealMap?: boolean;
};

export type MaterializedFloorRuntime = {
  readonly depth: number;
  readonly enteredTurn: number;
  readonly seed: string;
  readonly entrance: Position;
  readonly stairsDown: Position;
  readonly roster: readonly EnemyDefinition[];
  readonly initialSpawnBudgetSpent: number;
  readonly reinforcementSpawnBudgetSpent: number;
  readonly hoard: null;
};

export type MaterializedFloor = {
  readonly manifest: FloorManifest;
  readonly generated: GeneratedFloor;
  readonly placements: readonly PlacementAllocation[];
  readonly entities: EntityMap;
  readonly state: GameState;
  readonly runtime: MaterializedFloorRuntime;
  readonly quest: QuestDefinition | null;
  readonly narration: FloorManifest["narration"];
  readonly metadata: FloorManifest["metadata"];
};

export type MaterializeResult = {
  readonly floor: MaterializedFloor;
  readonly deviations: readonly PlacementDeviation[];
};

type MaterializeContentRequest =
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
    };

type FloorRuntimeOpaque = TileGrid & {
  readonly knowledge?: SerializableRecord;
};

export const materialize = (
  manifest: FloorManifest,
  seed: string,
  options: MaterializeOptions = {},
): MaterializeResult => buildFloor(manifest, seed, options);

export const buildFloor = (
  manifest: FloorManifest,
  seed: string,
  options: MaterializeOptions = {},
): MaterializeResult => {
  const generated = generateFloor(manifest.params);
  if (!generated.ok) {
    throw new MaterializeError(
      "floor_generation_failed",
      `floor generation failed: ${generated.error.message}`,
      generated.error,
    );
  }

  const floor = options.transformFloor?.(generated.floor, manifest) ?? generated.floor;
  const requests = contentRequests(manifest);
  const allocation = allocateCells(
    placementGrid(floor),
    requests.map(({ request }) => request),
    createRng(seed).fork("run").fork(`place:${manifest.depth}`),
  );

  if (!allocation.ok) {
    throw new MaterializeError(
      "placement_failed",
      `placement failed: ${allocation.error.message}`,
      allocation.error,
    );
  }

  const baseState = createInitialState(seed);
  const assembled = assembleEntities(
    baseState.ids.entityCounters,
    requests,
    allocation.placements,
  );
  const roster = manifest.roster.map(enemyDefinition);
  const runtime: MaterializedFloorRuntime = {
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
  const state = withMaterializedFloorState(
    baseState,
    manifest,
    floor,
    assembled.entities,
    assembled.counters,
    runtime,
    options,
  );

  return {
    floor: {
      manifest,
      generated: floor,
      placements: allocation.placements,
      entities: assembled.entities,
      state,
      runtime,
      quest: manifest.quest,
      narration: manifest.narration,
      metadata: manifest.metadata,
    },
    deviations: allocation.deviations,
  };
};

const contentRequests = (
  manifest: FloorManifest,
): readonly MaterializeContentRequest[] => [
  ...manifest.roster.map((entry, index) => ({
    request: {
      id: `enemy:${index}:${entry.id}`,
      kind: "enemy" as const,
      hint: placementHint(entry.placementHint),
    },
    kind: "enemy" as const,
    definition: enemyDefinition(entry),
  })),
  ...manifest.items.map((entry, index) => ({
    request: {
      id: `item:${index}:${entry.id}`,
      kind: "item" as const,
      hint: placementHint(entry.placementHint),
    },
    kind: "item" as const,
    definition: itemDefinition(entry),
  })),
  ...manifest.traps.map((entry, index) => ({
    request: {
      id: `trap:${index}:${entry.id}`,
      kind: "trap" as const,
      hint: placementHint(entry.placementHint),
    },
    kind: "trap" as const,
    definition: trapDefinition(entry),
  })),
  ...manifest.npcs.map((entry, index) => ({
    request: {
      id: `npc:${index}:${entry.id}`,
      kind: "npc" as const,
      hint: placementHint(entry.placementHint),
    },
    kind: "npc" as const,
    definition: npcDefinition(entry),
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
  requests: readonly MaterializeContentRequest[],
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
        const entity = assembleEnemy(request.definition, {
          id: allocation.id,
          position: placement.position,
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
            request.definition.kind,
          ),
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
          armed: true,
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

const withMaterializedFloorState = (
  state: GameState,
  manifest: FloorManifest,
  floor: GeneratedFloor,
  entities: EntityMap,
  counters: EntityIdCounters,
  runtime: MaterializedFloorRuntime,
  options: MaterializeOptions,
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
    geometry: createMaterializedGeometrySlot(manifest, floor, runtime, options),
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

const createMaterializedGeometrySlot = (
  manifest: FloorManifest,
  floor: GeneratedFloor,
  runtime: MaterializedFloorRuntime,
  options: MaterializeOptions,
) => {
  const opaque: FloorRuntimeOpaque = {
    ...floor.grid,
    knowledge: {
      ...(options.revealMap === true ? { mapRevealed: true } : {}),
      director: {
        narration: manifest.narration,
        metadata: manifest.metadata,
      } as unknown as SerializableRecord,
      run: runtime as unknown as SerializableRecord,
    },
  };

  return createFloorGeometrySlot(
    `floor-geometry#${manifest.depth}`,
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

const placementGrid = (floor: GeneratedFloor): PlacementGrid => ({
  grid: floor.grid,
  entrance: floor.entrance,
  stairsDown: floor.stairsDown,
  rooms: floor.rooms,
});
