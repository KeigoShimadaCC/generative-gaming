import type { GameState } from "../state/index.js";
import {
  step,
  type StepOptions,
  type StepResult,
  type TurnHooks,
} from "../turn/index.js";
import { registerQuestOfferDialogueHook } from "./machine.js";
import {
  processQuestAfterPlayerAction,
  processQuestEndOfTurn,
  questTurnHooks,
  registerQuestLootDropHook,
  setQuestItemCatalog,
} from "./objectives.js";
import type { QuestItemCatalog } from "./types.js";

export { buildQuestLog, type QuestLogEntry, type QuestLogState } from "./log.js";
export {
  acceptQuest,
  activeQuestsInBand,
  isRewardWithinBounds,
  offerQuest,
  payQuestReward,
  questsAcceptedThisRun,
  refuseQuest,
  completeQuest,
  failQuest,
  rewardValueBandForQuest,
} from "./machine.js";
export {
  deliverQuestItem,
  onEnemyKilledForQuests,
  processQuestAfterPlayerAction,
  processQuestEndOfTurn,
  questTurnHooks,
  setQuestItemCatalog,
} from "./objectives.js";
export type {
  QuestItemCatalog,
  QuestOperationResult,
  QuestProgress,
} from "./types.js";

export const configureQuestCatalog = (catalog: QuestItemCatalog): void => {
  setQuestItemCatalog(catalog);
};

export const mergeQuestTurnHooks = (hooks: TurnHooks = {}): TurnHooks => {
  const questHooks = questTurnHooks();

  return {
    actorTurn: ({ state, actor, action }) => {
      const questResult = normalizeHook(questHooks.actorTurn?.({ state, actor, action }) ?? state);
      const merged = normalizeHook(
        hooks.actorTurn?.({ state: questResult.state, actor, action }) ?? questResult.state,
      );

      return {
        state: merged.state,
        events: [...questResult.events, ...merged.events],
      };
    },
    ticks: {
      damageOverTime: (context) =>
        hooks.ticks?.damageOverTime?.(context) ?? context.state,
      durations: (context) => hooks.ticks?.durations?.(context) ?? context.state,
      hunger: (context) => hooks.ticks?.hunger?.(context) ?? context.state,
      regen: (context) => {
        const questResult = normalizeHook(processQuestEndOfTurn(context.state));
        const merged = normalizeHook(
          hooks.ticks?.regen?.({
            ...context,
            state: questResult.state,
          }) ?? questResult.state,
        );

        return {
          state: merged.state,
          events: [...questResult.events, ...merged.events],
        };
      },
    },
  };
};

export const stepWithQuests = (
  state: GameState,
  action: Parameters<typeof step>[1],
  options: StepOptions = {},
): StepResult => {
  const result = step(state, action, {
    ...options,
    hooks: mergeQuestTurnHooks(options.hooks),
  });

  const questProcessed = processQuestAfterPlayerAction(result.state, result.events);

  return {
    ...result,
    state: questProcessed.state,
    events: [...result.events, ...questProcessed.events],
  };
};

export const registerQuestHooks = (): (() => void) => {
  const unregisterOffer = registerQuestOfferDialogueHook();
  const unregisterLoot = registerQuestLootDropHook();

  return () => {
    unregisterLoot();
    unregisterOffer();
  };
};

export const unregisterQuestHooks = registerQuestHooks();

const normalizeHook = (
  result: GameState | { readonly state: GameState; readonly events?: readonly unknown[] },
): { readonly state: GameState; readonly events: readonly never[] } => {
  if (typeof result === "object" && result !== null && "state" in result) {
    return {
      state: result.state,
      events: (result.events ?? []) as readonly never[],
    };
  }

  return {
    state: result,
    events: [],
  };
};
