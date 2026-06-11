import { describe, expect, it } from "vitest";

import type { Position } from "../state/index.js";
import { createTileGrid, type TileGrid } from "./grid.js";
import { path } from "./path.js";
import { createTile, Terrain, type Tile } from "./terrain.js";

describe("pathfinding", () => {
  it("returns shortest-path lengths on fixture maps", () => {
    const { grid, markers } = parseMap(CORRIDOR);
    const start = marker(markers, "@");
    const goal = marker(markers, "A");

    const route = path(grid, start, goal);

    expect(route).not.toBeNull();
    expect(route).toHaveLength(5);
    expect(route?.[0]).toEqual(start);
    expect(route?.[4]).toEqual(goal);
  });

  it("returns null when the goal is unreachable", () => {
    const { grid, markers } = parseMap(ISLAND_GOAL);
    const start = marker(markers, "@");
    const goal = marker(markers, "A");

    expect(path(grid, start, goal)).toBeNull();
  });

  it("returns identical routes across repeated runs", () => {
    const { grid, markers } = parseMap(TIE_ROOM);
    const start = marker(markers, "@");
    const goal = marker(markers, "A");

    const first = path(grid, start, goal);
    const second = path(grid, start, goal);

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
  });

  it("breaks equal-cost routes deterministically on symmetric maps", () => {
    const { grid, markers } = parseMap(TIE_ROOM);
    const start = marker(markers, "@");
    const goal = marker(markers, "A");

    expect(path(grid, start, goal)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  it("blocks closed doors unless openDoors is enabled", () => {
    const { grid, markers } = parseMap(DOOR_ROW);
    const start = marker(markers, "@");
    const goal = marker(markers, "A");

    expect(path(grid, start, goal)).toBeNull();
    expect(path(grid, start, goal, { openDoors: true })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it("respects an occupied-cell predicate except at the start", () => {
    const { grid, markers } = parseMap(OPEN_ROOM);
    const start = marker(markers, "@");
    const goal = marker(markers, "A");
    const blocked = marker(markers, "B");

    const isOccupied = (position: Position): boolean =>
      position.x === blocked.x && position.y === blocked.y;

    expect(path(grid, start, goal, { isOccupied })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
    ]);
    expect(path(grid, blocked, goal, { isOccupied })).not.toBeNull();
  });

  it("returns a single coordinate when start equals goal on walkable terrain", () => {
    const { grid, markers } = parseMap(OPEN_ROOM);
    const start = marker(markers, "@");

    expect(path(grid, start, start)).toEqual([start]);
  });

  it("returns null when the only route is through a closed door tile", () => {
    const { grid, markers } = parseMap(DOOR_ROW);
    const start = marker(markers, "@");
    const goal = marker(markers, "A");

    expect(path(grid, start, goal)).toBeNull();
  });

  it("routes around walls using diagonal steps when they are cheaper", () => {
    const { grid, markers } = parseMap(DIAGONAL_SHORTCUT);
    const start = marker(markers, "@");
    const goal = marker(markers, "A");

    expect(path(grid, start, goal)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  it("does not mutate the input grid or options", () => {
    const serialize = (value: unknown): string => JSON.stringify(value);

    const { grid: reachableGrid, markers: reachableMarkers } =
      parseMap(CORRIDOR);
    const reachableGridSnapshot = serialize(reachableGrid);
    const reachableStart = marker(reachableMarkers, "@");
    const reachableGoal = marker(reachableMarkers, "A");

    const { grid: unreachableGrid, markers: unreachableMarkers } =
      parseMap(ISLAND_GOAL);
    const unreachableGridSnapshot = serialize(unreachableGrid);
    const unreachableStart = marker(unreachableMarkers, "@");
    const unreachableGoal = marker(unreachableMarkers, "A");

    const { grid: doorGrid, markers: doorMarkers } = parseMap(DOOR_ROW);
    const doorGridSnapshot = serialize(doorGrid);
    const doorStart = marker(doorMarkers, "@");
    const doorGoal = marker(doorMarkers, "A");
    const opts = { openDoors: true };
    const optsSnapshot = serialize(opts);

    path(reachableGrid, reachableStart, reachableGoal);
    path(unreachableGrid, unreachableStart, unreachableGoal);
    path(doorGrid, doorStart, doorGoal, opts);

    expect(serialize(reachableGrid)).toBe(reachableGridSnapshot);
    expect(serialize(unreachableGrid)).toBe(unreachableGridSnapshot);
    expect(serialize(doorGrid)).toBe(doorGridSnapshot);
    expect(serialize(opts)).toBe(optsSnapshot);
  });
});

const OPEN_ROOM = `
.....
.@...
..B..
...A.
`;

const CORRIDOR = `
#####
#@...
####.
#...A
#####
`;

const ISLAND_GOAL = `
.....
.@...
.###.
.#A#.
.###.
`;

const TIE_ROOM = `
@..
.#.
..A
`;

const DOOR_ROW = `@+.A`;

const DIAGONAL_SHORTCUT = `
@..
...
..A
`;

type ParsedMap = {
  readonly grid: TileGrid;
  readonly markers: ReadonlyMap<string, Position>;
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
      const tile = tileForCharacter(character);

      if (character !== undefined && /[A-Z@]/u.test(character)) {
        markerEntries.push([character, position]);
      }

      tiles.push(tile);
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
    case "+":
      return createTile(Terrain.Door, "closed");
    case "/":
      return createTile(Terrain.Door, "open");
    case ".":
    case "@":
    case "A":
    case "B":
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
