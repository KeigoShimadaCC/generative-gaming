import { afterAll, describe, expect, it } from "vitest";

import { config } from "../../config/index.js";
import type { ItemDefinition } from "../../schemas/entities/index.js";
import {
  validCharmItemFixture,
  validCoinItemFixture,
  validDraughtItemFixture,
  validFoodItemFixture,
  validWeaponItemFixture,
} from "../../schemas/fixtures/entities.js";
import {
  createFloorGeometrySlot,
  createTile,
  createTileGrid,
  Terrain,
  type Tile,
  type TileGrid,
} from "../map/index.js";
import { createRng } from "../rng/index.js";
import {
  createInitialState,
  type EntityId,
  type GameState,
  type GroundItemEntityInstance,
  type InventorySlot,
  type PlayerItemStack,
  type Position,
} from "../state/index.js";
import { step, type TurnEvent } from "../turn/index.js";
import type { ActionResolverResult } from "../turn/index.js";
import {
  addToInventory,
  countCarriedItems,
  dropItem,
  equipItem,
  findStackSlotIndex,
  removeFromInventory,
  resolvePickupAction,
  splitInventoryStack,
  stackLimitFor,
  totalItemQuantity,
  unequipItem,
  unregisterInventoryActionResolver,
  type InventoryOperationResult,
} from "./inventory.js";

afterAll(() => {
  unregisterInventoryActionResolver();
});

describe("inventory stacking", () => {
  it("stacks identical consumables up to the configured limit", () => {
    const definition = consumableDefinition("draught-stack", "draught");
    let state = withInventory(createInitialState("stack-add"), emptySlots(16));

    const limit = config.playerCharacter.inventory.identicalConsumableStackLimit;

    for (let count = 1; count <= limit; count += 1) {
      const added = expectInventorySuccess(
        addToInventory(state, carried("draught-stack#1", definition, 1)),
      );
      state = added.state;
      expect(state.player.inventory[0]?.quantity).toBe(count);
    }

    for (let slot = 1; slot < config.playerCharacter.inventory.slots; slot += 1) {
      const fillerDefinition = {
        ...validCoinItemFixture,
        id: `filler-coin-${slot}`,
      };
      state = expectInventorySuccess(
        addToInventory(
          state,
          carried(`filler#${slot}`, fillerDefinition, 1),
        ),
      ).state;
    }

    const rejected = addToInventory(
      state,
      carried("draught-stack#overflow", definition, 1),
    );
    expect(rejected).toEqual({
      illegal: true,
      reason: "Your pack is full.",
    });
  });

  it("spills overflow into a new slot after a stack reaches the limit", () => {
    const definition = consumableDefinition("food-stack", "food");
    const limit = stackLimitFor(definition);
    let state = withInventory(createInitialState("stack-spill"), emptySlots(16));

    const first = expectInventorySuccess(
      addToInventory(state, carried("food-stack#a", definition, limit)),
    );
    state = first.state;

    const second = expectInventorySuccess(
      addToInventory(state, carried("food-stack#b", definition, 1)),
    );
    state = second.state;

    expect(state.player.inventory[0]?.quantity).toBe(limit);
    expect(state.player.inventory[1]?.quantity).toBe(1);
    expect(countCarriedItems(state.player.inventory)).toBe(limit + 1);
  });

  it("splits and merges stacks without changing total quantity", () => {
    const definition = consumableDefinition("coin-stack", "coin");
    let state = withInventory(createInitialState("stack-split"), [
      carried("coin-stack#1", definition, 4),
      ...emptySlots(15),
    ]);

    const split = expectInventorySuccess(splitInventoryStack(state, "coin-stack#1", 2));
    state = split.state;
    expect(state.player.inventory[0]?.quantity).toBe(2);
    expect(state.player.inventory[1]?.quantity).toBe(2);

    const removed = expectInventorySuccess(
      removeFromInventory(state, "coin-stack#1#split", 2),
    );
    const merged = expectInventorySuccess(
      addToInventory(removed.state, carried("coin-stack#1#split", definition, 2)),
    );
    state = merged.state;
    expect(state.player.inventory[0]?.quantity).toBe(4);
    expect(state.player.inventory[1]).toBeNull();
  });

  it("never stacks equipment items", () => {
    const state = withInventory(createInitialState("no-equipment-stack"), [
      carried("weapon#1", validWeaponItemFixture, 1),
      ...emptySlots(15),
    ]);

    expect(isStackable(definitionKind(validWeaponItemFixture))).toBe(false);
    expect(findStackSlotIndex(state.player.inventory, validWeaponItemFixture.id)).toBeNull();

    const added = expectInventorySuccess(
      addToInventory(state, carried("weapon#2", validWeaponItemFixture, 1)),
    );

    expect(added.state.player.inventory[0]?.quantity).toBe(1);
    expect(added.state.player.inventory[1]?.quantity).toBe(1);
  });
});

describe("pickup and full inventory", () => {
  it("picks up a ground item onto the player tile and logs the event", () => {
    const state = withEntities(
      stateFromFixture("pickup-item", `@.`),
      [groundItem("item#1", { x: 0, y: 0 }, validCoinItemFixture, 1)],
    );

    const result = expectPickupSuccess(resolvePickupAction(state, { kind: "pickup" }));

    expect(result.state.entities["item#1"]).toBeUndefined();
    expect(result.state.player.inventory[0]).toMatchObject({
      itemInstanceId: "item#1",
      quantity: 1,
      definition: validCoinItemFixture,
    });
    expect(eventOfType(result.events, "item_picked_up")).toMatchObject({
      type: "item_picked_up",
      data: {
        entityId: "item#1",
        definitionId: validCoinItemFixture.id,
        quantity: 1,
        stacked: false,
      },
    });
  });

  it("refuses pickup through step without consuming a turn when the pack is full", () => {
    const state = withEntities(
      withInventory(stateFromFixture("pickup-full", `@.`), fullInventory()),
      [groundItem("item#1", { x: 0, y: 0 }, validCoinItemFixture, 1)],
    );

    const result = step(state, { kind: "pickup" });

    expect(result.state.run.turn).toBe(0);
    expect(result.state.entities["item#1"]).toBeDefined();
    expect(eventOfType(result.events, "action_illegal")).toMatchObject({
      type: "action_illegal",
      data: {
        actionKind: "pickup",
        reason: "inventory is full",
      },
    });
    expect(result.events.some((event) => event.type === "action_resolved")).toBe(
      false,
    );
  });

  it("refuses pickup when the resolver cannot fit the stack", () => {
    const definition = consumableDefinition("draught-full", "draught");
    const state = withEntities(
      withInventory(
        stateFromFixture("pickup-resolver-full", `@.`),
        [
          carried("draught-full#1", definition, 5),
          ...Array.from({ length: 15 }, (_, index) =>
            carried(`filler#${index}`, validCoinItemFixture, 1),
          ),
        ],
      ),
      [groundItem("item#1", { x: 0, y: 0 }, definition, 1)],
    );

    const result = resolvePickupAction(state, { kind: "pickup" });

    expect(result).toEqual({
      illegal: true,
      reason: "Your pack is full.",
    });
  });
});

describe("drop placement", () => {
  it("drops onto the player tile when it is free", () => {
    const state = withInventory(stateFromFixture("drop-on-player", `@.`), [
      carried("coin#1", validCoinItemFixture, 1),
      ...emptySlots(15),
    ]);

    const result = expectInventorySuccess(dropItem(state, "coin#1"));

    const droppedEntity = groundItemAtPosition(result.state, { x: 0, y: 0 });
    expect(droppedEntity?.kind).toBe("item");
    if (droppedEntity?.kind === "item") {
      expect(droppedEntity.quantity).toBe(1);
    }
    expect(result.state.player.inventory[0]).toBeNull();
  });
});

const groundItemAtPosition = (state: GameState, position: Position) =>
  Object.values(state.entities).find(
    (entity) =>
      entity.kind === "item" &&
      entity.position.x === position.x &&
      entity.position.y === position.y,
  );

describe("equip and unequip", () => {
  it("swaps an equipped weapon with a carried weapon", () => {
    const oldWeapon = carried("weapon#old", validWeaponItemFixture, 1);
    const newWeapon = carried("weapon#new", withWeaponBonus(4), 1);
    let state = withInventory(
      withPlayerEquipment(createInitialState("equip-swap"), {
        weapon: oldWeapon,
      }),
      [newWeapon, ...emptySlots(15)],
    );

    const result = expectInventorySuccess(equipItem(state, "weapon#new"));
    state = result.state;

    expect(state.player.equipment.weapon).toEqual(newWeapon);
    expect(state.player.inventory[0]).toEqual(oldWeapon);
    expect(eventOfType(result.events, "item_equipped")).toMatchObject({
      data: {
        itemInstanceId: "weapon#new",
        swappedItemInstanceId: "weapon#old",
      },
    });
  });

  it("leaves equipment unchanged when unequip is blocked by a full pack", () => {
    const weapon = carried("weapon#1", validWeaponItemFixture, 1);
    const state = withPlayerEquipment(
      withInventory(createInitialState("unequip-full"), fullInventory()),
      { weapon },
    );

    const result = unequipItem(state, { kind: "weapon" });

    expect(result).toEqual({
      illegal: true,
      reason: "Your pack is full.",
    });
    expect(state.player.equipment.weapon).toEqual(weapon);
    expect(state.player.inventory).toEqual(state.player.inventory);
  });

  it("refuses default charm equip when every charm slot is full", () => {
    const existingCharmA = carried("charm#old-a", validCharmItemFixture, 1);
    const existingCharmB = carried("charm#old-b", validCharmItemFixture, 1);
    const newCharm = carried("charm#new", validCharmItemFixture, 1);
    const state = withPlayerEquipment(
      withInventory(createInitialState("equip-charm-full"), [
        newCharm,
        ...emptySlots(15),
      ]),
      { charms: [existingCharmA, existingCharmB] },
    );

    const result = equipItem(state, "charm#new");

    expect(result).toEqual({
      illegal: true,
      reason: "All charm slots are full.",
    });
    expect(state.player.equipment.charms).toEqual([
      existingCharmA,
      existingCharmB,
    ]);
    expect(state.player.inventory[0]).toEqual(newCharm);
  });
});

describe("item conservation", () => {
  it("preserves total item quantity across 1000 seeded inventory operations", () => {
    const rng = createRng("inventory-conservation");
    let state = conservationFixture();
    const initialTotal = totalItemQuantity(state);

    for (let operation = 0; operation < 1_000; operation += 1) {
      const before = totalItemQuantity(state);
      state = applyRandomInventoryOperation(state, rng);
      expect(totalItemQuantity(state)).toBe(before);
    }

    expect(totalItemQuantity(state)).toBe(initialTotal);
  });
});

describe("drop placement determinism", () => {
  it("places drops on the nearest free walkable tile when the player tile is occupied", () => {
    const state = withEntities(
      withInventory(stateFromFixture("drop-crowded", `
        ...
        .@.
        ...
      `), [carried("coin#drop", validCoinItemFixture, 1), ...emptySlots(15)]),
      [groundItem("item#1", { x: 1, y: 1 }, validDraughtItemFixture, 1)],
    );

    const result = expectInventorySuccess(dropItem(state, "coin#drop"));
    const dropped = eventOfType(result.events, "item_dropped");

    expect(dropped.data.position).toEqual({ x: 0, y: 0 });
    expect(
      Object.values(result.state.entities).filter((entity) => entity.kind === "item"),
    ).toHaveLength(2);

    const repeat = expectInventorySuccess(dropItem(state, "coin#drop"));
    expect(eventOfType(repeat.events, "item_dropped").data.position).toEqual({
      x: 0,
      y: 0,
    });
  });
});

const applyRandomInventoryOperation = (
  state: GameState,
  rng: ReturnType<typeof createRng>,
): GameState => {
  const operations = [
    "pickup",
    "drop",
    "equip-weapon",
    "unequip-weapon",
  ] as const;
  const operation = rng.pick(operations);

  switch (operation) {
    case "pickup": {
      const ground = Object.values(state.entities).find(
        (entity) =>
          entity.kind === "item" &&
          entity.position.x === state.player.position.x &&
          entity.position.y === state.player.position.y,
      );

      if (ground === undefined || ground.kind !== "item") {
        return state;
      }

      const result = resolvePickupAction(state, { kind: "pickup" });
      return "illegal" in result ? state : result.state;
    }
    case "drop": {
      const carried = state.player.inventory.find((slot) => slot !== null);

      if (carried === null || carried === undefined) {
        return state;
      }

      const result = dropItem(state, carried.itemInstanceId, 1);
      return "illegal" in result ? state : result.state;
    }
    case "equip-weapon": {
      const weapon = state.player.inventory.find(
        (slot) => slot?.definition.kind === "weapon",
      );

      if (weapon === null || weapon === undefined || weapon.quantity !== 1) {
        return state;
      }

      const result = equipItem(state, weapon.itemInstanceId);
      return "illegal" in result ? state : result.state;
    }
    case "unequip-weapon": {
      if (state.player.equipment.weapon === null) {
        return state;
      }

      const result = unequipItem(state, { kind: "weapon" });
      return "illegal" in result ? state : result.state;
    }
  }
};

const conservationFixture = (): GameState => {
  const definition = consumableDefinition("conservation-coin", "coin");
  const weapon = carried("weapon#carry", validWeaponItemFixture, 1);

  let state = withInventory(
    stateFromFixture("conservation", `
      .....
      .@...
      .....
    `),
    [carried("conservation-coin#seed", definition, 3), weapon, ...emptySlots(14)],
  );

  state = withEntities(state, [
    groundItem("item#1", { x: 2, y: 1 }, definition, 2),
    groundItem("item#2", { x: 3, y: 1 }, validDraughtItemFixture, 1),
  ]);

  state = expectInventorySuccess(equipItem(state, "weapon#carry")).state;

  return state;
};

const consumableDefinition = (
  id: string,
  kind: "draught" | "food" | "coin",
): ItemDefinition => {
  switch (kind) {
    case "draught":
      return { ...validDraughtItemFixture, id };
    case "food":
      return { ...validFoodItemFixture, id };
    case "coin":
      return { ...validCoinItemFixture, id };
  }
};

const isStackable = (kind: ItemDefinition["kind"]): boolean =>
  kind === "draught" ||
  kind === "note" ||
  kind === "throwable" ||
  kind === "food" ||
  kind === "tool" ||
  kind === "coin";

const definitionKind = (definition: ItemDefinition): ItemDefinition["kind"] =>
  definition.kind;

const withWeaponBonus = (attackBonus: number): ItemDefinition => ({
  ...validWeaponItemFixture,
  id: `weapon-bonus-${attackBonus}`,
  weapon: { attackBonus, cursed: false, onHit: null },
});

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

const emptySlots = (count: number): InventorySlot[] =>
  Array.from({ length: count }, () => null);

const fullInventory = (): InventorySlot[] =>
  Array.from({ length: config.playerCharacter.inventory.slots }, (_, index) =>
    carried(`full#${index}`, validCoinItemFixture, 1),
  );

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

const withPlayerEquipment = (
  state: GameState,
  equipment: Partial<GameState["player"]["equipment"]>,
): GameState => ({
  ...state,
  player: {
    ...state.player,
    equipment: {
      ...state.player.equipment,
      ...equipment,
    },
  },
});

const withEntities = (
  state: GameState,
  entities: readonly GroundItemEntityInstance[],
): GameState => {
  const maxItemId = entities.reduce((max, entity) => {
    const [, counter] = entity.id.split("#");
    const parsed = Number(counter);

    return Number.isFinite(parsed) && parsed > max ? parsed : max;
  }, state.ids.entityCounters.item);

  return {
    ...state,
    entities: {
      ...state.entities,
      ...Object.fromEntries(entities.map((entity) => [entity.id, entity])),
    },
    ids: {
      ...state.ids,
      entityCounters: {
        ...state.ids.entityCounters,
        item: maxItemId,
      },
    },
  };
};

const groundItem = (
  id: EntityId,
  position: Position,
  definition: ItemDefinition,
  quantity: number,
): GroundItemEntityInstance => ({
  id,
  kind: "item",
  definition,
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime: {},
  quantity,
  identified: true,
});

const stateFromFixture = (seed: string, layout: string): GameState => {
  const { grid, markers } = parseFixture(layout);
  const playerPosition = markers.get("@") ?? { x: 0, y: 0 };

  return withGrid(createInitialState(seed), grid, playerPosition);
};

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

const parseFixture = (
  layout: string,
): {
  readonly grid: TileGrid;
  readonly markers: ReadonlyMap<string, Position>;
} => {
  const rows = layout
    .trim()
    .split("\n")
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  const width = Math.max(...rows.map((row) => row.length));
  const tiles: Tile[] = [];
  const markerEntries: [string, Position][] = [];

  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y] ?? "";

    for (let x = 0; x < width; x += 1) {
      const character = row[x];
      const position = { x, y };
      tiles.push(tileForCharacter(character));
      if (character !== undefined && /[@.]/u.test(character)) {
        markerEntries.push([character, position]);
      }
    }
  }

  return {
    grid: createTileGrid({ width, height: rows.length, tiles }),
    markers: new Map(markerEntries),
  };
};

const tileForCharacter = (character: string | undefined): Tile => {
  switch (character) {
    case "#":
      return createTile(Terrain.Wall);
    case ".":
    case "@":
      return createTile(Terrain.Floor);
    default:
      return createTile(Terrain.Floor);
  }
};

const expectInventorySuccess = (
  result: InventoryOperationResult,
): Extract<InventoryOperationResult, { readonly state: GameState }> => {
  if ("illegal" in result) {
    throw new Error(result.reason);
  }

  return result;
};

const expectPickupSuccess = (
  result: ActionResolverResult,
): Extract<ActionResolverResult, { readonly state: GameState }> => {
  if ("illegal" in result) {
    throw new Error(result.reason);
  }

  return result;
};

const eventOfType = <Type extends TurnEvent["type"]>(
  events: readonly TurnEvent[],
  type: Type,
): Extract<TurnEvent, { readonly type: Type }> => {
  const event = events.find(
    (candidate): candidate is Extract<TurnEvent, { readonly type: Type }> =>
      candidate.type === type,
  );

  if (event === undefined) {
    throw new Error(`missing event ${type}`);
  }

  return event;
};
