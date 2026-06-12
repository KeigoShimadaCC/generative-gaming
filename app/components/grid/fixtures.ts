import {
  createTile,
  createTileGrid,
  createFogMemory,
  idx,
  Terrain,
  updateFogMemory,
  visibleCells,
  withTile,
  type FogMemory,
  type Tile,
  type TileGrid,
} from "@engine/map";
import {
  createInitialState,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type GroundItemEntityInstance,
  type NpcEntityInstance,
  type Position,
  type TrapEntityInstance,
} from "@engine/state";

export type GridFixtureStory = {
  readonly id: string;
  readonly label: string;
  readonly createState: () => GameState;
};

export const createMidActionGridFixtureState = (): GameState => {
  const grid = createTileGrid({
    width: 5,
    height: 3,
    tiles: parseAsciiTiles([
      "#####",
      "#@.e#",
      "#+>?#",
    ]),
  });
  const state = withFloorGrid(
    withPlayer(createInitialState("grid-mid-action"), {
      position: { x: 1, y: 1 },
      hp: { current: 14, max: 20 },
      level: 2,
      xp: 35,
      fullness: { current: 72, max: 100 },
      statuses: [{ status: "poison", duration: 2 }],
      turn: 7,
      depth: 2,
    }),
    grid,
    visibleFogForGrid(grid),
  );

  return {
    ...state,
    entities: {
      "enemy#1": enemyAt("enemy#1", { x: 3, y: 1 }),
      "item#1": itemAt("item#1", { x: 2, y: 1 }, false),
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

export const createFogMixGridFixtureState = (): GameState => {
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
  const visibleFog = updateFogMemory(
    createFogMemory(grid),
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
    withPlayer(createInitialState("grid-fog-mix"), {
      position: origin,
      turn: 4,
    }),
    changedGrid,
    rememberedFog,
  );
};

export const createPrecedenceFixtureState = (): GameState => {
  const grid = createTileGrid({
    width: 5,
    height: 1,
    fill: Terrain.Floor,
  });
  const state = withFloorGrid(
    withPlayer(createInitialState("grid-precedence"), {
      position: { x: 0, y: 0 },
    }),
    grid,
    visibleFogForGrid(grid),
  );

  return {
    ...state,
    entities: {
      "enemy#1": enemyAt("enemy#1", { x: 0, y: 0 }),
      "npc#1": npcAt("npc#1", { x: 0, y: 0 }),
      "item#1": itemAt("item#1", { x: 0, y: 0 }, false),
      "trap#1": trapAt("trap#1", { x: 0, y: 0 }, true),
      "enemy#2": enemyAt("enemy#2", { x: 1, y: 0 }),
      "npc#2": npcAt("npc#2", { x: 1, y: 0 }),
      "item#2": itemAt("item#2", { x: 1, y: 0 }, false),
      "trap#2": trapAt("trap#2", { x: 1, y: 0 }, true),
      "npc#3": npcAt("npc#3", { x: 2, y: 0 }),
      "item#3": itemAt("item#3", { x: 2, y: 0 }, false),
      "trap#3": trapAt("trap#3", { x: 2, y: 0 }, true),
      "item#4": itemAt("item#4", { x: 3, y: 0 }, false),
      "trap#4": trapAt("trap#4", { x: 3, y: 0 }, true),
      "trap#5": trapAt("trap#5", { x: 4, y: 0 }, true),
    },
    ids: {
      entityCounters: {
        enemy: 2,
        item: 4,
        npc: 3,
        trap: 5,
      },
    },
  };
};

export const createLargestBandFixtureState = (): GameState => {
  const grid = createTileGrid({
    width: 40,
    height: 24,
    fill: Terrain.Floor,
  });
  const state = withFloorGrid(
    withPlayer(createInitialState("grid-largest-band"), {
      position: { x: 1, y: 1 },
      depth: 5,
    }),
    grid,
    visibleFogForGrid(grid),
  );

  return {
    ...state,
    entities: {
      "enemy#1": enemyAt("enemy#1", { x: 8, y: 7 }),
      "enemy#2": enemyAt("enemy#2", { x: 18, y: 15 }),
      "npc#1": npcAt("npc#1", { x: 28, y: 10 }),
      "item#1": itemAt("item#1", { x: 12, y: 20 }, false),
      "trap#1": trapAt("trap#1", { x: 34, y: 18 }, true),
    },
    ids: {
      entityCounters: {
        enemy: 2,
        item: 1,
        npc: 1,
        trap: 1,
      },
    },
  };
};

export const GRID_FIXTURE_STORIES = [
  {
    id: "mid-action",
    label: "Mid action",
    createState: createMidActionGridFixtureState,
  },
  {
    id: "fog-mix",
    label: "Fog mix",
    createState: createFogMixGridFixtureState,
  },
] as const satisfies readonly GridFixtureStory[];

export const withMovedPlayer = (
  state: GameState,
  to: Position,
  turn: number,
): GameState => ({
  ...state,
  run: {
    ...state.run,
    turn,
  },
  player: {
    ...state.player,
    position: to,
  },
  log: [
    ...state.log,
    {
      turn,
      type: "moved",
      data: {
        actorId: "player",
        direction: to.x >= state.player.position.x ? "east" : "west",
        from: state.player.position,
        to,
      },
    } as GameState["log"][number],
  ],
});

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
      throw new Error(`unsupported grid fixture character ${character}`);
  }
};

const visibleFogForGrid = (grid: TileGrid): FogMemory => ({
  ownerId: "player",
  width: grid.width,
  height: grid.height,
  tiles: grid.tiles.map((tile) => ({
    state: "visible" as const,
    rememberedTile: tile,
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
  definition: {
    id: "grid-fixture-enemy",
    name: "Brass Gnaw",
    glyph: "e",
    origin: "fallback",
    stats: {
      band: "shallows",
      hp: 6,
      attack: 2,
      defense: 0,
      xpYield: 1,
    },
    behaviors: [],
    abilities: [],
  } as unknown as EnemyEntityInstance["definition"],
  position,
  currentHP: 6,
  statuses: [],
  behaviorRuntime: {},
});

const itemAt = (
  id: EntityId,
  position: Position,
  identified: boolean,
): GroundItemEntityInstance => ({
  id,
  kind: "item",
  definition: {
    id: "grid-fixture-draught",
    name: "Blue Draught",
    glyph: "!",
    kind: "draught",
  } as unknown as GroundItemEntityInstance["definition"],
  position,
  currentHP: null,
  quantity: 1,
  identified,
  statuses: [],
  behaviorRuntime: {},
});

const npcAt = (id: EntityId, position: Position): NpcEntityInstance => ({
  id,
  kind: "npc",
  definition: {
    id: "grid-fixture-npc",
    name: "Still Cartographer",
    glyph: "N",
  } as unknown as NpcEntityInstance["definition"],
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime: {},
  dialogueRuntime: {},
});

const trapAt = (
  id: EntityId,
  position: Position,
  revealed: boolean,
): TrapEntityInstance => ({
  id,
  kind: "trap",
  definition: {
    id: "grid-fixture-trap",
    name: "Needle Plate",
    hidden: true,
  } as unknown as TrapEntityInstance["definition"],
  position,
  currentHP: null,
  armed: true,
  statuses: [],
  behaviorRuntime: revealed ? { revealed: true } : {},
});
