import { describe, expect, it } from "vitest";

import {
  createFogMemory,
  createFloorGeometrySlot,
  createTileGrid,
  updateFogMemory,
  visibleCells
} from "../engine/map/index.js";
import {
  createInitialState,
  deserialize,
  serialize,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type PlayerItemStack,
  type Position,
  type SerializableRecord
} from "../engine/state/index.js";
import {
  createBotStateView,
  createEmptyBotMemory,
  updateBotMemory
} from "./bots/index.js";
import { balancedPolicy } from "./bots/policies/index.js";
import type { ItemDefinition } from "../schemas/entities/index.js";
import {
  validDraughtItemFixture,
  validEnemyDefinitionFixture
} from "../schemas/fixtures/entities.js";
import {
  makeEffectBundleFixture,
  validHealEffectFixture,
  validQuaffTriggerFixture,
  validSelfTargetingFixture
} from "../schemas/fixtures/vocab.js";

const PREFERRED_INVENTORY_ACTION_IDS = [
  "quaff",
  "use",
  "read",
  "equip",
  "unequip"
] as const;

function selectPreferredInventoryActionId(
  actionIds: readonly string[]
): string | null {
  for (const preferred of PREFERRED_INVENTORY_ACTION_IDS) {
    if (actionIds.includes(preferred)) {
      return preferred;
    }
  }

  return null;
}

function resolveItemEntryIndex(state: GameState, itemId: string): number | null {
  const slotIndex = state.player.inventory.findIndex(
    (slot) => slot?.itemInstanceId === itemId
  );
  if (slotIndex >= 0) {
    return slotIndex;
  }

  const equipmentBase = state.player.inventory.length;
  if (state.player.equipment.weapon?.itemInstanceId === itemId) {
    return equipmentBase;
  }
  if (state.player.equipment.armor?.itemInstanceId === itemId) {
    return equipmentBase + 1;
  }

  for (let index = 0; index < state.player.equipment.charms.length; index += 1) {
    if (state.player.equipment.charms[index]?.itemInstanceId === itemId) {
      return equipmentBase + 2 + index;
    }
  }

  return null;
}

function inventoryNavigationKeys(
  currentIndex: number,
  targetIndex: number,
  entryCount: number
): readonly string[] {
  if (entryCount <= 0 || currentIndex === targetIndex) {
    return [];
  }

  const normalizedCurrent =
    ((currentIndex % entryCount) + entryCount) % entryCount;
  const normalizedTarget =
    ((targetIndex % entryCount) + entryCount) % entryCount;
  const down = (normalizedTarget - normalizedCurrent + entryCount) % entryCount;
  const up = (normalizedCurrent - normalizedTarget + entryCount) % entryCount;

  return Array.from(
    { length: Math.min(down, up) },
    () => (down <= up ? "ArrowDown" : "ArrowUp")
  );
}

function recordPickupForLoopBreaker(
  breaker: {
    readonly recentPickups: Array<{ readonly posKey: string; readonly turn: number }>;
    readonly blacklistedPositions: Set<string>;
  },
  position: Position,
  turn: number
): {
  readonly recentPickups: Array<{ readonly posKey: string; readonly turn: number }>;
  readonly blacklistedPositions: Set<string>;
} {
  const posKeyValue = `${position.x},${position.y}`;
  const recentPickups = [
    ...breaker.recentPickups.filter((entry) => turn - entry.turn <= 10),
    { posKey: posKeyValue, turn }
  ];
  const samePositionCount = recentPickups.filter(
    (entry) => entry.posKey === posKeyValue
  ).length;
  const blacklistedPositions = new Set(breaker.blacklistedPositions);

  if (samePositionCount >= 3) {
    blacklistedPositions.add(posKeyValue);
  }

  return {
    recentPickups,
    blacklistedPositions
  };
}

function isPickupBlacklisted(
  breaker: { readonly blacklistedPositions: Set<string> },
  position: Position
): boolean {
  return breaker.blacklistedPositions.has(`${position.x},${position.y}`);
}

function verifyInventoryItemActionSucceeded(
  before: GameState,
  after: GameState,
  itemId: string
): boolean {
  const beforeQty =
    before.player.inventory.find((slot) => slot?.itemInstanceId === itemId)
      ?.quantity ?? 0;
  const afterQty =
    after.player.inventory.find((slot) => slot?.itemInstanceId === itemId)
      ?.quantity ?? 0;
  if (afterQty < beforeQty) {
    return true;
  }

  if (beforeQty > 0 && afterQty === 0) {
    return true;
  }

  return false;
}

describe("browser bot policy view bridge", () => {
  it("preserves mid-combat state through serialize/deserialize before policy decide", () => {
    const state = midCombatState();
    const serialized = serialize(state);
    const roundTripped = deserialize(serialized);
    const memory = createEmptyBotMemory();
    const view = createBotStateView(roundTripped, {
      policyName: balancedPolicy.name,
      memory
    });
    const nextMemory = updateBotMemory(memory, view);
    const decision = balancedPolicy.decide(view);

    expect(roundTripped.entities["enemy#1"]?.kind).toBe("enemy");
    expect(roundTripped.player.inventory[0]?.itemInstanceId).toBe("item#heal");
    expect(roundTripped.player.xp).toBe(42);
    expect(roundTripped.floor.geometry.opaque).toMatchObject({
      fog: expect.objectContaining({
        tiles: expect.any(Array)
      })
    });
    expect(view.visible.enemies).toHaveLength(1);
    expect(view.visible.enemies[0]?.position).toEqual({ x: 3, y: 2 });
    expect(view.player.inventory).toHaveLength(1);
    expect(view.player.hp.current).toBe(5);
    expect(view.player.equipment.weapon).toBeNull();
    expect(view.player.level).toBe(3);
    expect(nextMemory.visitedByDepth.get(1)?.has("2,2")).toBe(true);
    expect(decision.kind).not.toBe("move");
    expect(["attack", "use_item"]).toContain(decision.kind);
  });
});

describe("browser bot inventory helpers", () => {
  it("prefers quaff/use/equip over drop", () => {
    expect(selectPreferredInventoryActionId(["drop", "quaff"])).toBe("quaff");
    expect(selectPreferredInventoryActionId(["drop", "equip"])).toBe("equip");
    expect(selectPreferredInventoryActionId(["drop", "use"])).toBe("use");
    expect(selectPreferredInventoryActionId(["drop", "throw"])).toBeNull();
  });

  it("maps item ids to unified inventory row indices", () => {
    const state = midCombatState();
    expect(resolveItemEntryIndex(state, "item#heal")).toBe(0);
    expect(resolveItemEntryIndex(state, "item#missing")).toBeNull();
  });

  it("builds shortest arrow navigation between inventory rows", () => {
    expect(inventoryNavigationKeys(0, 2, 20)).toEqual(["ArrowDown", "ArrowDown"]);
    expect(inventoryNavigationKeys(3, 1, 20)).toEqual(["ArrowUp", "ArrowUp"]);
    expect(inventoryNavigationKeys(4, 4, 20)).toEqual([]);
  });

  it("blacklists pickup positions after repeated pickups", () => {
    let breaker = recordPickupForLoopBreaker(
      { recentPickups: [], blacklistedPositions: new Set() },
      { x: 4, y: 7 },
      10
    );
    breaker = recordPickupForLoopBreaker(breaker, { x: 4, y: 7 }, 12);
    breaker = recordPickupForLoopBreaker(breaker, { x: 4, y: 7 }, 14);

    expect(isPickupBlacklisted(breaker, { x: 4, y: 7 })).toBe(true);
    expect(isPickupBlacklisted(breaker, { x: 1, y: 1 })).toBe(false);
  });

  it("detects consumed or equipped inventory actions", () => {
    const before = midCombatState();
    const consumed = {
      ...before,
      player: {
        ...before.player,
        inventory: before.player.inventory.map((slot, index) =>
          index === 0 ? null : slot
        )
      }
    };
    expect(verifyInventoryItemActionSucceeded(before, consumed, "item#heal")).toBe(
      true
    );
  });
});

function midCombatState(): GameState {
  const base = createInitialState("browser-bot-view-mid-combat");
  const playerPosition = { x: 2, y: 2 };
  const grid = createTileGrid({ width: 5, height: 5 });
  const fog = updateFogMemory(
    createFogMemory(grid),
    grid,
    visibleCells(grid, playerPosition, 3)
  );

  return {
    ...base,
    floor: {
      ...base.floor,
      geometry: {
        ...createFloorGeometrySlot(base.floor.geometry.refId, grid),
        opaque: {
          ...grid,
          fog
        } as unknown as SerializableRecord
      }
    },
    player: {
      ...base.player,
      hp: {
        current: 5,
        max: 20
      },
      level: 3,
      xp: 42,
      position: playerPosition,
      inventory: [healingDraught(), ...base.player.inventory.slice(1)]
    },
    entities: {
      "enemy#1": enemy("enemy#1", { x: 3, y: 2 })
    },
    ids: {
      ...base.ids,
      entityCounters: {
        ...base.ids.entityCounters,
        enemy: 1
      }
    }
  };
}

function healingDraught(): PlayerItemStack {
  return {
    itemInstanceId: "item#heal",
    definition: {
      ...validDraughtItemFixture,
      id: "healing-draught",
      name: "Healing Draught",
      draught: {
        effect: makeEffectBundleFixture(
          [validHealEffectFixture],
          validQuaffTriggerFixture,
          validSelfTargetingFixture
        )
      }
    } satisfies ItemDefinition,
    quantity: 1,
    identified: true
  };
}

function enemy(id: EntityId, position: Position): EnemyEntityInstance {
  return {
    id,
    kind: "enemy",
    definition:
      validEnemyDefinitionFixture as unknown as EnemyEntityInstance["definition"],
    position,
    currentHP: validEnemyDefinitionFixture.stats.hp,
    statuses: [],
    behaviorRuntime: {}
  };
}
