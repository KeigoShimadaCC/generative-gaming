export const Terrain = {
  Floor: "floor",
  Wall: "wall",
  Door: "door",
  Water: "water",
  StairsDown: "stairs_down",
  Entrance: "entrance",
} as const;

export type TerrainKind = (typeof Terrain)[keyof typeof Terrain];

export type DoorState = "open" | "closed";

export type Tile = {
  readonly terrain: TerrainKind;
  readonly door: DoorState | null;
};

export const TERRAIN_KINDS = [
  Terrain.Floor,
  Terrain.Wall,
  Terrain.Door,
  Terrain.Water,
  Terrain.StairsDown,
  Terrain.Entrance,
] as const satisfies readonly TerrainKind[];

export const TERRAIN_WALKABLE = {
  [Terrain.Floor]: true,
  [Terrain.Wall]: false,
  [Terrain.Door]: true,
  [Terrain.Water]: true,
  [Terrain.StairsDown]: true,
  [Terrain.Entrance]: true,
} as const satisfies Record<TerrainKind, boolean>;

export const TERRAIN_TRANSPARENT = {
  [Terrain.Floor]: true,
  [Terrain.Wall]: false,
  [Terrain.Door]: false,
  [Terrain.Water]: true,
  [Terrain.StairsDown]: true,
  [Terrain.Entrance]: true,
} as const satisfies Record<TerrainKind, boolean>;

export const createTile = (
  terrain: TerrainKind,
  door: DoorState | null = null,
): Tile => ({
  terrain,
  door: terrain === Terrain.Door ? (door ?? "closed") : null,
});

export const cloneTile = (tile: Tile): Tile => ({
  terrain: tile.terrain,
  door: tile.terrain === Terrain.Door ? (tile.door ?? "closed") : null,
});

export const isWalkableTerrain = (terrain: TerrainKind): boolean =>
  TERRAIN_WALKABLE[terrain];

export const isTransparentTerrain = (terrain: TerrainKind): boolean =>
  TERRAIN_TRANSPARENT[terrain];

export const isWalkableTile = (tile: Tile): boolean =>
  TERRAIN_WALKABLE[tile.terrain];

export const isTransparentTile = (tile: Tile): boolean => {
  if (tile.terrain === Terrain.Door) {
    return tile.door === "open";
  }

  return TERRAIN_TRANSPARENT[tile.terrain];
};
