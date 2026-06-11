import { describe, expect, it } from "vitest";

import type { Position } from "../state/index.js";
import {
  createFogMemory,
  fogAt,
  updateFogMemory,
  visibleCells,
} from "./fov.js";
import {
  coord,
  createTileGrid,
  getTile,
  idx,
  withTile,
  type TileGrid,
} from "./grid.js";
import {
  createTile,
  isTransparentTile,
  isWalkableTile,
  Terrain,
  type Tile,
} from "./terrain.js";

describe("field of view", () => {
  it("is symmetric for transparent origin pairs on fixture maps", () => {
    for (const fixture of [OPEN_ROOM, PILLAR_ROOM, CORNER_ROOM]) {
      const { grid } = parseMap(fixture);
      const origins = grid.tiles
        .map((tile, index) => ({ tile, position: coord(grid, index) }))
        .filter(({ tile }) => isWalkableTile(tile) && isTransparentTile(tile))
        .map(({ position }) => position);

      for (const origin of origins) {
        for (const target of origins) {
          const originSeesTarget = visibleCells(grid, origin, 8).has(
            idx(grid, target),
          );
          const targetSeesOrigin = visibleCells(grid, target, 8).has(
            idx(grid, origin),
          );

          expect(originSeesTarget, `${formatPosition(origin)} -> ${formatPosition(target)}`).toBe(
            targetSeesOrigin,
          );
        }
      }
    }
  });

  it("casts a pillar shadow behind an opaque tile", () => {
    const { grid, markers } = parseMap(PILLAR_ROOM);
    const origin = marker(markers, "@");

    expect(visiblePattern(grid, visibleCells(grid, origin, 8), origin)).toBe(
      [
        "v...v",
        "vv.vv",
        "vv#vv",
        "vv@vv",
        "vvvvv",
      ].join("\n"),
    );
  });

  it("pins diagonal corner peeking to the symmetric shadowcasting rule", () => {
    const { grid, markers } = parseMap(CORNER_ROOM);
    const origin = marker(markers, "@");

    expect(visiblePattern(grid, visibleCells(grid, origin, 8), origin)).toBe(
      [
        "@#..",
        "#vv.",
        ".vvv",
        "..vv",
      ].join("\n"),
    );
  });

  it("uses caller-provided radius so later blind status can override sight range", () => {
    const { grid, markers } = parseMap(OPEN_ROOM);
    const origin = marker(markers, "@");

    expect(visiblePattern(grid, visibleCells(grid, origin, 1), origin)).toBe(
      [
        "..v..",
        ".v@v.",
        "..v..",
      ].join("\n"),
    );
    expect(visibleCells(grid, origin, 2).has(idx(grid, { x: 0, y: 0 }))).toBe(
      false,
    );
    expect(visibleCells(grid, origin, 3).has(idx(grid, { x: 0, y: 0 }))).toBe(
      true,
    );
  });
});

describe("fog memory", () => {
  it("transitions unseen to visible to remembered and keeps last-seen terrain", () => {
    const { grid, markers } = parseMap(FOG_ROOM);
    const origin = marker(markers, "@");
    const wall = marker(markers, "W");
    const hidden = marker(markers, "H");
    const fog = createFogMemory(grid, "player#1");

    expect(fogAt(fog, origin)).toEqual({
      state: "unseen",
      rememberedTile: null,
    });

    const visibleFog = updateFogMemory(fog, grid, visibleCells(grid, origin, 4));

    expect(fogAt(visibleFog, origin)).toEqual({
      state: "visible",
      rememberedTile: createTile(Terrain.Floor),
    });
    expect(fogAt(visibleFog, wall)).toEqual({
      state: "visible",
      rememberedTile: createTile(Terrain.Wall),
    });
    expect(fogAt(visibleFog, hidden)).toEqual({
      state: "unseen",
      rememberedTile: null,
    });

    const changedGrid = withTile(grid, wall, createTile(Terrain.Floor));
    const rememberedFog = updateFogMemory(
      visibleFog,
      changedGrid,
      new Set([idx(grid, origin)]),
    );

    expect(fogAt(rememberedFog, origin)).toEqual({
      state: "visible",
      rememberedTile: createTile(Terrain.Floor),
    });
    expect(fogAt(rememberedFog, wall)).toEqual({
      state: "remembered",
      rememberedTile: createTile(Terrain.Wall),
    });
    expect(fogAt(rememberedFog, hidden)).toEqual({
      state: "unseen",
      rememberedTile: null,
    });
  });
});

const OPEN_ROOM = `
.....
..@..
.....
`;

const PILLAR_ROOM = `
.....
.....
..#..
..@..
.....
`;

const CORNER_ROOM = `
@#..
#...
....
....
`;

const FOG_ROOM = `
@.W.H
#####
.....
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
    case "W":
      return createTile(Terrain.Wall);
    case "~":
      return createTile(Terrain.Water);
    case "+":
      return createTile(Terrain.Door, "closed");
    case "/":
      return createTile(Terrain.Door, "open");
    case ">":
      return createTile(Terrain.StairsDown);
    case "<":
      return createTile(Terrain.Entrance);
    case ".":
    case "@":
    case "H":
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

const visiblePattern = (
  grid: TileGrid,
  visible: ReadonlySet<number>,
  origin: Position,
): string => {
  const rows: string[] = [];

  for (let y = 0; y < grid.height; y += 1) {
    let row = "";

    for (let x = 0; x < grid.width; x += 1) {
      const position = { x, y };
      const tile = getTile(grid, position);
      const index = idx(grid, position);

      if (position.x === origin.x && position.y === origin.y) {
        row += "@";
      } else if (!visible.has(index)) {
        row += ".";
      } else if (tile.terrain === Terrain.Wall) {
        row += "#";
      } else {
        row += "v";
      }
    }

    rows.push(row);
  }

  return rows.join("\n");
};

const formatPosition = (position: Position): string =>
  `(${position.x}, ${position.y})`;
