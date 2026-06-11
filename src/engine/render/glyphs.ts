import type { ItemDefinition } from "../../schemas/entities/index.js";
import type { Tile } from "../map/index.js";
import { Terrain } from "../map/index.js";

export const GLYPH_PLAYER = "@";

export const GLYPH_TRAP = "^";

export const GLYPH_NPC = "N";

export const GLYPH_ENEMY_FALLBACK = "e";

export const terrainGlyph = (tile: Tile): string => {
  switch (tile.terrain) {
    case Terrain.Wall:
      return "#";
    case Terrain.Floor:
      return ".";
    case Terrain.Door:
      return tile.door === "open" ? "'" : "+";
    case Terrain.Water:
      return "~";
    case Terrain.StairsDown:
      return ">";
    case Terrain.Entrance:
      return "<";
  }
};

export const rememberedTerrainGlyph = (tile: Tile): string => {
  switch (tile.terrain) {
    case Terrain.Wall:
      return ":";
    case Terrain.Floor:
      return ",";
    case Terrain.Door:
      return tile.door === "open" ? "'" : "+";
    case Terrain.Water:
      return ",";
    case Terrain.StairsDown:
      return ">";
    case Terrain.Entrance:
      return "<";
  }
};

export const itemGlyph = (
  definition: ItemDefinition,
  identified: boolean,
): string => {
  if (!identified) {
    return "?";
  }

  switch (definition.kind) {
    case "draught":
      return "!";
    case "weapon":
    case "armor":
    case "charm":
      return "=";
    case "food":
      return "%";
    case "coin":
      return "$";
    case "note":
      return '"';
    case "throwable":
      return ")";
    case "tool":
      return "(";
    case "key_item":
      return "-";
    default:
      return definition.glyph.slice(0, 1);
  }
};

export const enemyGlyph = (glyph: string | undefined): string =>
  glyph === undefined || glyph.length === 0 ? GLYPH_ENEMY_FALLBACK : glyph.slice(0, 1);
