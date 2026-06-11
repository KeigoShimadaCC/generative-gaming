import { describe, expect, it } from "vitest";

import { bounds } from "../../config/index.js";
import {
  makeBehaviorFixture,
  validEnemyDefinitionFixture,
} from "../../schemas/fixtures/entities.js";
import type { Behavior } from "../../schemas/entities/index.js";
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
  type Position,
  type SerializableRecord,
} from "../state/index.js";
import {
  alliesWithTag,
  atTether,
  distanceFromPost,
  distanceTo,
  guardPostFor,
  hpFraction,
  playerVisible,
  readWaypointList,
} from "./perception.js";

describe("perception helpers", () => {
  it("detects player visibility through open line of sight", () => {
    const state = stateFromFixture("perception-los", "@...E");

    expect(playerVisible(state, "enemy#1")).toBe(true);
  });

  it("blocks player visibility through walls", () => {
    const state = stateFromFixture("perception-wall", "@.#E");

    expect(playerVisible(state, "enemy#1")).toBe(false);
  });

  it("reports chebyshev distance and hp fraction", () => {
    const state = withEnemyHp(
      stateFromFixture("perception-distance", "@..E"),
      "enemy#1",
      5,
    );

    expect(distanceTo(state, "enemy#1")).toBe(3);
    expect(hpFraction(state, "enemy#1")).toBe(
      5 / validEnemyDefinitionFixture.stats.hp,
    );
  });

  it("filters allies by origin tag and sight", () => {
    const base = stateFromFixture("perception-allies", "@.AE");
    const primary = base.entities["enemy#1"] as EnemyEntityInstance;
    const state = withEntities(base, [
      primary,
      enemy("enemy#2", { x: 2, y: 0 }, "made"),
      enemy("enemy#3", { x: 4, y: 0 }, "old_stock"),
    ]);

    expect(alliesWithTag(state, "enemy#1", false).map((ally) => ally.id)).toEqual([
      "enemy#2",
    ]);
    expect(alliesWithTag(state, "enemy#1", true).map((ally) => ally.id)).toEqual([
      "enemy#2",
    ]);
  });

  it("reads guard posts and tether distance", () => {
    const state = stateFromFixture(
      "perception-guard",
      "P.E.",
      {
        post: { x: 0, y: 0 },
      },
      { x: 3, y: 0 },
    );

    const enemy = state.entities["enemy#1"] as EnemyEntityInstance;

    expect(guardPostFor(enemy)).toEqual({ x: 0, y: 0 });
    expect(distanceFromPost(state, "enemy#1", { x: 0, y: 0 })).toBe(2);
    expect(atTether(state, "enemy#1", { x: 0, y: 0 }, 2)).toBe(true);
    expect(atTether(state, "enemy#1", { x: 0, y: 0 }, 1)).toBe(false);
  });

  it("reads patrol waypoint lists from behavior runtime", () => {
    const state = stateFromFixture("perception-patrol", "E.....", {
      waypoints: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
    }, { x: 5, y: 0 });

    const enemy = state.entities["enemy#1"] as EnemyEntityInstance;

    expect(readWaypointList(enemy)).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
  });
});

const enemyWithBehaviors = (
  id: EntityId,
  position: Position,
  behaviors: readonly Behavior[],
  runtime: SerializableRecord = {},
  origin: "made" | "old_stock" = "made",
): EnemyEntityInstance => ({
  id,
  kind: "enemy",
  definition: {
    ...validEnemyDefinitionFixture,
    origin,
    behaviors: [...behaviors],
  },
  position,
  currentHP: validEnemyDefinitionFixture.stats.hp,
  statuses: [],
  behaviorRuntime: runtime,
});

const enemy = (
  id: EntityId,
  position: Position,
  origin: "made" | "old_stock" = "made",
): EnemyEntityInstance =>
  enemyWithBehaviors(id, position, validEnemyDefinitionFixture.behaviors, {}, origin);

const stateFromFixture = (
  seed: string,
  source: string,
  runtime: SerializableRecord = {},
  playerPosition?: Position,
): GameState => {
  const { grid, markers } = parseMap(source);
  const entities: EnemyEntityInstance[] = [];
  const enemyPosition = markers.get("E");

  if (enemyPosition !== undefined) {
    entities.push(
      enemyWithBehaviors(
        "enemy#1",
        enemyPosition,
        validEnemyDefinitionFixture.behaviors,
        runtime,
      ),
    );
  }

  return withEntities(
    withGrid(
      createInitialState(seed),
      grid,
      playerPosition ?? marker(markers, "@"),
    ),
    entities,
  );
};

const withEnemyHp = (
  state: GameState,
  enemyId: EntityId,
  currentHP: number,
): GameState => {
  const enemyEntity = state.entities[enemyId];

  if (enemyEntity?.kind !== "enemy") {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [enemyId]: {
        ...enemyEntity,
        currentHP,
      },
    },
  };
};

const withEntities = (
  state: GameState,
  entities: readonly EnemyEntityInstance[],
): GameState => ({
  ...state,
  entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
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

const parseMap = (
  source: string,
): { readonly grid: TileGrid; readonly markers: Map<string, Position> } => {
  const rows = source.split("\n");
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

      if (character !== undefined && /[A-Z@P]/u.test(character)) {
        markerEntries.push([character, position]);
      }

      tiles.push(tileForCharacter(character));
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
    case "E":
    case "A":
    case "P":
      return createTile(Terrain.Floor);
    default:
      throw new Error(`unsupported fixture character ${String(character)}`);
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

void bounds;
void makeBehaviorFixture;
