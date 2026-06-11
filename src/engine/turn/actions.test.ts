import { describe, expect, it } from "vitest";

import { config } from "../../config/index.js";
import type { ItemDefinition } from "../../schemas/entities/index.js";
import {
  validCoinItemFixture,
  validEnemyDefinitionFixture,
  validNpcDefinitionFixture,
  validToolItemFixture,
} from "../../schemas/fixtures/entities.js";
import {
  createFloorGeometrySlot,
  createTile,
  createTileGrid,
  Terrain,
  withTile,
} from "../map/index.js";
import {
  createInitialState,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type GroundItemEntityInstance,
  type InventorySlot,
  type NpcEntityInstance,
  type PlayerItemStack,
  type Position,
} from "../state/index.js";
import {
  checkActionLegality,
  getAvailableActions,
  type MoveAction,
} from "./actions.js";

describe("structured action legality", () => {
  it("checks 8-way movement against map bounds and walkable terrain", () => {
    const openGrid = createTileGrid({ width: 2, height: 2 });
    const blockedGrid = withTile(openGrid, { x: 1, y: 0 }, createTile(Terrain.Wall));
    const state = withGrid(createInitialState("move-legality"), blockedGrid, {
      x: 0,
      y: 0,
    });

    const moveActions = getAvailableActions(state).filter(
      (action): action is MoveAction => action.kind === "move",
    );

    expect(moveActions.map((action) => action.direction)).toEqual([
      "south",
      "southeast",
    ]);

    const north = checkActionLegality(state, {
      kind: "move",
      direction: "north",
    });
    const east = checkActionLegality(state, {
      kind: "move",
      direction: "east",
    });

    expect(north.status).toBe("illegal");
    if (north.status === "illegal") {
      expect(north.reason).toContain("leaves the map");
    }
    expect(east.status).toBe("illegal");
    if (east.status === "illegal") {
      expect(east.reason).toContain("blocks movement");
    }
  });

  it("enumerates every currently legal structured action in bounded sets", () => {
    const grid = withTile(
      createTileGrid({ width: 3, height: 3 }),
      { x: 1, y: 1 },
      createTile(Terrain.StairsDown),
    );
    const carriedItem = carriedTool("carried-tool#1");
    const state = withInventory(
      withEntities(
        withGrid(createInitialState("available-actions"), grid, { x: 1, y: 1 }),
        [
          enemy("enemy#1", { x: 2, y: 1 }),
          npc("npc#1", { x: 1, y: 2 }),
          groundItem("item#1", { x: 1, y: 1 }),
        ],
      ),
      [
        carriedItem,
        ...Array.from(
          { length: config.playerCharacter.inventory.slots - 1 },
          () => null,
        ),
      ],
    );

    const actions = getAvailableActions(state);

    expect(actions.filter((action) => action.kind === "move")).toHaveLength(8);
    expect(actions).toContainEqual({
      kind: "attack",
      targetId: "enemy#1",
    });
    expect(actions).toContainEqual({
      kind: "use_item",
      itemId: carriedItem.itemInstanceId,
    });
    expect(actions).toContainEqual({ kind: "pickup" });
    expect(actions).toContainEqual({
      kind: "talk",
      npcId: "npc#1",
    });
    expect(actions).toContainEqual({ kind: "wait" });
    expect(actions).toContainEqual({ kind: "descend" });
    expect(actions.filter((action) => action.kind === "inspect")).toHaveLength(9);
    expect(actions).toContainEqual({ kind: "abort" });
  });

  it("returns typed illegal results with loggable reasons", () => {
    const state = withGrid(
      createInitialState("illegal-reasons"),
      createTileGrid({ width: 2, height: 2 }),
      { x: 0, y: 0 },
    );

    const missingItem = checkActionLegality(state, {
      kind: "use_item",
      itemId: "missing-item",
    });
    const missingNpc = checkActionLegality(state, {
      kind: "talk",
      npcId: "npc#99",
    });
    const offMapInspect = checkActionLegality(state, {
      kind: "inspect",
      cell: { x: 2, y: 0 },
    });

    expect(missingItem).toMatchObject({ status: "illegal" });
    expect(missingNpc).toMatchObject({ status: "illegal" });
    expect(offMapInspect).toMatchObject({ status: "illegal" });

    if (missingItem.status === "illegal") {
      expect(missingItem.reason).toContain("not carried");
    }
    if (missingNpc.status === "illegal") {
      expect(missingNpc.reason).toContain("does not exist");
    }
    if (offMapInspect.status === "illegal") {
      expect(offMapInspect.reason).toContain("outside the map");
    }
  });
});

const withGrid = (
  state: GameState,
  grid: Parameters<typeof createFloorGeometrySlot>[1],
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
  inventory: readonly InventorySlot[],
): GameState => ({
  ...state,
  player: {
    ...state.player,
    inventory,
  },
});

const withEntities = (
  state: GameState,
  entities: readonly (EnemyEntityInstance | GroundItemEntityInstance | NpcEntityInstance)[],
): GameState => ({
  ...state,
  entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
});

const enemy = (id: EntityId, position: Position): EnemyEntityInstance => ({
  id,
  kind: "enemy",
  definition: validEnemyDefinitionFixture as unknown as EnemyEntityInstance["definition"],
  position,
  currentHP: validEnemyDefinitionFixture.stats.hp,
  statuses: [],
  behaviorRuntime: {},
});

const npc = (id: EntityId, position: Position): NpcEntityInstance => ({
  id,
  kind: "npc",
  definition: validNpcDefinitionFixture,
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime: {},
  dialogueRuntime: {},
});

const groundItem = (
  id: EntityId,
  position: Position,
): GroundItemEntityInstance => ({
  id,
  kind: "item",
  definition: validCoinItemFixture as unknown as ItemDefinition,
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime: {},
  quantity: 1,
  identified: true,
});

const carriedTool = (itemInstanceId: string): PlayerItemStack => ({
  itemInstanceId,
  definition: validToolItemFixture as unknown as ItemDefinition,
  quantity: 1,
  identified: true,
});
