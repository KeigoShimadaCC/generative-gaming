import { describe, expect, it } from "vitest";

import {
  createTile,
  isTransparentTile,
  isWalkableTile,
  TERRAIN_KINDS,
  TERRAIN_TRANSPARENT,
  TERRAIN_WALKABLE,
  Terrain,
} from "./terrain.js";

describe("terrain tables", () => {
  it("defines the phase terrain list", () => {
    expect(TERRAIN_KINDS).toEqual([
      "floor",
      "wall",
      "door",
      "water",
      "stairs_down",
      "entrance",
    ]);
  });

  it("matches walkability and transparency contract values", () => {
    expect(TERRAIN_WALKABLE).toEqual({
      floor: true,
      wall: false,
      door: true,
      water: true,
      stairs_down: true,
      entrance: true,
    });
    expect(TERRAIN_TRANSPARENT).toEqual({
      floor: true,
      wall: false,
      door: false,
      water: true,
      stairs_down: true,
      entrance: true,
    });
  });

  it("models door openness as tile state", () => {
    const closedDoor = createTile(Terrain.Door);
    const openDoor = createTile(Terrain.Door, "open");

    expect(closedDoor).toEqual({ terrain: "door", door: "closed" });
    expect(openDoor).toEqual({ terrain: "door", door: "open" });
    expect(isWalkableTile(closedDoor)).toBe(true);
    expect(isTransparentTile(closedDoor)).toBe(false);
    expect(isTransparentTile(openDoor)).toBe(true);
  });

  it("makes water walkable and transparent while walls block both", () => {
    const water = createTile(Terrain.Water);
    const wall = createTile(Terrain.Wall);

    expect(isWalkableTile(water)).toBe(true);
    expect(isTransparentTile(water)).toBe(true);
    expect(isWalkableTile(wall)).toBe(false);
    expect(isTransparentTile(wall)).toBe(false);
  });
});
