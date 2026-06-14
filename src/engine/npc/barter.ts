import { config } from "../../config/index.js";
import type { ItemDefinition } from "../../schemas/entities/index.js";
import {
  addToInventory,
  canAddQuantityToInventory,
  findInventorySlotIndex,
  removeFromInventory,
  type InventoryOperationResult,
} from "../systems/inventory.js";
import type {
  EntityId,
  GameState,
  NpcEntityInstance,
  PlayerItemStack,
} from "../state/index.js";
import type { TurnEvent } from "../turn/index.js";
import {
  BARTER_CREDIT_KEY,
  getActiveConversation,
  isBarterOpen,
  readDialogueRuntime,
  sortedNpcs,
  withNpcDialogueRuntime,
} from "./runtime.js";

export type BarterCatalog = {
  readonly resolve: (definitionId: string) => ItemDefinition | null;
  readonly coinDefinition: ItemDefinition;
};

export type BarterRefusalReason =
  | "insufficient_coin"
  | "inventory_full"
  | "item_not_carried"
  | "item_not_in_stock"
  | "barter_closed"
  | "no_active_conversation";

export type BarterResolution =
  | {
      readonly state: GameState;
      readonly events: readonly TurnEvent[];
    }
  | {
      readonly refused: true;
      readonly reason: BarterRefusalReason;
      readonly message: string;
    };

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly barter_buy: {
      readonly npcId: EntityId;
      readonly definitionId: string;
      readonly price: number;
      readonly itemInstanceId: string;
    };
    readonly barter_sell: {
      readonly npcId: EntityId;
      readonly definitionId: string;
      readonly price: number;
      readonly itemInstanceId: string;
    };
  }
}

const INSUFFICIENT_COIN_MESSAGE = "You don't have enough coin.";
const INVENTORY_FULL_MESSAGE = "Your pack is full.";
const ITEM_NOT_CARRIED_MESSAGE = "That item isn't in your pack.";
const ITEM_NOT_IN_STOCK_MESSAGE = "The merchant doesn't have that.";
const BARTER_CLOSED_MESSAGE = "Barter isn't open.";
const NO_CONVERSATION_MESSAGE = "No one is trading with you.";

export const merchantBuyPrice = (baseValue: number): number =>
  Math.max(1, Math.round(baseValue * config.itemsEconomy.merchantMultipliers.buy));

export const merchantSellPrice = (
  state: GameState,
  npcId: EntityId,
  definitionId: string,
  baseValue: number,
): number => {
  const multiplier = sellMultiplierFor(state, npcId, definitionId);

  return Math.max(1, Math.round(baseValue * multiplier));
};

export const sellMultiplierFor = (
  state: GameState,
  npcId: EntityId,
  definitionId: string,
): number => {
  const { min, max } = config.itemsEconomy.merchantMultipliers.sell;
  const basis = `${state.rng.rootSeed}|${npcId}|${definitionId}|sell`;
  let hash = 0;

  for (let index = 0; index < basis.length; index += 1) {
    hash = (hash * 31 + basis.charCodeAt(index)) >>> 0;
  }

  const span = max - min;
  const step = hash % 1_001;
  const multiplier = min + (step / 1_000) * span;

  return Math.round(multiplier * 1_000) / 1_000;
};

export const countPlayerCoinValue = (state: GameState): number => {
  let total = 0;

  for (const slot of state.player.inventory) {
    if (slot === null || slot.definition.kind !== "coin") {
      continue;
    }

    total += slot.quantity * slot.definition.value.coin;
  }

  return total + countBarterCreditValue(state);
};

export const computePlayerWealth = (state: GameState): number => {
  let total = countPlayerCoinValue(state);

  for (const slot of state.player.inventory) {
    if (slot === null || slot.definition.kind === "coin") {
      continue;
    }

    total += slot.quantity * slot.definition.value.coin;
  }

  return total;
};

export const buyFromMerchant = (
  state: GameState,
  catalog: BarterCatalog,
  definitionId: string,
): BarterResolution => {
  const merchant = activeMerchant(state);

  if (merchant === null) {
    return refuse("no_active_conversation", NO_CONVERSATION_MESSAGE);
  }

  if (!isBarterOpen(state)) {
    return refuse("barter_closed", BARTER_CLOSED_MESSAGE);
  }

  const stock = merchantStock(merchant);
  const stockIndex = stock.indexOf(definitionId);

  if (stockIndex === -1) {
    return refuse("item_not_in_stock", ITEM_NOT_IN_STOCK_MESSAGE);
  }

  const definition = catalog.resolve(definitionId);

  if (definition === null) {
    return refuse("item_not_in_stock", ITEM_NOT_IN_STOCK_MESSAGE);
  }

  const price = merchantSellPrice(state, merchant.id, definitionId, definition.value.coin);

  if (countPlayerCoinValue(state) < price) {
    return refuse("insufficient_coin", INSUFFICIENT_COIN_MESSAGE);
  }

  if (!canAddQuantityToInventory(state.player.inventory, definition, 1)) {
    return refuse("inventory_full", INVENTORY_FULL_MESSAGE);
  }

  const paid = removeCoinValue(state, merchant.id, price);

  if ("refused" in paid) {
    return paid;
  }

  const stack: PlayerItemStack = {
    itemInstanceId: `${merchant.id}:${definitionId}:buy`,
    definition,
    quantity: 1,
    identified: true,
  };
  const added = addToInventory(paid.state, stack);

  if ("illegal" in added) {
    return refuse("inventory_full", INVENTORY_FULL_MESSAGE);
  }

  const nextStock = [...stock];
  nextStock.splice(stockIndex, 1);

  const nextState = withNpcDialogueRuntime(added.state, merchant.id, {
    merchantStockIds: nextStock,
  });

  return {
    state: nextState,
    events: [
      barterEvent(state, "barter_buy", {
        npcId: merchant.id,
        definitionId,
        price,
        itemInstanceId: stack.itemInstanceId,
      }),
    ],
  };
};

export const sellToMerchant = (
  state: GameState,
  catalog: BarterCatalog,
  itemInstanceId: string,
): BarterResolution => {
  const merchant = activeMerchant(state);

  if (merchant === null) {
    return refuse("no_active_conversation", NO_CONVERSATION_MESSAGE);
  }

  if (!isBarterOpen(state)) {
    return refuse("barter_closed", BARTER_CLOSED_MESSAGE);
  }

  const slotIndex = findInventorySlotIndex(state.player.inventory, itemInstanceId);

  if (slotIndex === null) {
    return refuse("item_not_carried", ITEM_NOT_CARRIED_MESSAGE);
  }

  const slot = state.player.inventory[slotIndex];

  if (slot === null || slot === undefined || slot.definition.kind === "coin") {
    return refuse("item_not_carried", ITEM_NOT_CARRIED_MESSAGE);
  }

  const soldItem = slot;
  const price = merchantBuyPrice(soldItem.definition.value.coin);
  const removed = removeFromInventory(state, itemInstanceId, 1);

  if ("illegal" in removed) {
    return refuse("item_not_carried", ITEM_NOT_CARRIED_MESSAGE);
  }

  const credited = addCoinValue(
    removed.state,
    merchant.id,
    price,
    catalog.coinDefinition,
  );

  if ("refused" in credited || "illegal" in credited) {
    return "refused" in credited
      ? credited
      : refuse("item_not_carried", ITEM_NOT_CARRIED_MESSAGE);
  }

  const stock = merchantStock(merchant);
  const nextStock = [...stock, soldItem.definition.id];

  return {
    state: withNpcDialogueRuntime(credited.state, merchant.id, {
      merchantStockIds: nextStock,
    }),
    events: [
      barterEvent(state, "barter_sell", {
        npcId: merchant.id,
        definitionId: soldItem.definition.id,
        price,
        itemInstanceId,
      }),
    ],
  };
};

export const computeBarterEconomyTotal = (
  state: GameState,
  catalog: BarterCatalog,
): number => {
  let total = countPlayerCoinValue(state);

  for (const slot of state.player.inventory) {
    if (slot === null || slot.definition.kind === "coin") {
      continue;
    }

    total += slot.quantity * slot.definition.value.coin;
  }

  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "npc") {
      continue;
    }

    const stock = merchantStock(entity);

    for (const definitionId of stock) {
      const definition = catalog.resolve(definitionId);

      if (definition !== null) {
        total += definition.value.coin;
      }
    }
  }

  return total;
};

const MERCHANT_STOCK_KEY = "merchantStockIds" as const;

const activeMerchant = (state: GameState): NpcEntityInstance | null => {
  const conversation = getActiveConversation(state);

  if (conversation === null) {
    return null;
  }

  const npc = state.entities[conversation.npcId];

  return npc?.kind === "npc" ? npc : null;
};

const merchantStock = (npc: NpcEntityInstance): readonly string[] =>
  readDialogueRuntime(npc)[MERCHANT_STOCK_KEY] ??
  npc.definition.merchantInventoryItemIds;

const readBarterCredit = (npc: NpcEntityInstance): number => {
  const value = readDialogueRuntime(npc)[BARTER_CREDIT_KEY];

  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : 0;
};

const countBarterCreditValue = (state: GameState): number => {
  let total = 0;

  for (const npc of sortedNpcs(state)) {
    total += readBarterCredit(npc);
  }

  return total;
};

const withBarterCredit = (
  state: GameState,
  npcId: EntityId,
  amount: number,
): GameState =>
  withNpcDialogueRuntime(state, npcId, {
    [BARTER_CREDIT_KEY]: Math.max(0, amount),
  });

const addBarterCredit = (
  state: GameState,
  npcId: EntityId,
  amount: number,
): GameState => {
  if (amount <= 0) {
    return state;
  }

  const npc = state.entities[npcId];
  const current = npc?.kind === "npc" ? readBarterCredit(npc) : 0;
  return withBarterCredit(state, npcId, current + amount);
};

const creditNpcsInSpendOrder = (
  state: GameState,
  preferredNpcId: EntityId,
): readonly NpcEntityInstance[] => {
  const npcs = sortedNpcs(state);
  const preferred = npcs.find((npc) => npc.id === preferredNpcId);

  if (preferred === undefined) {
    return npcs;
  }

  return [
    preferred,
    ...npcs.filter((npc) => npc.id !== preferredNpcId),
  ];
};

const removeBarterCreditValue = (
  state: GameState,
  preferredNpcId: EntityId,
  amount: number,
): { readonly state: GameState; readonly remaining: number } => {
  let nextState = state;
  let remaining = amount;

  for (const npc of creditNpcsInSpendOrder(state, preferredNpcId)) {
    if (remaining <= 0) {
      break;
    }

    const credit = readBarterCredit(npc);
    if (credit <= 0) {
      continue;
    }

    const paid = Math.min(credit, remaining);
    nextState = withBarterCredit(nextState, npc.id, credit - paid);
    remaining -= paid;
  }

  return { state: nextState, remaining };
};

const removeCoinValue = (
  state: GameState,
  creditNpcId: EntityId,
  amount: number,
): BarterResolution | { readonly state: GameState } => {
  const credited = removeBarterCreditValue(state, creditNpcId, amount);
  let remaining = credited.remaining;
  let nextState = credited.state;

  for (const slot of nextState.player.inventory) {
    if (slot === null || slot.definition.kind !== "coin" || remaining <= 0) {
      continue;
    }

    const slotValue = slot.quantity * slot.definition.value.coin;

    if (slotValue <= remaining) {
      const removed = removeFromInventory(nextState, slot.itemInstanceId, slot.quantity);

      if ("illegal" in removed) {
        return refuse("insufficient_coin", INSUFFICIENT_COIN_MESSAGE);
      }

      nextState = removed.state;
      remaining -= slotValue;
      continue;
    }

    const unitsNeeded = Math.ceil(remaining / slot.definition.value.coin);
    const removed = removeFromInventory(nextState, slot.itemInstanceId, unitsNeeded);

    if ("illegal" in removed) {
      return refuse("insufficient_coin", INSUFFICIENT_COIN_MESSAGE);
    }

    nextState = removed.state;
    const paidValue = unitsNeeded * slot.definition.value.coin;
    remaining -= paidValue;
  }

  if (remaining > 0) {
    return refuse("insufficient_coin", INSUFFICIENT_COIN_MESSAGE);
  }

  nextState = addBarterCredit(nextState, creditNpcId, Math.abs(remaining));

  return { state: nextState };
};

const addCoinValue = (
  state: GameState,
  creditNpcId: EntityId,
  amount: number,
  fallbackCoinDefinition: ItemDefinition,
): BarterResolution | InventoryOperationResult => {
  const coinDefinition = findCoinDefinition(state) ?? fallbackCoinDefinition;

  const unitValue = coinDefinition.value.coin;

  if (unitValue < 1 || !Number.isInteger(amount) || amount < 0) {
    return refuse("insufficient_coin", INSUFFICIENT_COIN_MESSAGE);
  }

  const quantity = Math.floor(amount / unitValue);
  const credit = amount - quantity * unitValue;
  let nextState = state;

  if (quantity > 0) {
    const stack: PlayerItemStack = {
      itemInstanceId: `coin#barter-${amount}`,
      definition: coinDefinition,
      quantity,
      identified: true,
    };

    const added = addToInventory(nextState, stack);

    if ("illegal" in added) {
      return added;
    }

    nextState = added.state;
  }

  return {
    state: addBarterCredit(nextState, creditNpcId, credit),
    events: [],
  };
};

const findCoinDefinition = (state: GameState): ItemDefinition | null => {
  for (const slot of state.player.inventory) {
    if (slot?.definition.kind === "coin") {
      return slot.definition;
    }
  }

  return null;
};

const refuse = (
  reason: BarterRefusalReason,
  message: string,
): BarterResolution => ({
  refused: true,
  reason,
  message,
});

const barterEvent = (
  state: GameState,
  type: "barter_buy" | "barter_sell",
  data: {
    readonly npcId: EntityId;
    readonly definitionId: string;
    readonly price: number;
    readonly itemInstanceId: string;
  },
): TurnEvent =>
  ({
    turn: state.run.turn,
    type,
    data,
  }) as TurnEvent;
