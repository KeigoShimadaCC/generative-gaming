import { describe, expect, it } from "vitest";

import { config } from "../../config/index.js";
import { createTile, Terrain } from "./terrain.js";
import {
  coord,
  createFloorGeometrySlot,
  createGridForBand,
  createTileGrid,
  discCells,
  getTile,
  idx,
  inBounds,
  line,
  neighbors8,
  radiusCells,
  withTile,
} from "./grid.js";

describe("tile grid geometry", () => {
  it("creates serializable flat tile grids from config band geometry", () => {
    const grid = createGridForBand("shallows");

    expect(grid).toEqual({
      kind: "tile-grid",
      width: config.runStructure.floorGeometry.shallows.grid.width,
      height: config.runStructure.floorGeometry.shallows.grid.height,
      tiles: Array.from({ length: 32 * 20 }, () => ({
        terrain: Terrain.Floor,
        door: null,
      })),
    });

    expect(JSON.parse(JSON.stringify(grid))).toEqual(grid);
    expect(createFloorGeometrySlot("floor-geometry#1", grid)).toEqual({
      refId: "floor-geometry#1",
      opaque: grid,
    });
  });

  it("converts between coordinates and flat indices with bounds checks", () => {
    const grid = createTileGrid({ width: 4, height: 3 });

    expect(inBounds(grid, { x: 0, y: 0 })).toBe(true);
    expect(inBounds(grid, { x: 3, y: 2 })).toBe(true);
    expect(inBounds(grid, { x: -1, y: 0 })).toBe(false);
    expect(inBounds(grid, { x: 4, y: 0 })).toBe(false);
    expect(inBounds(grid, { x: 0, y: 3 })).toBe(false);

    expect(idx(grid, { x: 0, y: 0 })).toBe(0);
    expect(idx(grid, { x: 3, y: 2 })).toBe(11);
    expect(coord(grid, 0)).toEqual({ x: 0, y: 0 });
    expect(coord(grid, 11)).toEqual({ x: 3, y: 2 });
    expect(() => idx(grid, { x: 4, y: 2 })).toThrow(RangeError);
    expect(() => coord(grid, 12)).toThrow(RangeError);
  });

  it("returns 8-way neighbors in deterministic row-major order at corners and edges", () => {
    const grid = createTileGrid({ width: 3, height: 3 });

    expect(neighbors8(grid, { x: 1, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);
    expect(neighbors8(grid, { x: 0, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(neighbors8(grid, { x: 1, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it("computes Bresenham lines including both endpoints", () => {
    expect(line({ x: 0, y: 0 }, { x: 3, y: 2 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 2 },
    ]);
    expect(line({ x: 3, y: 2 }, { x: 0, y: 0 })).toEqual([
      { x: 3, y: 2 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ]);
    expect(line({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([
      { x: 2, y: 2 },
    ]);
  });

  it("enumerates bounded Euclidean radius discs deterministically", () => {
    const grid = createTileGrid({ width: 3, height: 3 });

    expect(discCells({ x: 1, y: 1 }, 1, grid)).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ]);
    expect(radiusCells({ x: 0, y: 0 }, 1, grid)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
  });

  it("replaces tiles immutably", () => {
    const grid = createTileGrid({ width: 2, height: 2 });
    const updated = withTile(grid, { x: 1, y: 0 }, createTile(Terrain.Wall));

    expect(getTile(grid, { x: 1, y: 0 })).toEqual(createTile(Terrain.Floor));
    expect(getTile(updated, { x: 1, y: 0 })).toEqual(createTile(Terrain.Wall));
  });
});
