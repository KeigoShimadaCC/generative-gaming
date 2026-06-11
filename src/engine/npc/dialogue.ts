import type { NpcDefinition } from "../../schemas/entities/index.js";

type DialogueTree = NpcDefinition["dialogue"];
type DialogueNode = DialogueTree["nodes"][number];
type DialogueChoice = DialogueNode["choices"][number];
import type {
  EngineLogEventDataByType,
  EntityId,
  GameState,
  NpcEntityInstance,
} from "../state/index.js";
import {
  registerActionResolver,
  step,
  type ActionResolver,
  type ActionResolverResult,
  type PlayerAction,
  type StepOptions,
  type StepResult,
  type TalkAction,
  type TurnEvent,
  type TurnHooks,
} from "../turn/index.js";
import {
  ACTIVE_NODE_KEY,
  BARTER_OPEN_KEY,
  DIALOGUE_FLAGS_KEY,
  getActiveConversation,
  isWorldPaused,
  MERCHANT_STOCK_KEY,
  readDialogueRuntime,
  withNpcDialogueRuntime,
} from "./runtime.js";

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly dialogue_opened: {
      readonly npcId: EntityId;
      readonly nodeId: string;
    };
    readonly dialogue_choice_selected: {
      readonly npcId: EntityId;
      readonly choiceId: string;
      readonly nodeId: string;
    };
    readonly dialogue_ended: {
      readonly npcId: EntityId;
    };
    readonly dialogue_flag_set: {
      readonly npcId: EntityId;
      readonly flag: string;
    };
    readonly barter_opened: {
      readonly npcId: EntityId;
    };
    readonly quest_offer_hook: {
      readonly npcId: EntityId;
      readonly questHookId: string;
    };
  }
}

export type DialogueResolution =
  | {
      readonly state: GameState;
      readonly events: readonly TurnEvent[];
    }
  | {
      readonly illegal: true;
      readonly reason: string;
    };

export type QuestOfferHook = (context: {
  readonly state: GameState;
  readonly npcId: EntityId;
  readonly questHookId: string;
}) => GameState;

let questOfferHook: QuestOfferHook = ({ state }) => state;

export const registerQuestOfferHook = (hook: QuestOfferHook): (() => void) => {
  const previous = questOfferHook;
  questOfferHook = hook;

  return () => {
    if (questOfferHook === hook) {
      questOfferHook = previous;
    }
  };
};

export const getCurrentDialogueNode = (
  state: GameState,
): { readonly npc: NpcEntityInstance; readonly node: DialogueNode } | null => {
  const conversation = getActiveConversation(state);

  if (conversation === null) {
    return null;
  }

  const npc = state.entities[conversation.npcId];

  if (npc?.kind !== "npc") {
    return null;
  }

  const node = findDialogueNode(npc.definition.dialogue, conversation.nodeId);

  return node === null ? null : { npc, node };
};

export const openConversation = (
  state: GameState,
  npcId: EntityId,
): DialogueResolution => {
  const npc = state.entities[npcId];

  if (npc?.kind !== "npc") {
    return illegal(`npc ${npcId} does not exist`);
  }

  if (getActiveConversation(state) !== null) {
    return illegal("a conversation is already active");
  }

  const rootNodeId = npc.definition.dialogue.rootNodeId;
  const nextState = withNpcDialogueRuntime(state, npcId, {
    [ACTIVE_NODE_KEY]: rootNodeId,
    [BARTER_OPEN_KEY]: false,
  });

  return {
    state: nextState,
    events: [
      dialogueEvent(state, "dialogue_opened", {
        npcId,
        nodeId: rootNodeId,
      }),
    ],
  };
};

export const resolveTalkAction: ActionResolver<TalkAction> = (
  state,
  action,
): ActionResolverResult => openConversation(state, action.npcId);

export const resolveEndConversation = (state: GameState): DialogueResolution => {
  const conversation = getActiveConversation(state);

  if (conversation === null) {
    return illegal("no active conversation");
  }

  return closeConversation(state, conversation.npcId);
};

export const resolveDialogueChoice = (
  state: GameState,
  choiceId: string,
): DialogueResolution => {
  const current = getCurrentDialogueNode(state);

  if (current === null) {
    return illegal("no active conversation");
  }

  const choice = current.node.choices.find((candidate) => candidate.id === choiceId);

  if (choice === undefined) {
    return illegal(`unknown dialogue choice ${choiceId}`);
  }

  let nextState = state;
  const events: TurnEvent[] = [
    dialogueEvent(state, "dialogue_choice_selected", {
      npcId: current.npc.id,
      choiceId,
      nodeId: current.node.id,
    }),
  ];

  const flag = parseFlagConsequence(choice);
  if (flag !== null) {
    nextState = setDialogueFlag(nextState, current.npc.id, flag);
    events.push(
      dialogueEvent(state, "dialogue_flag_set", {
        npcId: current.npc.id,
        flag,
      }),
    );
  }

  if (parseBarterConsequence(choice)) {
    nextState = openBarterState(nextState, current.npc);
    events.push(
      dialogueEvent(state, "barter_opened", {
        npcId: current.npc.id,
      }),
    );
  }

  if (choice.questHookId !== null) {
    nextState = questOfferHook({
      state: nextState,
      npcId: current.npc.id,
      questHookId: choice.questHookId,
    });
    events.push(
      dialogueEvent(state, "quest_offer_hook", {
        npcId: current.npc.id,
        questHookId: choice.questHookId,
      }),
    );
  }

  if (choice.nextNodeId !== null) {
    const node = findDialogueNode(current.npc.definition.dialogue, choice.nextNodeId);

    if (node === null) {
      return illegal(`dialogue node ${choice.nextNodeId} does not exist`);
    }

    nextState = withNpcDialogueRuntime(nextState, current.npc.id, {
      [ACTIVE_NODE_KEY]: choice.nextNodeId,
    });
  }

  if (choice.closesDialogue || choice.nextNodeId === null) {
    const closed = closeConversation(nextState, current.npc.id);

    if ("illegal" in closed) {
      return closed;
    }

    return {
      state: closed.state,
      events: [...events, ...closed.events],
    };
  }

  return {
    state: nextState,
    events,
  };
};

export const freezeTurnCount = (state: GameState, turn: number): GameState => ({
  ...state,
  run: {
    ...state.run,
    turn,
  },
});

export const dialogueTurnHooks = (): TurnHooks => ({
  actorTurn: ({ state, actor }) =>
    isWorldPaused(state) && actor.kind === "enemy" ? state : state,
  ticks: {
    damageOverTime: ({ state }) => (isWorldPaused(state) ? state : state),
    durations: ({ state }) => (isWorldPaused(state) ? state : state),
    hunger: ({ state }) => (isWorldPaused(state) ? state : state),
    regen: ({ state }) => (isWorldPaused(state) ? state : state),
  },
});

export const stepWithDialoguePause = (
  state: GameState,
  action: PlayerAction,
  options: StepOptions = {},
): StepResult => {
  const turnBefore = state.run.turn;
  const mergedHooks = mergeDialogueHooks(options.hooks);
  const result = step(state, action, { ...options, hooks: mergedHooks });

  if (shouldFreezeTurn(state, result.state, action)) {
    return {
      ...result,
      state: freezeTurnCount(result.state, turnBefore),
    };
  }

  return result;
};

export const registerNpcDialogueHooks = (): (() => void) =>
  registerActionResolver("talk", resolveTalkAction);

export const unregisterNpcDialogueHooks = registerNpcDialogueHooks();

const shouldFreezeTurn = (
  before: GameState,
  after: GameState,
  action: PlayerAction,
): boolean =>
  isWorldPaused(before) || isWorldPaused(after) || action.kind === "talk";

const mergeDialogueHooks = (hooks: TurnHooks | undefined): TurnHooks => {
  return {
    actorTurn: ({ state, actor, action }) => {
      if (isWorldPaused(state) && actor.kind === "enemy") {
        return state;
      }

      return hooks?.actorTurn?.({ state, actor, action }) ?? state;
    },
    ticks: {
      damageOverTime: (context) =>
        isWorldPaused(context.state)
          ? context.state
          : (hooks?.ticks?.damageOverTime?.(context) ?? context.state),
      durations: (context) =>
        isWorldPaused(context.state)
          ? context.state
          : (hooks?.ticks?.durations?.(context) ?? context.state),
      hunger: (context) =>
        isWorldPaused(context.state)
          ? context.state
          : (hooks?.ticks?.hunger?.(context) ?? context.state),
      regen: (context) =>
        isWorldPaused(context.state)
          ? context.state
          : (hooks?.ticks?.regen?.(context) ?? context.state),
    },
  };
};

const closeConversation = (
  state: GameState,
  npcId: EntityId,
): DialogueResolution => {
  const npc = state.entities[npcId];

  if (npc?.kind !== "npc") {
    return illegal(`npc ${npcId} does not exist`);
  }

  return {
    state: withNpcDialogueRuntime(state, npcId, {
      [ACTIVE_NODE_KEY]: "",
      [BARTER_OPEN_KEY]: false,
    }),
    events: [
      dialogueEvent(state, "dialogue_ended", {
        npcId,
      }),
    ],
  };
};

const openBarterState = (state: GameState, npc: NpcEntityInstance): GameState => {
  const runtime = readDialogueRuntime(npc);
  const stock =
    runtime[MERCHANT_STOCK_KEY] ??
    [...npc.definition.merchantInventoryItemIds];

  return withNpcDialogueRuntime(state, npc.id, {
    [BARTER_OPEN_KEY]: true,
    [MERCHANT_STOCK_KEY]: stock,
  });
};

const setDialogueFlag = (
  state: GameState,
  npcId: EntityId,
  flag: string,
): GameState => {
  const npc = state.entities[npcId];

  if (npc?.kind !== "npc") {
    return state;
  }

  const runtime = readDialogueRuntime(npc);
  const existing = runtime[DIALOGUE_FLAGS_KEY] ?? {};

  return withNpcDialogueRuntime(state, npcId, {
    [DIALOGUE_FLAGS_KEY]: {
      ...existing,
      [flag]: true,
    },
  });
};

const findDialogueNode = (
  tree: DialogueTree,
  nodeId: string,
): DialogueNode | null =>
  tree.nodes.find((node) => node.id === nodeId) ?? null;

const parseFlagConsequence = (choice: DialogueChoice): string | null => {
  const prefix = "flag:";

  return choice.id.startsWith(prefix) ? choice.id.slice(prefix.length) : null;
};

const parseBarterConsequence = (choice: DialogueChoice): boolean =>
  choice.id === "barter" || choice.id.startsWith("barter:");

const dialogueEvent = <Type extends keyof EngineLogEventDataByType>(
  state: GameState,
  type: Type,
  data: EngineLogEventDataByType[Type],
): TurnEvent =>
  ({
    turn: state.run.turn,
    type,
    data,
  }) as TurnEvent;

const illegal = (reason: string): DialogueResolution => ({
  illegal: true,
  reason,
});
