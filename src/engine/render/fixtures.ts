import {
  validDraughtItemFixture,
  validEnemyDefinitionFixture,
  validTrapDefinitionFixture,
} from "../../schemas/fixtures/entities.js";
import {
  createTile,
  createTileGrid,
  idx,
  updateFogMemory,
  visibleCells,
  withTile,
  Terrain,
  type Tile,
  type TileGrid,
} from "../map/index.js";
import { createInitialState } from "../state/index.js";
import type {
  EnemyEntityInstance,
  EntityId,
  GameState,
  GroundItemEntityInstance,
  Position,
  TrapEntityInstance,
} from "../state/index.js";
import type { FogMemory } from "../map/index.js";

export const midActionFixtureState = (): GameState => {
  const grid = createTileGrid({
    width: 5,
    height: 3,
    tiles: parseAsciiTiles([
      "#####",
      "#@.e#",
      "#+>?#",
    ]),
  });

  const playerPosition = { x: 1, y: 1 };
  const state = withFloorGrid(
    withPlayer(
      createInitialState("render-mid-action"),
      {
        position: playerPosition,
        hp: { current: 14, max: 20 },
        level: 2,
        xp: 35,
        fullness: { current: 72, max: 100 },
        statuses: [{ status: "poison", duration: 2 }],
        turn: 7,
        depth: 2,
      },
    ),
    grid,
    createFogMemoryForGrid(grid),
  );

  return {
    ...state,
    entities: {
      "enemy#1": enemyAt("enemy#1", { x: 3, y: 1 }),
      "item#1": itemAt("item#1", validDraughtItemFixture, { x: 2, y: 1 }, false),
      "trap#1": trapAt("trap#1", { x: 3, y: 2 }, true),
    },
    ids: {
      entityCounters: {
        enemy: 1,
        item: 1,
        npc: 0,
        trap: 1,
      },
    },
  };
};

export const fogMixFixtureState = (): GameState => {
  const grid = createTileGrid({
    width: 5,
    height: 3,
    tiles: parseAsciiTiles([
      "#####",
      "#@.##",
      "#...#",
    ]),
  });
  const origin = { x: 1, y: 1 };
  const wall = { x: 3, y: 1 };
  const initialFog = createFogMemoryForGrid(grid);
  const visibleFog = updateFogMemory(
    initialFog,
    grid,
    visibleCells(grid, origin, 2),
  );
  const changedGrid = withTile(grid, wall, createTile(Terrain.Floor));
  const rememberedFog = updateFogMemory(
    visibleFog,
    changedGrid,
    new Set([idx(grid, origin)]),
  );

  return withFloorGrid(
    withPlayer(createInitialState("render-fog-mix"), {
      position: origin,
      turn: 4,
    }),
    changedGrid,
    rememberedFog,
  );
};

const parseAsciiTiles = (rows: readonly string[]): Tile[] => {
  const tiles: Tile[] = [];

  for (const row of rows) {
    for (const character of row) {
      tiles.push(tileForCharacter(character));
    }
  }

  return tiles;
};

const tileForCharacter = (character: string): Tile => {
  switch (character) {
    case "#":
      return createTile(Terrain.Wall);
    case ".":
    case "@":
    case "e":
      return createTile(Terrain.Floor);
    case "+":
      return createTile(Terrain.Door, "closed");
    case ">":
      return createTile(Terrain.StairsDown);
    case "?":
      return createTile(Terrain.Water);
    default:
      throw new Error(`unsupported fixture character ${character}`);
  }
};

const createFogMemoryForGrid = (grid: TileGrid): FogMemory => ({
  ownerId: "player",
  width: grid.width,
  height: grid.height,
  tiles: grid.tiles.map(() => ({
    state: "visible" as const,
    rememberedTile: null,
  })),
});

type PlayerOverrides = {
  readonly position?: Position;
  readonly hp?: { readonly current: number; readonly max: number };
  readonly level?: number;
  readonly xp?: number;
  readonly fullness?: { readonly current: number; readonly max: number };
  readonly statuses?: GameState["player"]["statuses"];
  readonly turn?: number;
  readonly depth?: number;
};

const withPlayer = (
  state: GameState,
  overrides: PlayerOverrides,
): GameState => ({
  ...state,
  run: {
    ...state.run,
    turn: overrides.turn ?? state.run.turn,
    depth: overrides.depth ?? state.run.depth,
  },
  floor: {
    ...state.floor,
    depth: overrides.depth ?? state.floor.depth,
  },
  player: {
    ...state.player,
    position: overrides.position ?? state.player.position,
    hp: overrides.hp ?? state.player.hp,
    level: overrides.level ?? state.player.level,
    xp: overrides.xp ?? state.player.xp,
    fullness: overrides.fullness ?? state.player.fullness,
    statuses: overrides.statuses ?? state.player.statuses,
  },
});

const withFloorGrid = (
  state: GameState,
  grid: TileGrid,
  fog: FogMemory,
): GameState => ({
  ...state,
  floor: {
    ...state.floor,
    geometry: {
      refId: state.floor.geometry.refId,
      opaque: {
        ...grid,
        fog,
      },
    },
  },
});

const enemyAt = (id: EntityId, position: Position): EnemyEntityInstance => ({
  id,
  kind: "enemy",
  definition:
    validEnemyDefinitionFixture as unknown as EnemyEntityInstance["definition"],
  position,
  currentHP: 6,
  statuses: [],
  behaviorRuntime: {},
});

const itemAt = (
  id: EntityId,
  definition: GroundItemEntityInstance["definition"],
  position: Position,
  identified: boolean,
): GroundItemEntityInstance => ({
  id,
  kind: "item",
  definition,
  position,
  currentHP: null,
  quantity: 1,
  identified,
  statuses: [],
  behaviorRuntime: {},
});

const trapAt = (
  id: EntityId,
  position: Position,
  revealed: boolean,
): TrapEntityInstance => ({
  id,
  kind: "trap",
  definition: validTrapDefinitionFixture,
  position,
  currentHP: null,
  armed: true,
  statuses: [],
  behaviorRuntime: revealed ? { revealed: true } : {},
});
