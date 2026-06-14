import { afterAll, describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import type { ItemDefinition } from "../../schemas/entities/index.js";
import { validFoodItemFixture } from "../../schemas/fixtures/entities.js";
import {
  createInitialState,
  type GameState,
  type InventorySlot,
  type PlayerItemStack,
} from "../state/index.js";
import {
  acceptQuest,
  completeQuest,
  isRewardWithinBounds,
  offerQuest,
  payQuestReward,
  questsAcceptedThisRun,
  refuseQuest,
  unregisterQuestHooks,
} from "./index.js";
import { fetchQuest, testCatalog } from "./fixtures.js";

afterAll(() => {
  unregisterQuestHooks();
});

describe("quest machine caps and memory", () => {
  it("refuses a fourth quest acceptance in the same run", () => {
    let state = createInitialState("quest-cap");

    for (let index = 0; index < 3; index += 1) {
      const definition = {
        ...fetchQuest(`key-${index}`),
        id: `quest-${index}`,
        title: `Quest ${index}`,
      };
      const offered = offerQuest(state, definition, "npc#1");

      if ("illegal" in offered) {
        throw new Error(offered.reason);
      }

      const accepted = acceptQuest(offered.state, definition.id);

      if ("illegal" in accepted) {
        throw new Error(accepted.reason);
      }

      const completed = completeQuest(accepted.state, definition.id, testCatalog());

      if ("illegal" in completed) {
        throw new Error(completed.reason);
      }

      state = completed.state;
    }

    expect(questsAcceptedThisRun(state)).toBe(3);

    const fourth = offerQuest(state, fetchQuest("quest-4"), "npc#1");

    expect("illegal" in fourth).toBe(true);
  });

  it("enforces one active quest per floor band", () => {
    const definitionA = { ...fetchQuest("key-a"), id: "quest-a", title: "Quest A" };
    const definitionB = { ...fetchQuest("key-b"), id: "quest-b", title: "Quest B" };
    const offeredA = offerQuest(createInitialState("quest-band"), definitionA, "npc#1");

    if ("illegal" in offeredA) {
      throw new Error(offeredA.reason);
    }

    const acceptedA = acceptQuest(offeredA.state, definitionA.id);

    if ("illegal" in acceptedA) {
      throw new Error(acceptedA.reason);
    }

    const offeredB = offerQuest(acceptedA.state, definitionB, "npc#2");

    if ("illegal" in offeredB) {
      throw new Error(offeredB.reason);
    }

    const acceptedB = acceptQuest(offeredB.state, definitionB.id);

    expect("illegal" in acceptedB).toBe(true);
    expect(
      bounds.trapsNpcsQuests.quests.activePerFloorBandMax,
    ).toBe(1);
  });

  it("emits a quest_refused memory event", () => {
    const definition = fetchQuest("quest-refuse");
    const offered = offerQuest(createInitialState("quest-refuse"), definition, "npc#1");

    if ("illegal" in offered) {
      throw new Error(offered.reason);
    }

    const refused = refuseQuest(offered.state, definition.id);

    if ("illegal" in refused) {
      throw new Error(refused.reason);
    }

    expect(refused.events).toContainEqual({
      turn: 0,
      type: "quest_refused",
      data: {
        questId: definition.id,
        npcId: "npc#1",
      },
    });
    expect(refused.state.quests.quests[definition.id]).toBeUndefined();
  });
});

describe("quest rewards", () => {
  it("accepts rewards within configured bounds and pays coin only", () => {
    const reward = {
      valueMultiplier: config.itemsEconomy.questRewardValueMultiplier.min,
      coin: 12,
      itemIds: [],
      identifyItemIds: [],
    };

    expect(isRewardWithinBounds(reward)).toBe(true);

    const paid = payQuestReward(
      createInitialState("quest-reward"),
      "quest-reward",
      reward,
      testCatalog(),
    );

    if ("illegal" in paid) {
      throw new Error(paid.reason);
    }

    const coinTotal = paid.state.player.inventory.reduce(
      (total, slot) =>
        slot?.definition.kind === "coin" ? total + slot.quantity : total,
      0,
    );

    expect(coinTotal).toBe(12);
    expect(paid.events.map((event) => event.type)).toContain("quest_reward_paid");
  });

  it("rejects out-of-bounds reward multipliers", () => {
    expect(
      isRewardWithinBounds({
        valueMultiplier:
          config.itemsEconomy.questRewardValueMultiplier.max + 0.1,
        coin: 1,
        itemIds: [],
        identifyItemIds: [],
      }),
    ).toBe(false);
  });

  it("completes and logs forfeited coin when the reward cannot fit the pack", () => {
    const definition = fetchQuest("quest-full-pack");
    const offered = offerQuest(
      withInventory(createInitialState("quest-full-pack"), fullInventory()),
      definition,
      "npc#1",
    );

    if ("illegal" in offered) {
      throw new Error(offered.reason);
    }

    const accepted = acceptQuest(offered.state, definition.id);
    if ("illegal" in accepted) {
      throw new Error(accepted.reason);
    }

    const completed = completeQuest(accepted.state, definition.id, testCatalog());
    if ("illegal" in completed) {
      throw new Error(completed.reason);
    }

    expect(completed.state.quests.completedQuestIds).toContain(definition.id);
    expect(completed.state.quests.activeQuestIds).not.toContain(definition.id);
    expect(completed.events).toContainEqual({
      turn: 0,
      type: "quest_reward_forfeited",
      data: {
        questId: definition.id,
        coin: definition.reward.coin,
        reason: "inventory_full",
      },
    });
    expect(completed.events).toContainEqual({
      turn: 0,
      type: "quest_completed",
      data: {
        questId: definition.id,
        rewardCoin: null,
      },
    });
  });
});

const withInventory = (
  state: GameState,
  inventory: readonly InventorySlot[],
): GameState => ({
  ...state,
  player: {
    ...state.player,
    inventory,
  },
});

const fullInventory = (): readonly InventorySlot[] =>
  Array.from({ length: config.playerCharacter.inventory.slots }, (_, index) =>
    carried(`filler-${index}`, itemDefinition(`filler-${index}`), 1),
  );

const carried = (
  itemInstanceId: string,
  definition: ItemDefinition,
  quantity: number,
): PlayerItemStack => ({
  itemInstanceId,
  definition,
  quantity,
  identified: true,
});

const itemDefinition = (id: string): ItemDefinition => ({
  ...validFoodItemFixture,
  id,
  value: { band: "shallows", coin: config.itemsEconomy.valueBandsCoin.shallows.min },
});
