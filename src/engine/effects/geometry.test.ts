import { describe, expect, it } from "vitest";

import { bounds } from "../../config/index.js";
import { validEnemyDefinitionFixture } from "../../schemas/fixtures/entities.js";
import {
  makeTargetingFixture,
  validFloorTargetingFixture,
  validMeleeTargetingFixture,
  validSelfTargetingFixture
} from "../../schemas/fixtures/vocab.js";
import type { TargetingShape } from "../../schemas/vocab/index.js";
import {
  createFloorGeometrySlot,
  createTile,
  createTileGrid,
  Terrain,
  type Tile,
  type TileGrid
} from "../map/index.js";
import {
  createInitialState,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type Position
} from "../state/index.js";
import { serialize } from "../state/serialize.js";
import {
  resolveTargetingGeometry,
  type TargetingContext,
  type TargetingGeometryResult
} from "./geometry.js";

describe("targeting geometry", () => {
  it("resolves self to the origin actor", () => {
    const state = stateFromFixture("self-shape", "@");
    const result = resolve(state, { x: 0, y: 0 }, validSelfTargetingFixture, {
      originActorId: "player"
    });

    expect(result).toEqual({
      cells: [{ x: 0, y: 0 }],
      entityIds: ["player"]
    });
  });

  it("resolves melee to an adjacent target cell including diagonals", () => {
    const state = stateFromFixture("melee-diagonal", "@..\n.E.");
    const result = resolve(state, { x: 0, y: 0 }, validMeleeTargetingFixture, {
      originActorId: "player",
      targetCell: { x: 1, y: 1 }
    });

    expect(result).toEqual({
      cells: [{ x: 1, y: 1 }],
      entityIds: ["enemy#1"]
    });
  });

  it("returns empty melee targeting for non-adjacent cells", () => {
    const state = stateFromFixture("melee-range", "@.E");
    const result = resolve(state, { x: 0, y: 0 }, validMeleeTargetingFixture, {
      originActorId: "player",
      targetCell: { x: 2, y: 0 }
    });

    expect(result).toEqual({ cells: [], entityIds: [] });
  });

  it("hits the first entity along a transparent bolt line", () => {
    const state = stateFromFixture("bolt-first-target", "@.A.B");
    const targeting = boltTargeting(4);
    const result = resolve(state, { x: 0, y: 0 }, targeting, {
      originActorId: "player",
      targetCell: { x: 4, y: 0 }
    });

    expect(result.cells).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ]);
    expect(result.entityIds).toEqual(["enemy#1"]);
  });

  it("stops bolt traversal at opaque walls without returning entities behind them", () => {
    const state = stateFromFixture("bolt-wall-stop", "@.#E");
    const targeting = boltTargeting(4);
    const result = resolve(state, { x: 0, y: 0 }, targeting, {
      originActorId: "player",
      targetCell: { x: 3, y: 0 }
    });

    expect(result).toEqual({
      cells: [{ x: 1, y: 0 }],
      entityIds: []
    });
  });

  it("caps bolt cells at the configured range even when the aim cell is farther", () => {
    const state = stateFromFixture("bolt-range-cap", "@..A....B");
    const range = bounds.effectVocabulary.targetingShapes.boltRangeTiles.min;
    const targeting = boltTargeting(range);
    const result = resolve(state, { x: 0, y: 0 }, targeting, {
      originActorId: "player",
      targetCell: { x: 8, y: 0 }
    });

    expect(result.cells).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 }
    ]);
    expect(result.entityIds).toEqual(["enemy#1"]);
  });

  it("clips burst discs at map edges", () => {
    const state = stateFromFixture("burst-edge", "@.");
    const targeting = burstTargeting(2, "self");
    const result = resolve(state, { x: 0, y: 0 }, targeting, {
      originActorId: "player"
    });

    expect(result.cells).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 }
    ]);
    expect(result.entityIds).toEqual(["player"]);
  });

  it("centers burst on an impact cell when configured", () => {
    const state = stateFromFixture("burst-impact", "@.E");
    const targeting = burstTargeting(1, "impact");
    const result = resolve(state, { x: 0, y: 0 }, targeting, {
      originActorId: "player",
      targetCell: { x: 2, y: 0 }
    });

    expect(result.cells).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ]);
    expect(result.entityIds).toEqual(["enemy#1"]);
  });

  it("returns all walkable floor cells and excludes walls", () => {
    const state = stateFromFixture("floor-walkable", "@..\n#.#");
    const result = resolve(state, { x: 0, y: 0 }, validFloorTargetingFixture, {
      originActorId: "player"
    });

    expect(result.cells).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 }
    ]);
    expect(result.entityIds).toEqual(["player"]);
  });

  it("does not mutate game state", () => {
    const state = stateFromFixture("pure-mutation", "@.A");
    const before = serialize(state);
    const targeting = boltTargeting(3);

    resolve(state, { x: 0, y: 0 }, targeting, {
      originActorId: "player",
      targetCell: { x: 2, y: 0 }
    });
    resolve(state, { x: 0, y: 0 }, validFloorTargetingFixture, {
      originActorId: "player"
    });

    expect(serialize(state)).toBe(before);
  });
});

const resolve = (
  state: GameState,
  origin: Position,
  targeting: TargetingShape,
  context: TargetingContext
): TargetingGeometryResult =>
  resolveTargetingGeometry(state, origin, targeting, context);

const boltTargeting = (rangeTiles: number): TargetingShape =>
  makeTargetingFixture("bolt", "bolt", { rangeTiles });

const burstTargeting = (
  radiusTiles: number,
  center: "self" | "impact"
): TargetingShape =>
  makeTargetingFixture("burst", "burst", { radiusTiles, center });

type ParsedMap = {
  readonly grid: TileGrid;
  readonly markers: ReadonlyMap<string, Position>;
};

const stateFromFixture = (seed: string, source: string): GameState => {
  const { grid, markers } = parseMap(source);
  const entities: EnemyEntityInstance[] = [];

  for (const markerName of ["E", "A", "B"] as const) {
    const position = markers.get(markerName);

    if (position !== undefined) {
      entities.push(
        enemy(`enemy#${entities.length + 1}` as EntityId, position, {
          hp: validEnemyDefinitionFixture.stats.hp,
          attack: 2,
          defense: 0
        })
      );
    }
  }

  return withEntities(
    withGrid(createInitialState(seed), grid, marker(markers, "@")),
    entities
  );
};

const parseMap = (source: string): ParsedMap => {
  const rows = source.trim().split("\n");
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

      tiles.push(tileForCharacter(character));

      if (character !== undefined && /[A-Z@]/u.test(character)) {
        markerEntries.push([character, position]);
      }
    }
  }

  return {
    grid: createTileGrid({ width, height: rows.length, tiles }),
    markers: new Map(markerEntries)
  };
};

const tileForCharacter = (character: string | undefined): Tile => {
  switch (character) {
    case "#":
      return createTile(Terrain.Wall);
    case ".":
    case "@":
    case "E":
    case "A":
    case "B":
      return createTile(Terrain.Floor);
    default:
      throw new Error(`unsupported fixture character ${String(character)}`);
  }
};

const withGrid = (
  state: GameState,
  grid: TileGrid,
  position: Position
): GameState => ({
  ...state,
  floor: {
    ...state.floor,
    geometry: createFloorGeometrySlot(state.floor.geometry.refId, grid)
  },
  player: {
    ...state.player,
    position
  }
});

const withEntities = (
  state: GameState,
  entities: readonly EnemyEntityInstance[]
): GameState => ({
  ...state,
  entities: Object.fromEntries(entities.map((entity) => [entity.id, entity]))
});

const marker = (
  markers: ReadonlyMap<string, Position>,
  key: string
): Position => {
  const position = markers.get(key);

  if (position === undefined) {
    throw new Error(`fixture missing marker ${key}`);
  }

  return position;
};

const enemy = (
  id: EntityId,
  position: Position,
  overrides: Partial<EnemyEntityInstance["definition"]["stats"]> = {}
): EnemyEntityInstance => {
  const stats = {
    ...validEnemyDefinitionFixture.stats,
    ...overrides
  };

  return {
    id,
    kind: "enemy",
    definition: {
      ...validEnemyDefinitionFixture,
      stats
    } as unknown as EnemyEntityInstance["definition"],
    position,
    currentHP: stats.hp,
    statuses: [],
    behaviorRuntime: {}
  };
};
