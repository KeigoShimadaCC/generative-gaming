import { config } from "../../config/index.js";
import type {
  EnemyDefinition,
  ItemDefinition,
  NpcDefinition,
  QuestDefinition,
  QuestObjective,
} from "../../schemas/entities/index.js";
import {
  makeQuestObjectiveFixture,
  validCoinItemFixture,
  validEnemyDefinitionFixture,
  validNpcDefinitionFixture,
} from "../../schemas/fixtures/entities.js";
import {
  createFloorGeometrySlot,
  createTile,
  createTileGrid,
  Terrain,
  type Tile,
  type TileGrid,
} from "../map/index.js";
import {
  createInitialState,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type InventorySlot,
  type NpcEntityInstance,
  type PlayerItemStack,
  type Position,
  type SerializableRecord,
} from "../state/index.js";
import type { QuestItemCatalog } from "./types.js";

export const testCatalog = (
  definitions: Record<string, ItemDefinition> = {},
): QuestItemCatalog => ({
  resolve: (definitionId) => definitions[definitionId] ?? null,
  coinDefinition: validCoinItemFixture,
});

export const makeQuestDefinition = (
  id: string,
  objective: QuestObjective,
  rewardOverrides: Partial<QuestDefinition["reward"]> = {},
): QuestDefinition => ({
  id,
  title: `Quest ${id}`,
  objective,
  reward: {
    valueMultiplier: config.itemsEconomy.questRewardValueMultiplier.min,
    coin: config.itemsEconomy.valueBandsCoin.shallows.min,
    itemIds: [],
    identifyItemIds: [],
    ...rewardOverrides,
  },
});

export const fetchQuest = (itemId = "key_item-1"): QuestDefinition =>
  makeQuestDefinition(
    "quest-fetch",
    makeQuestObjectiveFixture("fetch", "fetch", {
      itemId,
      floorScope: "this_floor",
    }),
  );

export const killQuest = (targetTag = "target-tag"): QuestDefinition =>
  makeQuestDefinition(
    "quest-kill",
    makeQuestObjectiveFixture("kill", "kill", { targetTag }),
  );

export const reachQuest = (featureId = "stairs"): QuestDefinition =>
  makeQuestDefinition(
    "quest-reach",
    makeQuestObjectiveFixture("reach", "reach", { featureId }),
  );

export const deliverQuest = (
  itemId = "key_item-1",
  npcId = "npc-ward",
): QuestDefinition =>
  makeQuestDefinition(
    "quest-deliver",
    makeQuestObjectiveFixture("deliver", "deliver", { itemId, npcId }),
  );

export const escortQuest = (npcId = "npc-ward"): QuestDefinition =>
  makeQuestDefinition(
    "quest-escort",
    makeQuestObjectiveFixture("escort", "escort", { npcId }),
  );

export const constraintQuest = (
  engineFlag: "take_no_damage" | "kill_nothing" = "take_no_damage",
): QuestDefinition =>
  makeQuestDefinition(
    "quest-constraint",
    makeQuestObjectiveFixture("constraint", "constraint", { engineFlag }),
  );

export const parseMap = (
  rows: readonly string[],
): { readonly grid: TileGrid; readonly markers: ReadonlyMap<string, Position> } => {
  const width = rows[0]?.length ?? 0;
  const tiles: Tile[] = [];
  const markerEntries: [string, Position][] = [];

  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];

    if (row === undefined || row.length !== width) {
      throw new Error("fixture rows must have equal width");
    }

    for (let x = 0; x < row.length; x += 1) {
      const character = row[x];
      const position = { x, y };
      const tile = tileForCharacter(character);

      if (character === "P") {
        tiles.push(createTile(Terrain.StairsDown));
        markerEntries.push(["@", position]);
        continue;
      }

      tiles.push(tile);

      if (character !== undefined && /[A-Z@NW]/u.test(character)) {
        markerEntries.push([character, position]);
      }
    }
  }

  return {
    grid: createTileGrid({ width, height: rows.length, tiles }),
    markers: new Map(markerEntries),
  };
};

export const stateFromMap = (
  seed: string,
  source: string,
  options: {
    readonly entities?: readonly (EnemyEntityInstance | NpcEntityInstance)[];
    readonly inventory?: readonly InventorySlot[];
    readonly features?: readonly SerializableRecord[];
  } = {},
): GameState => {
  const { grid, markers } = parseMap(source.split("\n"));
  const playerPosition = marker(markers, "@");

  return withEntities(
    withGrid(
      {
        ...createInitialState(seed),
        player: {
          ...createInitialState(seed).player,
          position: playerPosition,
          inventory:
            options.inventory ??
            createInitialState(seed).player.inventory,
        },
      },
      grid,
      options.features,
    ),
    options.entities ?? [],
  );
};

export const withGrid = (
  state: GameState,
  grid: TileGrid,
  features: readonly SerializableRecord[] = [],
): GameState => {
  const runtimeGrid =
    features.length === 0
      ? grid
      : ({
          ...grid,
          knowledge: {
            decorativeFeatures: features,
          },
        } as TileGrid & {
          readonly knowledge: {
            readonly decorativeFeatures: readonly SerializableRecord[];
          };
        });

  return {
    ...state,
    floor: {
      ...state.floor,
      geometry: createFloorGeometrySlot(state.floor.geometry.refId, runtimeGrid),
    },
  };
};

export const withEntities = (
  state: GameState,
  entities: readonly (EnemyEntityInstance | NpcEntityInstance)[],
): GameState => ({
  ...state,
  entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
});

export const enemy = (
  id: EntityId,
  position: Position,
  options: {
    readonly definition?: EnemyDefinition;
    readonly questTargetTag?: string;
  } = {},
): EnemyEntityInstance => ({
  id,
  kind: "enemy",
  definition: (options.definition ??
    validEnemyDefinitionFixture) as EnemyEntityInstance["definition"],
  position,
  currentHP: (options.definition ?? validEnemyDefinitionFixture).stats.hp,
  statuses: [],
  behaviorRuntime:
    options.questTargetTag === undefined
      ? {}
      : { questTargetTag: options.questTargetTag },
});

export const npc = (
  id: EntityId,
  position: Position,
  definition: NpcDefinition = npcDefinition("npc-ward"),
): NpcEntityInstance => ({
  id,
  kind: "npc",
  definition,
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime: {},
  dialogueRuntime: {},
});

export const npcDefinition = (
  id: string,
  questHook: QuestDefinition | null = null,
): NpcDefinition => ({
  ...validNpcDefinitionFixture,
  id,
  questHook,
});

export const carriedStack = (
  itemInstanceId: string,
  definition: ItemDefinition,
  quantity = 1,
): PlayerItemStack => ({
  itemInstanceId,
  definition,
  quantity,
  identified: true,
});

export const withInventoryItem = (
  state: GameState,
  stack: PlayerItemStack,
): GameState => {
  const inventory = [...state.player.inventory];
  const emptyIndex = inventory.findIndex((slot) => slot === null);

  if (emptyIndex === -1) {
    throw new Error("inventory full in fixture");
  }

  inventory[emptyIndex] = stack;

  return {
    ...state,
    player: {
      ...state.player,
      inventory,
    },
  };
};

const tileForCharacter = (character: string | undefined): Tile => {
  switch (character) {
    case "#":
      return createTile(Terrain.Wall);
    case ">":
      return createTile(Terrain.StairsDown);
    case ".":
    case "@":
    case "E":
    case "N":
    case "W":
      return createTile(Terrain.Floor);
    default:
      return createTile(Terrain.Floor);
  }
};

const marker = (
  markers: ReadonlyMap<string, Position>,
  name: string,
): Position => {
  const position = markers.get(name);

  if (position === undefined) {
    throw new Error(`missing marker ${name}`);
  }

  return position;
};
