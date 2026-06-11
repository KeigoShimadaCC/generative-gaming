import { config } from "../../config/index.js";
import type { ItemCategory, ItemDefinition } from "../../schemas/entities/index.js";
import {
  chebyshevDistance,
  getTile,
  inBounds,
  isWalkableTile,
  type TileGrid,
} from "../map/index.js";
import {
  allocateEntityId,
  type EngineLogEventDataByType,
  type EntityId,
  type GameState,
  type GroundItemEntityInstance,
  type InventorySlot,
  type PlayerItemStack,
  type Position,
  type SerializableRecord,
} from "../state/index.js";
import {
  registerActionResolver,
  type ActionResolver,
  type ActionResolverResult,
  type PickupAction,
  type TurnEvent,
} from "../turn/index.js";

export type InventoryOperationResult =
  | {
      readonly state: GameState;
      readonly events: readonly TurnEvent[];
    }
  | {
      readonly illegal: true;
      readonly reason: string;
    };

export type EquipTarget =
  | {
      readonly kind: "weapon";
    }
  | {
      readonly kind: "armor";
    }
  | {
      readonly kind: "charm";
      readonly index: number;
    };

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly item_picked_up: {
      readonly itemInstanceId: string;
      readonly entityId: EntityId;
      readonly definitionId: string;
      readonly quantity: number;
      readonly stacked: boolean;
    };
    readonly item_dropped: {
      readonly itemInstanceId: string;
      readonly entityId: EntityId;
      readonly definitionId: string;
      readonly quantity: number;
      readonly position: Position;
    };
    readonly item_equipped: {
      readonly itemInstanceId: string;
      readonly definitionId: string;
      readonly slot: EquipTarget;
      readonly swappedItemInstanceId: string | null;
    };
    readonly item_unequipped: {
      readonly itemInstanceId: string;
      readonly definitionId: string;
      readonly slot: EquipTarget;
      readonly inventorySlot: number;
    };
    readonly item_curse_announced: {
      readonly itemInstanceId: string;
      readonly definitionId: string;
      readonly slot: EquipTarget;
    };
  }
}

type InventoryLogEventType =
  | "item_picked_up"
  | "item_dropped"
  | "item_equipped"
  | "item_unequipped"
  | "item_curse_announced";

const STACKABLE_CONSUMABLE_KINDS = new Set<ItemCategory>([
  "draught",
  "note",
  "throwable",
  "food",
  "tool",
  "coin",
]);

const FULL_INVENTORY_REASON = "Your pack is full.";

export const isStackableConsumable = (definition: ItemDefinition): boolean =>
  STACKABLE_CONSUMABLE_KINDS.has(definition.kind);

export const stackLimitFor = (definition: ItemDefinition): number =>
  isStackableConsumable(definition)
    ? config.playerCharacter.inventory.identicalConsumableStackLimit
    : 1;

export const inventorySlotCount = (state: GameState): number =>
  state.player.inventory.length;

export const countCarriedItems = (inventory: readonly InventorySlot[]): number => {
  let total = 0;

  for (const slot of inventory) {
    if (slot !== null) {
      total += slot.quantity;
    }
  }

  return total;
};

export const totalItemQuantity = (state: GameState): number => {
  let total = countCarriedItems(state.player.inventory);

  if (state.player.equipment.weapon !== null) {
    total += state.player.equipment.weapon.quantity;
  }

  if (state.player.equipment.armor !== null) {
    total += state.player.equipment.armor.quantity;
  }

  for (const charm of state.player.equipment.charms) {
    if (charm !== null) {
      total += charm.quantity;
    }
  }

  for (const entity of Object.values(state.entities)) {
    if (entity.kind === "item") {
      total += entity.quantity;
    }
  }

  return total;
};

export const findInventorySlotIndex = (
  inventory: readonly InventorySlot[],
  itemInstanceId: string,
): number | null => {
  const index = inventory.findIndex(
    (slot) => slot?.itemInstanceId === itemInstanceId,
  );

  return index === -1 ? null : index;
};

export const findStackSlotIndex = (
  inventory: readonly InventorySlot[],
  definitionId: string,
): number | null => {
  for (let index = 0; index < inventory.length; index += 1) {
    const slot = inventory[index];

    if (slot === null || slot === undefined) {
      continue;
    }

    if (
      slot.definition.id === definitionId &&
      slot.quantity < stackLimitFor(slot.definition)
    ) {
      return index;
    }
  }

  return null;
};

export const findEmptyInventorySlotIndex = (
  inventory: readonly InventorySlot[],
): number | null => {
  const index = inventory.findIndex((slot) => slot === null);

  return index === -1 ? null : index;
};

export const canAddQuantityToInventory = (
  inventory: readonly InventorySlot[],
  definition: ItemDefinition,
  quantity: number,
): boolean => remainingInventoryCapacity(inventory, definition) >= quantity;

const remainingInventoryCapacity = (
  inventory: readonly InventorySlot[],
  definition: ItemDefinition,
): number => {
  if (!isStackableConsumable(definition)) {
    return findEmptyInventorySlotIndex(inventory) === null ? 0 : 1;
  }

  const stackLimit = stackLimitFor(definition);
  let capacity = 0;

  for (const slot of inventory) {
    if (slot === null) {
      capacity += stackLimit;
      continue;
    }

    if (
      slot.definition.id === definition.id &&
      slot.quantity < stackLimit
    ) {
      capacity += stackLimit - slot.quantity;
    }
  }

  return capacity;
};

export const addToInventory = (
  state: GameState,
  stack: PlayerItemStack,
): InventoryOperationResult => {
  if (stack.quantity < 1) {
    return {
      illegal: true,
      reason: "Cannot add an empty item stack.",
    };
  }

  if (!isStackableConsumable(stack.definition) && stack.quantity !== 1) {
    return {
      illegal: true,
      reason: "Equipment and key items cannot be stacked.",
    };
  }

  const inventory = [...state.player.inventory];
  let remaining = stack.quantity;
  let itemInstanceId = stack.itemInstanceId;

  while (remaining > 0) {
    const stackIndex = findStackSlotIndex(inventory, stack.definition.id);

    if (stackIndex !== null) {
      const current = inventory[stackIndex];

      if (current === null || current === undefined) {
        return {
          illegal: true,
          reason: "Inventory stack slot invariant violated.",
        };
      }

      const limit = stackLimitFor(current.definition);
      const room = limit - current.quantity;
      const added = Math.min(room, remaining);
      inventory[stackIndex] = {
        itemInstanceId: current.itemInstanceId,
        definition: current.definition,
        quantity: current.quantity + added,
        identified: current.identified,
      };
      remaining -= added;
      continue;
    }

    const emptyIndex = findEmptyInventorySlotIndex(inventory);

    if (emptyIndex === null) {
      return {
        illegal: true,
        reason: FULL_INVENTORY_REASON,
      };
    }

    const limit = stackLimitFor(stack.definition);
    const added = Math.min(limit, remaining);
    inventory[emptyIndex] = {
      itemInstanceId,
      definition: stack.definition,
      quantity: added,
      identified: stack.identified,
    };
    remaining -= added;
    itemInstanceId = `${stack.itemInstanceId}#split-${emptyIndex}`;
  }

  return {
    state: withInventory(state, inventory),
    events: [],
  };
};

export const removeFromInventory = (
  state: GameState,
  itemInstanceId: string,
  quantity = 1,
): InventoryOperationResult => {
  const slotIndex = findInventorySlotIndex(state.player.inventory, itemInstanceId);

  if (slotIndex === null) {
    return {
      illegal: true,
      reason: `Item ${itemInstanceId} is not in your pack.`,
    };
  }

  const slot = readInventorySlot(state.player.inventory, slotIndex, itemInstanceId);

  if ("illegal" in slot) {
    return slot;
  }

  if (quantity < 1 || quantity > slot.quantity) {
    return {
      illegal: true,
      reason: `Cannot remove ${quantity} from a stack of ${slot.quantity}.`,
    };
  }

  const inventory = [...state.player.inventory];

  if (quantity === slot.quantity) {
    inventory[slotIndex] = null;
  } else {
    inventory[slotIndex] = {
      itemInstanceId: slot.itemInstanceId,
      definition: slot.definition,
      quantity: slot.quantity - quantity,
      identified: slot.identified,
    };
  }

  return {
    state: withInventory(state, inventory),
    events: [],
  };
};

export const splitInventoryStack = (
  state: GameState,
  itemInstanceId: string,
  quantity: number,
): InventoryOperationResult => {
  const slotIndex = findInventorySlotIndex(state.player.inventory, itemInstanceId);

  if (slotIndex === null) {
    return {
      illegal: true,
      reason: `Item ${itemInstanceId} is not in your pack.`,
    };
  }

  const slot = readInventorySlot(state.player.inventory, slotIndex, itemInstanceId);

  if ("illegal" in slot) {
    return slot;
  }

  if (quantity < 1 || quantity >= slot.quantity) {
    return {
      illegal: true,
      reason: `Cannot split ${quantity} from a stack of ${slot.quantity}.`,
    };
  }

  const emptyIndex = findEmptyInventorySlotIndex(state.player.inventory);

  if (emptyIndex === null) {
    return {
      illegal: true,
      reason: FULL_INVENTORY_REASON,
    };
  }

  const inventory = [...state.player.inventory];
  inventory[slotIndex] = {
    itemInstanceId: slot.itemInstanceId,
    definition: slot.definition,
    quantity: slot.quantity - quantity,
    identified: slot.identified,
  };
  inventory[emptyIndex] = {
    itemInstanceId: `${slot.itemInstanceId}#split`,
    definition: slot.definition,
    quantity,
    identified: slot.identified,
  };

  return {
    state: withInventory(state, inventory),
    events: [],
  };
};

export const groundItemAt = (
  state: GameState,
  position: Position,
): GroundItemEntityInstance | null => {
  const items = Object.values(state.entities)
    .filter(
      (entity): entity is GroundItemEntityInstance =>
        entity.kind === "item" && samePosition(entity.position, position),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  return items[0] ?? null;
};

export const resolvePickupAction: ActionResolver<PickupAction> = (
  state,
): ActionResolverResult => {
  const groundItem = groundItemAt(state, state.player.position);

  if (groundItem === null) {
    return {
      illegal: true,
      reason: "There is nothing here to pick up.",
    };
  }

  const stack: PlayerItemStack = {
    itemInstanceId: groundItem.id,
    definition: groundItem.definition,
    quantity: groundItem.quantity,
    identified: groundItem.identified,
  };

  if (!canAddQuantityToInventory(state.player.inventory, stack.definition, stack.quantity)) {
    return {
      illegal: true,
      reason: FULL_INVENTORY_REASON,
    };
  }

  const added = addToInventory(state, stack);

  if ("illegal" in added) {
    return added;
  }

  const nextEntities = { ...added.state.entities };
  delete nextEntities[groundItem.id];

  const stacked =
    findStackSlotIndex(state.player.inventory, stack.definition.id) !== null;

  return {
    state: {
      ...added.state,
      entities: nextEntities,
    },
    events: [
      inventoryEvent(state, "item_picked_up", {
        itemInstanceId: stack.itemInstanceId,
        entityId: groundItem.id,
        definitionId: stack.definition.id,
        quantity: stack.quantity,
        stacked,
      }),
    ],
  };
};

export const dropItem = (
  state: GameState,
  itemInstanceId: string,
  quantity = 1,
): InventoryOperationResult => {
  const slotIndex = findInventorySlotIndex(state.player.inventory, itemInstanceId);

  if (slotIndex === null) {
    return {
      illegal: true,
      reason: `Item ${itemInstanceId} is not in your pack.`,
    };
  }

  const slot = readInventorySlot(state.player.inventory, slotIndex, itemInstanceId);

  if ("illegal" in slot) {
    return slot;
  }

  if (quantity < 1 || quantity > slot.quantity) {
    return {
      illegal: true,
      reason: `Cannot drop ${quantity} from a stack of ${slot.quantity}.`,
    };
  }

  const grid = gridFromState(state);

  if (grid === null) {
    return {
      illegal: true,
      reason: "The floor layout is not loaded.",
    };
  }

  const placement = findDropPlacement(state, grid, state.player.position);

  if (placement === null) {
    return {
      illegal: true,
      reason: "There is no room to drop that here.",
    };
  }

  const removed = removeFromInventory(state, itemInstanceId, quantity);

  if ("illegal" in removed) {
    return removed;
  }

  const allocation = allocateEntityId(removed.state.ids.entityCounters, "item");
  const entity: GroundItemEntityInstance = {
    id: allocation.id,
    kind: "item",
    definition: slot.definition,
    position: placement,
    currentHP: null,
    statuses: [],
    behaviorRuntime: {},
    quantity,
    identified: slot.identified,
  };

  return {
    state: {
      ...removed.state,
      ids: {
        ...removed.state.ids,
        entityCounters: allocation.entityCounters,
      },
      entities: {
        ...removed.state.entities,
        [entity.id]: entity,
      },
    },
    events: [
      inventoryEvent(state, "item_dropped", {
        itemInstanceId,
        entityId: entity.id,
        definitionId: slot.definition.id,
        quantity,
        position: placement,
      }),
    ],
  };
};

export const equipItem = (
  state: GameState,
  itemInstanceId: string,
  target?: EquipTarget,
): InventoryOperationResult => {
  const slotIndex = findInventorySlotIndex(state.player.inventory, itemInstanceId);

  if (slotIndex === null) {
    return {
      illegal: true,
      reason: `Item ${itemInstanceId} is not in your pack.`,
    };
  }

  const carried = readInventorySlot(state.player.inventory, slotIndex, itemInstanceId);

  if ("illegal" in carried) {
    return carried;
  }

  if (carried.quantity !== 1) {
    return {
      illegal: true,
      reason: "Split the stack before equipping that item.",
    };
  }

  const resolvedTarget =
    target ?? defaultEquipTarget(carried.definition, state.player.equipment.charms);

  if (resolvedTarget === null) {
    return {
      illegal: true,
      reason: `${carried.definition.kind} items cannot be equipped.`,
    };
  }

  if (!isValidEquipTarget(resolvedTarget, carried.definition)) {
    return {
      illegal: true,
      reason: `Item ${itemInstanceId} does not fit that equipment slot.`,
    };
  }

  const currentEquipped = equippedStackForTarget(state, resolvedTarget);
  if (currentEquipped !== null && isCursedStack(currentEquipped)) {
    return {
      illegal: true,
      reason: `Cannot remove cursed ${currentEquipped.definition.kind}.`,
    };
  }

  const inventory = [...state.player.inventory];
  inventory[slotIndex] = null;

  const equipment = {
    weapon: state.player.equipment.weapon,
    armor: state.player.equipment.armor,
    charms: [...state.player.equipment.charms],
  };

  let swappedItem: PlayerItemStack | null = null;
  const equippedItem = {
    ...carried,
    identified: true,
  };

  switch (resolvedTarget.kind) {
    case "weapon":
      swappedItem = equipment.weapon;
      equipment.weapon = equippedItem;
      break;
    case "armor":
      swappedItem = equipment.armor;
      equipment.armor = equippedItem;
      break;
    case "charm": {
      const previousCharm = equipment.charms[resolvedTarget.index];
      swappedItem = previousCharm ?? null;
      equipment.charms[resolvedTarget.index] = equippedItem;
      break;
    }
  }

  inventory[slotIndex] = swappedItem;
  const events: TurnEvent[] = [
    inventoryEvent(state, "item_equipped", {
      itemInstanceId,
      definitionId: carried.definition.id,
      slot: resolvedTarget,
      swappedItemInstanceId: swappedItem?.itemInstanceId ?? null,
    }),
  ];

  if (isCursedStack(equippedItem)) {
    events.push(
      inventoryEvent(state, "item_curse_announced", {
        itemInstanceId,
        definitionId: carried.definition.id,
        slot: resolvedTarget,
      }),
    );
  }

  return {
    state: {
      ...state,
      player: {
        ...state.player,
        inventory,
        equipment,
      },
    },
    events,
  };
};

export const unequipItem = (
  state: GameState,
  target: EquipTarget,
): InventoryOperationResult => {
  const emptyIndex = findEmptyInventorySlotIndex(state.player.inventory);

  if (emptyIndex === null) {
    return {
      illegal: true,
      reason: FULL_INVENTORY_REASON,
    };
  }

  const equipment = {
    weapon: state.player.equipment.weapon,
    armor: state.player.equipment.armor,
    charms: [...state.player.equipment.charms],
  };

  let unequipped: PlayerItemStack | null = null;

  switch (target.kind) {
    case "weapon":
      unequipped = equipment.weapon;
      equipment.weapon = null;
      break;
    case "armor":
      unequipped = equipment.armor;
      equipment.armor = null;
      break;
    case "charm":
      unequipped = equipment.charms[target.index] ?? null;
      equipment.charms[target.index] = null;
      break;
  }

  if (unequipped === null) {
    return {
      illegal: true,
      reason: "That equipment slot is empty.",
    };
  }

  if (isCursedStack(unequipped)) {
    return {
      illegal: true,
      reason: `Cannot remove cursed ${unequipped.definition.kind}.`,
    };
  }

  const inventory = [...state.player.inventory];
  inventory[emptyIndex] = unequipped;

  return {
    state: {
      ...state,
      player: {
        ...state.player,
        inventory,
        equipment,
      },
    },
    events: [
      inventoryEvent(state, "item_unequipped", {
        itemInstanceId: unequipped.itemInstanceId,
        definitionId: unequipped.definition.id,
        slot: target,
        inventorySlot: emptyIndex,
      }),
    ],
  };
};

export const registerInventoryActionResolver = (): (() => void) =>
  registerActionResolver("pickup", resolvePickupAction);

export const unregisterInventoryActionResolver = registerInventoryActionResolver();

const defaultEquipTarget = (
  definition: ItemDefinition,
  charms: readonly (PlayerItemStack | null)[],
): EquipTarget | null => {
  switch (definition.kind) {
    case "weapon":
      return { kind: "weapon" };
    case "armor":
      return { kind: "armor" };
    case "charm":
      return defaultCharmTarget(charms);
    default:
      return null;
  }
};

const defaultCharmTarget = (
  charms: readonly (PlayerItemStack | null)[],
): EquipTarget => {
  const firstEmpty = charms.findIndex((charm) => charm === null);

  return {
    kind: "charm",
    index: firstEmpty === -1 ? 0 : firstEmpty,
  };
};

const isValidEquipTarget = (
  target: EquipTarget,
  definition: ItemDefinition,
): boolean => {
  switch (target.kind) {
    case "weapon":
      return definition.kind === "weapon";
    case "armor":
      return definition.kind === "armor";
    case "charm":
      return (
        definition.kind === "charm" &&
        target.index >= 0 &&
        target.index < config.playerCharacter.equipmentSlots.charms
      );
  }
};

const equippedStackForTarget = (
  state: GameState,
  target: EquipTarget,
): PlayerItemStack | null => {
  switch (target.kind) {
    case "weapon":
      return state.player.equipment.weapon;
    case "armor":
      return state.player.equipment.armor;
    case "charm":
      return state.player.equipment.charms[target.index] ?? null;
  }
};

const isCursedStack = (stack: PlayerItemStack): boolean => {
  switch (stack.definition.kind) {
    case "weapon":
      return stack.definition.weapon?.cursed ?? false;
    case "armor":
      return stack.definition.armor?.cursed ?? false;
    case "charm":
      return stack.definition.charm?.cursed ?? false;
    default:
      return false;
  }
};

const findDropPlacement = (
  state: GameState,
  grid: TileGrid,
  origin: Position,
): Position | null => {
  const candidates: Position[] = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const position = { x, y };

      if (!inBounds(grid, position) || !isWalkableTile(getTile(grid, position))) {
        continue;
      }

      if (groundItemAt(state, position) !== null) {
        continue;
      }

      candidates.push(position);
    }
  }

  candidates.sort((a, b) => {
    const distanceDelta =
      chebyshevDistance(origin, a) - chebyshevDistance(origin, b);

    if (distanceDelta !== 0) {
      return distanceDelta;
    }

    if (a.y !== b.y) {
      return a.y - b.y;
    }

    return a.x - b.x;
  });

  return candidates[0] ?? null;
};

type InventorySlotReadError = {
  readonly illegal: true;
  readonly reason: string;
};

const readInventorySlot = (
  inventory: readonly InventorySlot[],
  slotIndex: number,
  itemInstanceId: string,
): PlayerItemStack | InventorySlotReadError => {
  const slot = inventory[slotIndex];

  if (slot === null || slot === undefined) {
    return {
      illegal: true,
      reason: `Item ${itemInstanceId} is not in your pack.`,
    };
  }

  return slot;
};

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

const gridFromState = (state: GameState): TileGrid | null => {
  const opaque = state.floor.geometry.opaque;

  if (!isTileGridRecord(opaque)) {
    return null;
  }

  return opaque as unknown as TileGrid;
};

const isTileGridRecord = (
  value: SerializableRecord | null,
): value is SerializableRecord => {
  if (value === null) {
    return false;
  }

  const record = value as {
    readonly kind?: unknown;
    readonly width?: unknown;
    readonly height?: unknown;
    readonly tiles?: unknown;
  };

  return (
    record.kind === "tile-grid" &&
    Number.isSafeInteger(record.width) &&
    Number.isSafeInteger(record.height) &&
    Array.isArray(record.tiles)
  );
};

const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const inventoryEvent = <Type extends InventoryLogEventType>(
  state: GameState,
  type: Type,
  data: EngineLogEventDataByType[Type],
): Extract<TurnEvent, { readonly type: Type }> =>
  ({
    turn: state.run.turn,
    type,
    data,
  }) as Extract<TurnEvent, { readonly type: Type }>;
