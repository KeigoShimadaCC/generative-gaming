import { bounds, config } from "../../config/index.js";
import type { QuestDefinition } from "../../schemas/entities/index.js";
import type { QuestDefinition as QuestDefinitionWithReward } from "../../schemas/entities/quests.js";
import { itemValueBoundsForBand } from "../../schemas/entities/items.js";
import { withIdentifiedDefinition } from "../items/identify.js";
import { registerQuestOfferHook } from "../npc/dialogue.js";
import { addToInventory } from "../systems/inventory.js";
import type {
  EntityId,
  GameState,
  PlayerItemStack,
  QuestRuntime,
} from "../state/index.js";
import type { TurnEvent } from "../turn/index.js";
import {
  questDefinitionForHook,
  questProgressRecord,
  readQuestProgress,
  type QuestItemCatalog,
  type QuestOperationResult,
  type QuestProgress,
} from "./types.js";

export type { QuestItemCatalog } from "./types.js";

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly quest_offered: {
      readonly questId: string;
      readonly npcId: EntityId;
    };
    readonly quest_accepted: {
      readonly questId: string;
      readonly npcId: EntityId | null;
    };
    readonly quest_refused: {
      readonly questId: string;
      readonly npcId: EntityId | null;
    };
    readonly quest_completed: {
      readonly questId: string;
      readonly rewardCoin: number | null;
    };
    readonly quest_failed: {
      readonly questId: string;
      readonly reason: string;
    };
    readonly quest_reward_paid: {
      readonly questId: string;
      readonly coin: number;
      readonly itemDefinitionIds: readonly string[];
      readonly identifyDefinitionIds: readonly string[];
    };
    readonly quest_reward_forfeited: {
      readonly questId: string;
      readonly coin: number;
      readonly reason: "inventory_full";
    };
  }
}

export const questsAcceptedThisRun = (state: GameState): number =>
  state.quests.activeQuestIds.length +
  state.quests.completedQuestIds.length +
  state.quests.failedQuestIds.length;

export const activeQuestsInBand = (
  state: GameState,
  band: GameState["run"]["band"],
): readonly string[] =>
  state.quests.activeQuestIds.filter((questId) => {
    const runtime = state.quests.quests[questId];

    if (runtime === undefined) {
      return false;
    }

    const progress = readQuestProgress(runtime.progress);

    return progress.acceptedAtBand === band;
  });

type QuestReward = QuestDefinitionWithReward["reward"];

export const isRewardWithinBounds = (reward: QuestReward): boolean => {
  const multiplierBounds = config.itemsEconomy.questRewardValueMultiplier;

  if (
    reward.valueMultiplier < multiplierBounds.min ||
    reward.valueMultiplier > multiplierBounds.max
  ) {
    return false;
  }

  if (bounds.itemsEconomy.questRewards.statUpsAllowed) {
    return false;
  }

  if (bounds.itemsEconomy.questRewards.ruleBreaksAllowed) {
    return false;
  }

  return true;
};

export const offerQuest = (
  state: GameState,
  definition: QuestDefinition,
  npcId: EntityId,
): QuestOperationResult => {
  if (state.quests.quests[definition.id] !== undefined) {
    return illegal(`quest ${definition.id} is already tracked`);
  }

  if (questsAcceptedThisRun(state) >= config.trapsNpcsQuests.quests.maxPerRun) {
    return illegal("run quest cap reached");
  }

  const progress: QuestProgress = {
    offeredByNpcId: npcId,
    offeredAtDepth: state.run.depth,
    offeredAtBand: state.run.band,
    trackedDepth: state.run.depth,
  };

  const nextState = withQuestRuntime(state, definition.id, {
    definition,
    status: "available",
    progress: questProgressRecord(progress),
  });

  return {
    state: nextState,
    events: [questEvent(state, "quest_offered", { questId: definition.id, npcId })],
  };
};

export const acceptQuest = (
  state: GameState,
  questId: string,
): QuestOperationResult => {
  const runtime = state.quests.quests[questId];

  if (runtime === undefined) {
    return illegal(`unknown quest ${questId}`);
  }

  if (runtime.status !== "available") {
    return illegal(`quest ${questId} is not available`);
  }

  if (questsAcceptedThisRun(state) >= config.trapsNpcsQuests.quests.maxPerRun) {
    return illegal("run quest cap reached");
  }

  if (
    activeQuestsInBand(state, state.run.band).length >=
    bounds.trapsNpcsQuests.quests.activePerFloorBandMax
  ) {
    return illegal("an active quest already occupies this floor band");
  }

  const progress = readQuestProgress(runtime.progress);
  const nextProgress: QuestProgress = {
    ...progress,
    acceptedAtDepth: state.run.depth,
    acceptedAtBand: state.run.band,
    trackedDepth: state.run.depth,
    floorFlags: {
      hpAtFloorStart: state.player.hp.current,
      damageTaken: false,
      playerKills: 0,
    },
  };

  let nextState = withQuestAccepted(state, questId, {
    ...runtime,
    status: "active",
    progress: questProgressRecord(nextProgress),
  });
  nextState = bindEscortWardOnAccept(nextState, runtime.definition);

  return {
    state: nextState,
    events: [
      questEvent(state, "quest_accepted", {
        questId,
        npcId: progress.offeredByNpcId ?? null,
      }),
    ],
  };
};

export const refuseQuest = (
  state: GameState,
  questId: string,
): QuestOperationResult => {
  const runtime = state.quests.quests[questId];

  if (runtime === undefined) {
    return illegal(`unknown quest ${questId}`);
  }

  if (runtime.status !== "available") {
    return illegal(`quest ${questId} is not available`);
  }

  const progress = readQuestProgress(runtime.progress);
  const remainingQuests = Object.fromEntries(
    Object.entries(state.quests.quests).filter(([id]) => id !== questId),
  );

  return {
    state: {
      ...state,
      quests: {
        ...state.quests,
        quests: remainingQuests,
      },
    },
    events: [
      questEvent(state, "quest_refused", {
        questId,
        npcId: progress.offeredByNpcId ?? null,
      }),
    ],
  };
};

export const completeQuest = (
  state: GameState,
  questId: string,
  catalog: QuestItemCatalog,
): QuestOperationResult => {
  const runtime = state.quests.quests[questId];

  if (runtime === undefined || runtime.status !== "active") {
    return illegal(`quest ${questId} is not active`);
  }

  if (!isRewardWithinBounds(runtime.definition.reward)) {
    return illegal(`quest ${questId} reward is out of bounds`);
  }

  const paid = payQuestReward(state, questId, runtime.definition.reward, catalog);

  if ("illegal" in paid) {
    return paid;
  }

  const paidCoin = paid.events.find((event) => event.type === "quest_reward_paid")
    ?.data.coin ?? null;
  const nextState = withQuestCompleted(paid.state, questId, runtime);

  return {
    state: nextState,
    events: [
      ...paid.events,
      questEvent(state, "quest_completed", {
        questId,
        rewardCoin: paidCoin === null || paidCoin <= 0 ? null : paidCoin,
      }),
    ],
  };
};

export const failQuest = (
  state: GameState,
  questId: string,
  reason: string,
): QuestOperationResult => {
  const runtime = state.quests.quests[questId];

  if (runtime === undefined || runtime.status !== "active") {
    return illegal(`quest ${questId} is not active`);
  }

  const nextState = withQuestFailed(state, questId, runtime);

  return {
    state: nextState,
    events: [
      questEvent(state, "quest_failed", {
        questId,
        reason,
      }),
    ],
  };
};

export const payQuestReward = (
  state: GameState,
  questId: string,
  reward: QuestReward,
  catalog: QuestItemCatalog,
): QuestOperationResult => {
  if (!isRewardWithinBounds(reward)) {
    return illegal(`quest ${questId} reward is out of bounds`);
  }

  let nextState = state;
  const events: TurnEvent[] = [];
  let coinPaid = 0;
  let coinForfeited = 0;
  const itemDefinitionIds: string[] = [];
  const identifyDefinitionIds: string[] = [];

  if (reward.coin !== null && reward.coin > 0) {
    const coinStack: PlayerItemStack = {
      itemInstanceId: `quest-reward-coin-${questId}`,
      definition: catalog.coinDefinition,
      quantity: reward.coin,
      identified: true,
    };
    const credited = addToInventory(nextState, coinStack);

    if ("illegal" in credited) {
      coinForfeited = reward.coin;
    } else {
      nextState = credited.state;
      coinPaid = reward.coin;
    }
  }

  for (const definitionId of reward.itemIds) {
    const definition = catalog.resolve(definitionId);

    if (definition === null) {
      return illegal(`unknown reward item ${definitionId}`);
    }

    const stack: PlayerItemStack = {
      itemInstanceId: `quest-reward-${questId}-${definitionId}`,
      definition,
      quantity: 1,
      identified: !["draught", "note", "charm"].includes(definition.kind),
    };
    const added = addToInventory(nextState, stack);

    if ("illegal" in added) {
      return added;
    }

    nextState = added.state;
    itemDefinitionIds.push(definitionId);
  }

  for (const definitionId of reward.identifyItemIds) {
    const definition = catalog.resolve(definitionId);

    if (definition === null) {
      return illegal(`unknown identify reward ${definitionId}`);
    }

    nextState = withIdentifiedDefinition(nextState, definitionId);
    identifyDefinitionIds.push(definitionId);
  }

  events.push(
    questEvent(state, "quest_reward_paid", {
      questId,
      coin: coinPaid,
      itemDefinitionIds,
      identifyDefinitionIds,
    }),
  );

  if (coinForfeited > 0) {
    events.push(
      questEvent(state, "quest_reward_forfeited", {
        questId,
        coin: coinForfeited,
        reason: "inventory_full",
      }),
    );
  }

  return { state: nextState, events };
};

export const resolveQuestOfferFromDialogue = ({
  state,
  npcId,
  questHookId,
}: {
  readonly state: GameState;
  readonly npcId: EntityId;
  readonly questHookId: string;
}): GameState => {
  const npc = state.entities[npcId];

  if (npc?.kind !== "npc") {
    return state;
  }

  const definition = questDefinitionForHook(npc.definition.questHook, questHookId);

  if (definition === null) {
    return state;
  }

  const offered = offerQuest(state, definition, npcId);

  return "illegal" in offered ? state : offered.state;
};

export const registerQuestOfferDialogueHook = (): (() => void) =>
  registerQuestOfferHook(resolveQuestOfferFromDialogue);

export const rewardValueBandForQuest = (
  state: GameState,
  reward: QuestReward,
): { readonly min: number; readonly max: number } => {
  const band = state.run.band;
  const bandValue = itemValueBoundsForBand(band);

  return {
    min: Math.round(bandValue.min * reward.valueMultiplier),
    max: Math.round(bandValue.max * reward.valueMultiplier),
  };
};

const withQuestRuntime = (
  state: GameState,
  questId: string,
  runtime: QuestRuntime,
): GameState => ({
  ...state,
  quests: {
    ...state.quests,
    quests: {
      ...state.quests.quests,
      [questId]: runtime,
    },
  },
});

const withQuestAccepted = (
  state: GameState,
  questId: string,
  runtime: QuestRuntime,
): GameState => ({
  ...state,
  quests: {
    ...state.quests,
    quests: {
      ...state.quests.quests,
      [questId]: runtime,
    },
    activeQuestIds: mergeUnique(state.quests.activeQuestIds, questId),
  },
});

const withQuestCompleted = (
  state: GameState,
  questId: string,
  runtime: QuestRuntime,
): GameState => ({
  ...state,
  quests: {
    ...state.quests,
    quests: {
      ...state.quests.quests,
      [questId]: {
        ...runtime,
        status: "completed",
      },
    },
    activeQuestIds: state.quests.activeQuestIds.filter((id) => id !== questId),
    completedQuestIds: mergeUnique(state.quests.completedQuestIds, questId),
  },
});

const withQuestFailed = (
  state: GameState,
  questId: string,
  runtime: QuestRuntime,
): GameState => ({
  ...state,
  quests: {
    ...state.quests,
    quests: {
      ...state.quests.quests,
      [questId]: {
        ...runtime,
        status: "failed",
      },
    },
    activeQuestIds: state.quests.activeQuestIds.filter((id) => id !== questId),
    failedQuestIds: mergeUnique(state.quests.failedQuestIds, questId),
  },
});

const mergeUnique = (
  values: readonly string[],
  value: string,
): readonly string[] => (values.includes(value) ? values : [...values, value]);

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

const illegal = (reason: string): QuestIllegal => ({
  illegal: true,
  reason,
});

type QuestIllegal = Extract<QuestOperationResult, { readonly illegal: true }>;

const bindEscortWardOnAccept = (
  state: GameState,
  definition: QuestDefinition,
): GameState => {
  if (definition.objective.kind !== "escort") {
    return state;
  }

  const npcDefinitionId = definition.objective.escort?.npcId;

  if (npcDefinitionId === undefined) {
    return state;
  }

  const ward = Object.values(state.entities).find(
    (entity) =>
      entity.kind === "npc" && entity.definition.id === npcDefinitionId,
  );

  if (ward?.kind !== "npc") {
    return state;
  }

  const runtime = state.quests.quests[definition.id];

  if (runtime === undefined) {
    return state;
  }

  return {
    ...state,
    quests: {
      ...state.quests,
      quests: {
        ...state.quests.quests,
        [definition.id]: {
          ...runtime,
          progress: questProgressRecord({
            ...readQuestProgress(runtime.progress),
            escortWardEntityId: ward.id,
            trackedDepth: state.run.depth,
          }),
        },
      },
    },
  };
};
