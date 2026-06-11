import type {
  EntityId,
  GameState,
  NpcEntityInstance,
  SerializableRecord,
  SerializableValue,
} from "../state/index.js";

export const ACTIVE_NODE_KEY = "activeNodeId" as const;
export const DIALOGUE_FLAGS_KEY = "dialogueFlags" as const;
export const BARTER_OPEN_KEY = "barterOpen" as const;
export const MERCHANT_STOCK_KEY = "merchantStockIds" as const;

export type ActiveConversation = {
  readonly npcId: EntityId;
  readonly nodeId: string;
};

export type DialogueRuntime = {
  readonly [ACTIVE_NODE_KEY]?: string;
  readonly [DIALOGUE_FLAGS_KEY]?: SerializableRecord;
  readonly [BARTER_OPEN_KEY]?: boolean;
  readonly [MERCHANT_STOCK_KEY]?: readonly string[];
};

const isRecord = (value: SerializableValue | undefined): value is SerializableRecord =>
  value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);

export const readDialogueRuntime = (npc: NpcEntityInstance): DialogueRuntime =>
  npc.dialogueRuntime as DialogueRuntime;

export const getActiveConversation = (state: GameState): ActiveConversation | null => {
  for (const entity of sortedNpcs(state)) {
    const runtime = readDialogueRuntime(entity);
    const nodeId = runtime[ACTIVE_NODE_KEY];

    if (typeof nodeId === "string" && nodeId.length > 0) {
      return {
        npcId: entity.id,
        nodeId,
      };
    }
  }

  return null;
};

export const isWorldPaused = (state: GameState): boolean =>
  getActiveConversation(state) !== null;

export const isBarterOpen = (state: GameState): boolean => {
  const conversation = getActiveConversation(state);

  if (conversation === null) {
    return false;
  }

  const npc = state.entities[conversation.npcId];

  if (npc?.kind !== "npc") {
    return false;
  }

  return readDialogueRuntime(npc)[BARTER_OPEN_KEY] === true;
};

export const getDialogueFlags = (state: GameState): SerializableRecord => {
  const conversation = getActiveConversation(state);

  if (conversation === null) {
    return {};
  }

  const npc = state.entities[conversation.npcId];

  if (npc?.kind !== "npc") {
    return {};
  }

  const flags = readDialogueRuntime(npc)[DIALOGUE_FLAGS_KEY];

  return isRecord(flags) ? flags : {};
};

export const hasDialogueFlag = (state: GameState, flag: string): boolean =>
  getDialogueFlags(state)[flag] === true;

export const withNpcDialogueRuntime = (
  state: GameState,
  npcId: EntityId,
  patch: DialogueRuntime,
): GameState => {
  const npc = state.entities[npcId];

  if (npc?.kind !== "npc") {
    return state;
  }

  const nextRuntime: DialogueRuntime = {
    ...readDialogueRuntime(npc),
    ...patch,
  };

  return {
    ...state,
    entities: {
      ...state.entities,
      [npcId]: {
        ...npc,
        dialogueRuntime: nextRuntime as SerializableRecord,
      },
    },
  };
};

export const sortedNpcs = (state: GameState): readonly NpcEntityInstance[] =>
  Object.values(state.entities)
    .filter((entity): entity is NpcEntityInstance => entity.kind === "npc")
    .sort((left, right) => left.id.localeCompare(right.id));
