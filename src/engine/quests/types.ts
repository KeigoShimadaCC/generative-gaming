import type { DepthBand, QuestDefinition } from "../../schemas/entities/index.js";
import type { EntityId, Position, SerializableRecord } from "../state/index.js";

export const QUEST_TARGET_TAG_KEY = "questTargetTag" as const;

export type QuestFloorFlags = {
  readonly hpAtFloorStart: number;
  readonly damageTaken: boolean;
  readonly playerKills: number;
};

export type QuestProgress = {
  readonly offeredByNpcId?: EntityId;
  readonly offeredAtDepth?: number;
  readonly offeredAtBand?: DepthBand;
  readonly acceptedAtDepth?: number;
  readonly acceptedAtBand?: DepthBand;
  readonly fetchSatisfied?: boolean;
  readonly fetchSatisfiedAtDepth?: number;
  readonly deliverReady?: boolean;
  readonly escortWardEntityId?: EntityId;
  readonly escortTrailPosition?: Position;
  readonly floorFlags?: QuestFloorFlags;
  readonly constraintViolated?: boolean;
  readonly trackedDepth?: number;
};

export type QuestItemCatalog = {
  readonly resolve: (definitionId: string) => import("../../schemas/entities/index.js").ItemDefinition | null;
  readonly coinDefinition: import("../../schemas/entities/index.js").ItemDefinition;
};

export type QuestResolution = {
  readonly state: import("../state/index.js").GameState;
  readonly events: readonly import("../turn/index.js").TurnEvent[];
};

export type QuestIllegal = {
  readonly illegal: true;
  readonly reason: string;
};

export type QuestOperationResult = QuestResolution | QuestIllegal;

export const readQuestProgress = (progress: SerializableRecord): QuestProgress =>
  progress as QuestProgress;

export const questProgressRecord = (progress: QuestProgress): SerializableRecord =>
  progress as SerializableRecord;

export const questDefinitionForHook = (
  definition: QuestDefinition | null,
  questHookId: string,
): QuestDefinition | null => {
  if (definition === null || definition.id !== questHookId) {
    return null;
  }

  return definition;
};
