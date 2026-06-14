import { describe, expect, it } from "vitest";

import { config } from "../../config/index.js";
import type { ItemDefinition, NpcDefinition } from "../../schemas/entities/index.js";
import {
  validCoinItemFixture,
  validFoodItemFixture,
  validNpcDefinitionFixture,
  validWeaponItemFixture,
} from "../../schemas/fixtures/entities.js";
import {
  createFloorGeometrySlot,
  createTileGrid,
  type TileGrid,
} from "../map/index.js";
import { createRng } from "../rng/index.js";
import {
  createInitialState,
  type EntityId,
  type GameState,
  type InventorySlot,
  type PlayerItemStack,
  type Position,
} from "../state/index.js";
import {
  buyFromMerchant,
  countPlayerCoinValue,
  computePlayerWealth,
  merchantBuyPrice,
  merchantSellPrice,
  openConversation,
  resolveDialogueChoice,
  sellToMerchant,
  type BarterCatalog,
} from "./index.js";

describe("barter pricing", () => {
  it("uses configured merchant multipliers", () => {
    const state = fixtureState();
    const base = 20;

    expect(merchantBuyPrice(base)).toBe(
      Math.round(base * config.itemsEconomy.merchantMultipliers.buy),
    );
    expect(merchantSellPrice(state, "npc#1", "weapon-1", base)).toBe(
      Math.round(base * sellMultiplierForFixture(state, "npc#1", "weapon-1")),
    );
  });
});

describe("barter transactions", () => {
  it("buys stock from the merchant when the player has coin and space", () => {
    const weapon = itemDefinition("weapon-1", validWeaponItemFixture, 20);
    const state = barterReady({
      coinQuantity: 100,
      stock: ["weapon-1"],
      catalog: catalogFrom({ "weapon-1": weapon }),
    });
    const result = expectBarter(buyFromMerchant(state, catalogFrom({ "weapon-1": weapon }), "weapon-1"));

    expect(result.state.player.inventory.some((slot) => slot?.definition.id === "weapon-1")).toBe(
      true,
    );
    expect(
      (result.state.entities["npc#1"] as { dialogueRuntime: { merchantStockIds?: string[] } })
        .dialogueRuntime.merchantStockIds,
    ).toEqual([]);
  });

  it("refuses buys without enough coin or inventory space", () => {
    const weapon = itemDefinition("weapon-1", validWeaponItemFixture, 20);
    const catalog = catalogFrom({ "weapon-1": weapon });
    const poor = barterReady({ coinQuantity: 1, stock: ["weapon-1"], catalog });
    const broke = expectRefusal(buyFromMerchant(poor, catalog, "weapon-1"));

    expect(broke.reason).toBe("insufficient_coin");
    expect(broke.message).toBe("You don't have enough coin.");

    const full = barterReady({
      coinQuantity: 50,
      stock: ["weapon-1"],
      catalog,
      inventory: fullInventory(),
    });
    const cramped = expectRefusal(buyFromMerchant(full, catalog, "weapon-1"));

    expect(cramped.reason).toBe("inventory_full");
    expect(cramped.message).toBe("Your pack is full.");
  });

  it("sells carried items back to the merchant", () => {
    const weapon = itemDefinition("weapon-1", validWeaponItemFixture, 20);
    const catalog = catalogFrom({ "weapon-1": weapon });
    let state = barterReady({ coinQuantity: 0, stock: [], catalog });
    state = withInventoryItem(state, carried("weapon#1", weapon, 1));
    const result = expectBarter(sellToMerchant(state, catalog, "weapon#1"));

    expect(computePlayerWealth(result.state)).toBe(merchantBuyPrice(20));
    expect(
      (result.state.entities["npc#1"] as { dialogueRuntime: { merchantStockIds?: string[] } })
        .dialogueRuntime.merchantStockIds,
    ).toEqual(["weapon-1"]);
  });

  it.each([4, 7, 26])(
    "credits exact sell price %i with 5-value coin denominations",
    (price) => {
      const definition = itemDefinition(
        `sell-price-${price}`,
        validWeaponItemFixture,
        price * 2,
      );
      const catalog = catalogFrom({ [definition.id]: definition });
      let state = barterReady({ coinQuantity: 0, stock: [], catalog });
      state = withInventoryItem(state, carried(`${definition.id}#1`, definition, 1));

      const result = expectBarter(
        sellToMerchant(state, catalog, `${definition.id}#1`),
      );

      expect(merchantBuyPrice(definition.value.coin)).toBe(price);
      expect(countPlayerCoinValue(result.state)).toBe(price);
      expect(computePlayerWealth(result.state)).toBe(price);
    },
  );

  it.each([4, 7, 26])(
    "charges exact buy price %i and preserves change as credit",
    (price) => {
      const priced = merchantStockForBuyPrice(price);
      const catalog = catalogFrom({ [priced.definition.id]: priced.definition });
      const state = barterReady({
        coinQuantity: 30,
        stock: [priced.definition.id],
        catalog,
      });

      expect(
        merchantSellPrice(
          state,
          "npc#1",
          priced.definition.id,
          priced.definition.value.coin,
        ),
      ).toBe(price);

      const result = expectBarter(
        buyFromMerchant(state, catalog, priced.definition.id),
      );

      expect(countPlayerCoinValue(result.state)).toBe(30 - price);
    },
  );
});

describe("barter conservation", () => {
  it("never increases player wealth beyond multiplier spread over 500 seeded trades", () => {
    const weapon = itemDefinition("weapon-1", validWeaponItemFixture, 20);
    const food = itemDefinition("food-1", validFoodItemFixture, 10);
    const catalog = catalogFrom({ "weapon-1": weapon, "food-1": food });
    const rng = createRng("barter-conservation");
    let state = barterReady({
      coinQuantity: 500,
      stock: ["weapon-1", "food-1", "weapon-1", "food-1"],
      catalog,
    });
    const initialWealth = computePlayerWealth(state);
    const maxMarkup =
      config.itemsEconomy.merchantMultipliers.sell.max -
      config.itemsEconomy.merchantMultipliers.buy;

    for (let index = 0; index < 500; index += 1) {
      const op = rng.pick(["buy_weapon", "buy_food", "sell_weapon", "sell_food"] as const);
      const before = computePlayerWealth(state);

      if (op === "buy_weapon" || op === "buy_food") {
        const id = op === "buy_weapon" ? "weapon-1" : "food-1";
        const result = buyFromMerchant(state, catalog, id);

        if (!("refused" in result)) {
          state = result.state;
        }
      } else {
        const itemId = op === "sell_weapon" ? "weapon#1" : "food#1";
        const hasItem = state.player.inventory.some(
          (slot) => slot?.itemInstanceId === itemId,
        );

        if (hasItem) {
          const result = sellToMerchant(state, catalog, itemId);

          if (!("refused" in result)) {
            state = result.state;
          }
        }
      }

      const after = computePlayerWealth(state);
      const itemBase = op.includes("weapon") ? 20 : 10;

      if (after > before) {
        expect(after - before).toBeLessThanOrEqual(
          Math.round(itemBase * maxMarkup),
        );
      } else {
        expect(after).toBeLessThanOrEqual(before);
      }

      expect(after).toBeLessThanOrEqual(initialWealth);
    }
  });
});

const sellMultiplierForFixture = (
  state: GameState,
  npcId: EntityId,
  definitionId: string,
): number => {
  const basis = `${state.rng.rootSeed}|${npcId}|${definitionId}|sell`;
  let hash = 0;

  for (let index = 0; index < basis.length; index += 1) {
    hash = (hash * 31 + basis.charCodeAt(index)) >>> 0;
  }

  const { min, max } = config.itemsEconomy.merchantMultipliers.sell;
  const step = hash % 1_001;

  return min + (step / 1_000) * (max - min);
};

const barterReady = (options: {
  readonly coinQuantity: number;
  readonly stock: readonly string[];
  readonly catalog: BarterCatalog;
  readonly inventory?: readonly InventorySlot[];
}): GameState => {
  const npc: NpcDefinition = {
    ...validNpcDefinitionFixture,
    merchantInventoryItemIds: [...options.stock],
    dialogue: {
      rootNodeId: "root",
      nodes: [
        {
          id: "root",
          text: "Trade?",
          choices: [
            {
              id: "barter",
              label: "Trade",
              nextNodeId: "root",
              closesDialogue: false,
              questHookId: null,
            },
            {
              id: "leave-a",
              label: "A",
              nextNodeId: null,
              closesDialogue: true,
              questHookId: null,
            },
            {
              id: "leave-b",
              label: "B",
              nextNodeId: null,
              closesDialogue: true,
              questHookId: null,
            },
          ],
        },
      ],
    },
  };
  let state = withInventory(
    fixtureState(npc),
    coinStack(options.coinQuantity),
    options.inventory ?? emptySlots(15),
  );
  state = expectDialogue(openConversation(state, "npc#1")).state;
  return expectDialogue(resolveDialogueChoice(state, "barter")).state;
};

const catalogFrom = (
  definitions: Record<string, ItemDefinition>,
): BarterCatalog => ({
  resolve: (definitionId) => definitions[definitionId] ?? null,
  coinDefinition: coinDefinition(),
});

const coinDefinition = (): ItemDefinition => ({
  ...validCoinItemFixture,
  id: "coin",
  value: { band: "shallows", coin: 5 },
});

const coinStack = (coinValue: number): PlayerItemStack => {
  const definition = coinDefinition();
  const unit = definition.value.coin;

  return {
    itemInstanceId: "coin#1",
    definition,
    quantity: coinValue / unit,
    identified: true,
  };
};

const itemDefinition = (
  id: string,
  base: ItemDefinition,
  coin: number,
): ItemDefinition => ({
  ...base,
  id,
  value: { band: "shallows", coin },
});

const merchantStockForBuyPrice = (
  price: number,
): { readonly definition: ItemDefinition } => {
  for (let value = 1; value <= 200; value += 1) {
    for (let salt = 0; salt < 1_000; salt += 1) {
      const definition = itemDefinition(
        `buy-price-${price}-${value}-${salt}`,
        validFoodItemFixture,
        value,
      );
      const catalog = catalogFrom({ [definition.id]: definition });
      const state = barterReady({
        coinQuantity: 30,
        stock: [definition.id],
        catalog,
      });

      if (merchantSellPrice(state, "npc#1", definition.id, value) === price) {
        return { definition };
      }
    }
  }

  throw new Error(`no fixture item found for merchant sell price ${price}`);
};

const fixtureState = (definition = validNpcDefinitionFixture): GameState => ({
  ...withGrid(createInitialState("npc-barter"), createTileGrid({ width: 3, height: 3 }), {
    x: 1,
    y: 1,
  }),
  entities: {
    "npc#1": {
      id: "npc#1",
      kind: "npc",
      definition,
      position: { x: 1, y: 0 },
      currentHP: null,
      statuses: [],
      behaviorRuntime: {},
      dialogueRuntime: {},
    },
  },
});

const withGrid = (
  state: GameState,
  grid: TileGrid,
  position: Position,
): GameState => ({
  ...state,
  floor: {
    ...state.floor,
    geometry: createFloorGeometrySlot(state.floor.geometry.refId, grid),
  },
  player: {
    ...state.player,
    position,
  },
});

const withInventory = (
  state: GameState,
  coin: PlayerItemStack,
  slots: readonly InventorySlot[],
): GameState => ({
  ...state,
  player: {
    ...state.player,
    inventory: [coin, ...slots],
  },
});

const withInventoryItem = (state: GameState, stack: PlayerItemStack): GameState => ({
  ...state,
  player: {
    ...state.player,
    inventory: [stack, ...state.player.inventory.slice(1)],
  },
});

const emptySlots = (count: number): InventorySlot[] =>
  Array.from({ length: count }, () => null);

const fullInventory = (): InventorySlot[] =>
  Array.from({ length: 15 }, (_, index) =>
    carried(`filler-${index}`, itemDefinition(`f-${index}`, validFoodItemFixture, 5), 1),
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

const expectBarter = (
  result:
    | { readonly state: GameState }
    | { readonly refused: true; readonly reason: string; readonly message: string },
) => {
  if ("refused" in result) {
    throw new Error(`${result.reason}: ${result.message}`);
  }

  return result;
};

const expectRefusal = (
  result:
    | { readonly state: GameState }
    | { readonly refused: true; readonly reason: string; readonly message: string },
) => {
  if (!("refused" in result)) {
    throw new Error("expected refusal");
  }

  return result;
};

const expectDialogue = (
  result:
    | { readonly state: GameState }
    | { readonly illegal: true; readonly reason: string },
) => {
  if ("illegal" in result) {
    throw new Error(result.reason);
  }

  return result;
};
