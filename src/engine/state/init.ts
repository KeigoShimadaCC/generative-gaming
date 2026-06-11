import {
  bounds,
  config as defaultConfig,
  type GameConfig,
} from "../../config/index.js";
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
} from "../../schemas/protocol.js";
import type { DepthBand } from "../../schemas/entities/index.js";
import { createClock } from "../clock/index.js";
import {
  ACTIVE_TERMINAL_STATUS,
  type EntityId,
  type EntityIdCounters,
  type EntityKind,
  type GameState,
  type Position,
} from "./types.js";

export const ROOT_RNG_STREAM_ID = "root" as const;

export const createInitialEntityCounters = (): EntityIdCounters => ({
  enemy: 0,
  npc: 0,
  item: 0,
  trap: 0,
});

export interface EntityIdAllocation {
  readonly id: EntityId;
  readonly entityCounters: EntityIdCounters;
}

export const allocateEntityId = (
  counters: EntityIdCounters,
  kind: EntityKind,
): EntityIdAllocation => {
  const next = counters[kind] + 1;

  return {
    id: `${kind}#${next}` as EntityId,
    entityCounters: {
      ...counters,
      [kind]: next,
    },
  };
};

export const depthBandForDepth = (
  depth: number,
  gameConfig: GameConfig = defaultConfig,
): DepthBand => {
  if (!Number.isSafeInteger(depth)) {
    throw new RangeError("depth must be a safe integer");
  }

  for (const [band, range] of depthBandEntries(gameConfig)) {
    if (depth >= range.minFloor && depth <= range.maxFloor) {
      return band;
    }
  }

  throw new RangeError(`depth ${depth} is outside configured depth bands`);
};

export const createInitialState = (
  seed: string,
  gameConfig: GameConfig = defaultConfig,
): GameState => {
  const turn = createClock().now();
  const depth = initialDepth(gameConfig);
  const band = depthBandForDepth(depth, gameConfig);
  const runId = runIdForSeed(seed);
  const startPosition = unplacedPosition();
  const playerHp = gameConfig.playerCharacter.stats.hp.start;
  const playerFullness = gameConfig.playerCharacter.stats.fullness.start;

  return {
    version: {
      protocolVersion: PROTOCOL_VERSION,
      engineVersion: ENGINE_VERSION,
    },
    run: {
      runId,
      seed,
      depth,
      band,
      turn,
      terminalStatus: ACTIVE_TERMINAL_STATUS,
    },
    floor: {
      floorId: `floor#${depth}`,
      depth,
      band,
      geometry: {
        refId: `floor-geometry#${depth}`,
        opaque: null,
      },
    },
    player: {
      hp: {
        current: playerHp,
        max: playerHp,
      },
      level: gameConfig.playerCharacter.stats.level.start,
      xp: 0,
      fullness: {
        current: playerFullness,
        max: bounds.playerCharacter.fullnessCap,
      },
      position: startPosition,
      inventory: Array.from(
        { length: gameConfig.playerCharacter.inventory.slots },
        () => null,
      ),
      equipment: {
        weapon: null,
        armor: null,
        charms: Array.from(
          { length: gameConfig.playerCharacter.equipmentSlots.charms },
          () => null,
        ),
      },
      statuses: [],
    },
    entities: {},
    quests: {
      quests: {},
      activeQuestIds: [],
      completedQuestIds: [],
      failedQuestIds: [],
    },
    log: [
      {
        turn,
        type: "state_created",
        data: {
          runId,
          seed,
          depth,
          band,
        },
      },
    ],
    rng: {
      rootSeed: seed,
      streams: {
        [ROOT_RNG_STREAM_ID]: {
          streamId: ROOT_RNG_STREAM_ID,
          seed,
          parentStreamId: null,
          draws: 0,
        },
      },
    },
    ids: {
      entityCounters: createInitialEntityCounters(),
    },
  };
};

const runIdForSeed = (seed: string): string => `run#${seed}`;

const unplacedPosition = (): Position => ({
  x: 0,
  y: 0,
});

const initialDepth = (gameConfig: GameConfig): number => {
  const entries = depthBandEntries(gameConfig);
  const firstEntry = entries[0];

  if (firstEntry === undefined) {
    throw new RangeError("config must define at least one depth band");
  }

  let depth = firstEntry[1].minFloor;
  for (const [, range] of entries) {
    if (range.minFloor < depth) {
      depth = range.minFloor;
    }
  }

  return depth;
};

const depthBandEntries = (
  gameConfig: GameConfig,
): readonly [
  DepthBand,
  {
    readonly minFloor: number;
    readonly maxFloor: number;
  },
][] =>
  Object.entries(gameConfig.runStructure.depthBands) as readonly [
    DepthBand,
    {
      readonly minFloor: number;
      readonly maxFloor: number;
    },
  ][];
