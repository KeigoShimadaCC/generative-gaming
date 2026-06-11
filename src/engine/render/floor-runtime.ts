import type { FogMemory, TileGrid } from "../map/index.js";
import type { EntityId, GameState } from "../state/index.js";

export type FloorKnowledge = {
  readonly mapRevealed?: boolean;
  readonly revealedItemIds?: readonly EntityId[];
  readonly revealedEnemyIds?: readonly EntityId[];
  readonly revealedTrapIds?: readonly EntityId[];
};

type FloorRuntimeOpaque = TileGrid & {
  readonly fog?: FogMemory;
  readonly knowledge?: FloorKnowledge;
};

export const gridFromState = (state: GameState): TileGrid | null => {
  const opaque = state.floor.geometry.opaque;

  if (
    opaque === null ||
    typeof opaque !== "object" ||
    !("kind" in opaque) ||
    opaque.kind !== "tile-grid" ||
    typeof opaque.width !== "number" ||
    typeof opaque.height !== "number" ||
    !Array.isArray(opaque.tiles)
  ) {
    return null;
  }

  return opaque as unknown as TileGrid;
};

export const fogFromState = (
  state: GameState,
  grid: TileGrid,
): FogMemory | null => {
  const fog = (state.floor.geometry.opaque as FloorRuntimeOpaque | null)?.fog;

  if (
    fog !== undefined &&
    fog.width === grid.width &&
    fog.height === grid.height &&
    fog.tiles.length === grid.tiles.length
  ) {
    return fog;
  }

  return null;
};

export const defaultVisibleFog = (grid: TileGrid): FogMemory => ({
  ownerId: "player",
  width: grid.width,
  height: grid.height,
  tiles: grid.tiles.map((tile) => ({
    state: "visible" as const,
    rememberedTile: tile,
  })),
});

export const floorKnowledge = (state: GameState): FloorKnowledge =>
  (state.floor.geometry.opaque as FloorRuntimeOpaque | null)?.knowledge ?? {};

export const isTrapRevealed = (
  state: GameState,
  trapId: EntityId,
  behaviorRuntime: { readonly [key: string]: unknown },
): boolean => {
  if (behaviorRuntime.revealed === true) {
    return true;
  }

  const knowledge = floorKnowledge(state);

  return knowledge.revealedTrapIds?.includes(trapId) ?? false;
};
