import type { GameConfig } from "../../config/index.js";
import type {
  DepthBand,
  EnemyDefinition,
  ItemDefinition,
  NpcDefinition,
  QuestDefinition,
  TrapDefinition,
} from "../../schemas/entities/index.js";
import type {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
} from "../../schemas/protocol.js";
import type { StatusApplication } from "../../schemas/vocab/index.js";

export type SerializablePrimitive = string | number | boolean | null;

export type SerializableValue =
  | SerializablePrimitive
  | readonly SerializableValue[]
  | { readonly [key: string]: SerializableValue };

export type SerializableRecord = {
  readonly [key: string]: SerializableValue;
};

export const ACTIVE_TERMINAL_STATUS = "ACTIVE" as const;

export type ConfiguredTerminalStatus =
  GameConfig["runStructure"]["terminalStates"][keyof GameConfig["runStructure"]["terminalStates"]];

export type TerminalStatus =
  | typeof ACTIVE_TERMINAL_STATUS
  | ConfiguredTerminalStatus;

export interface VersionStamp {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly engineVersion: typeof ENGINE_VERSION;
}

export interface RunMeta {
  readonly runId: string;
  readonly seed: string;
  readonly depth: number;
  readonly band: DepthBand;
  readonly turn: number;
  readonly terminalStatus: TerminalStatus;
}

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface FloorGeometrySlot {
  readonly refId: string;
  /*
   * PHASE-07A contract: the map module owns this payload's concrete shape.
   * PHASE-06 only requires a stable, serializable geometry reference by id.
   */
  readonly opaque: SerializableRecord | null;
}

export interface FloorState {
  readonly floorId: string;
  readonly depth: number;
  readonly band: DepthBand;
  readonly geometry: FloorGeometrySlot;
}

export interface PlayerItemStack {
  readonly itemInstanceId: string;
  readonly definition: ItemDefinition;
  readonly quantity: number;
  readonly identified: boolean;
}

export type InventorySlot = PlayerItemStack | null;

export interface EquipmentState {
  readonly weapon: PlayerItemStack | null;
  readonly armor: PlayerItemStack | null;
  readonly charms: readonly (PlayerItemStack | null)[];
}

export interface PlayerState {
  readonly hp: {
    readonly current: number;
    readonly max: number;
  };
  readonly level: number;
  readonly xp: number;
  readonly fullness: {
    readonly current: number;
    readonly max: number;
  };
  readonly position: Position;
  readonly inventory: readonly InventorySlot[];
  readonly equipment: EquipmentState;
  readonly statuses: readonly StatusApplication[];
}

export type EntityKind = "enemy" | "npc" | "item" | "trap";

export type EntityIdCounters = {
  readonly [Kind in EntityKind]: number;
};

export type EntityId = `${EntityKind}#${number}`;

export interface EntityRuntimeFields {
  readonly id: EntityId;
  readonly position: Position;
  readonly currentHP: number | null;
  readonly statuses: readonly StatusApplication[];
  readonly behaviorRuntime: SerializableRecord;
}

export interface EnemyEntityInstance extends EntityRuntimeFields {
  readonly kind: "enemy";
  readonly definition: EnemyDefinition;
  readonly currentHP: number;
}

export interface NpcEntityInstance extends EntityRuntimeFields {
  readonly kind: "npc";
  readonly definition: NpcDefinition;
  readonly dialogueRuntime: SerializableRecord;
}

export interface GroundItemEntityInstance extends EntityRuntimeFields {
  readonly kind: "item";
  readonly definition: ItemDefinition;
  readonly currentHP: null;
  readonly quantity: number;
  readonly identified: boolean;
}

export interface TrapEntityInstance extends EntityRuntimeFields {
  readonly kind: "trap";
  readonly definition: TrapDefinition;
  readonly currentHP: null;
  readonly armed: boolean;
}

export type EntityInstance =
  | EnemyEntityInstance
  | NpcEntityInstance
  | GroundItemEntityInstance
  | TrapEntityInstance;

export type EntityMap = {
  readonly [id: string]: EntityInstance;
};

export type QuestRuntimeStatus = "available" | "active" | "completed" | "failed";

export interface QuestRuntime {
  readonly definition: QuestDefinition;
  readonly status: QuestRuntimeStatus;
  readonly progress: SerializableRecord;
}

export interface QuestState {
  readonly quests: {
    readonly [id: string]: QuestRuntime;
  };
  readonly activeQuestIds: readonly string[];
  readonly completedQuestIds: readonly string[];
  readonly failedQuestIds: readonly string[];
}

/*
 * Log extension pattern:
 * later engine systems add event types by declaration-merging this interface.
 * The runtime serializer validates the event envelope and serializable data.
 */
export interface EngineLogEventDataByType {
  readonly state_created: {
    readonly runId: string;
    readonly seed: string;
    readonly depth: number;
    readonly band: DepthBand;
  };
  readonly state_serialized: {
    readonly format: "stable-json";
  };
  readonly state_deserialized: {
    readonly format: "stable-json";
  };
}

export type EngineLogEventType = Extract<
  keyof EngineLogEventDataByType,
  string
>;

export type EngineLogEvent = {
  readonly [Type in EngineLogEventType]: {
    readonly turn: number;
    readonly type: Type;
    readonly data: EngineLogEventDataByType[Type];
  };
}[EngineLogEventType];

export interface RngStreamCursor {
  readonly streamId: string;
  readonly seed: string;
  readonly parentStreamId: string | null;
  readonly draws: number;
}

export interface RngState {
  readonly rootSeed: string;
  readonly streams: {
    readonly [streamId: string]: RngStreamCursor;
  };
}

export interface IdState {
  readonly entityCounters: EntityIdCounters;
}

export interface GameState {
  readonly version: VersionStamp;
  readonly run: RunMeta;
  readonly floor: FloorState;
  readonly player: PlayerState;
  readonly entities: EntityMap;
  readonly quests: QuestState;
  readonly log: readonly EngineLogEvent[];
  readonly rng: RngState;
  readonly ids: IdState;
}
