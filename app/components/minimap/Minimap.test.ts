import { describe, expect, it } from "vitest";

import {
  createFogMixGridFixtureState,
  createMidActionGridFixtureState,
} from "@/components/grid/fixtures";
import { createGridViewModel } from "@/components/grid/model";
import {
  createInitialState,
  type GameState,
  type SerializableRecord,
} from "@engine/state";
import {
  createTileGrid,
  Terrain,
  type FogMemory,
  type TileGrid,
} from "@engine/map";

import { createMinimapViewModel } from "./model";

describe("Minimap", () => {
  it("marks explored floor, unseen tiles, player, stairs, and hoard from the grid view-model", () => {
    const fogModel = createMinimapViewModel(
      createGridViewModel(createFogMixGridFixtureState()),
    );

    expect(markAt(fogModel, 1, 1)).toBe("player");
    expect(markAt(fogModel, 2, 1)).toBe("floor-remembered");
    expect(markAt(fogModel, 4, 0)).toBe("unseen");

    const actionModel = createMinimapViewModel(
      createGridViewModel(createMidActionGridFixtureState()),
    );

    expect(markAt(actionModel, 1, 1)).toBe("player");
    expect(markAt(actionModel, 2, 2)).toBe("stairs");

    const hoardModel = createMinimapViewModel(
      createGridViewModel(createHoardFixtureState()),
    );

    expect(markAt(hoardModel, 2, 1)).toBe("hoard");
    expect(hoardModel.description).toContain("Hoard at 2,1");
    expect(hoardModel.description).toContain("Player at 1,1");
  });
});

const createHoardFixtureState = (): GameState => {
  const grid = createTileGrid({
    width: 4,
    height: 3,
    fill: Terrain.Floor,
  });
  const hoard: SerializableRecord = {
    id: "hoard",
    kind: "hoard",
    name: "The Hoard",
    x: 2,
    y: 1,
    depth: 1,
  };

  return {
    ...createInitialState("minimap-hoard"),
    player: {
      ...createInitialState("minimap-hoard").player,
      position: { x: 1, y: 1 },
    },
    floor: {
      ...createInitialState("minimap-hoard").floor,
      geometry: {
        refId: createInitialState("minimap-hoard").floor.geometry.refId,
        opaque: {
          ...grid,
          fog: visibleFogForGrid(grid),
          knowledge: {
            decorativeFeatures: [hoard],
          },
        },
      },
    },
  };
};

const markAt = (
  model: ReturnType<typeof createMinimapViewModel>,
  x: number,
  y: number,
) => model.cells.find((cell) => cell.x === x && cell.y === y)?.mark;

const visibleFogForGrid = (grid: TileGrid): FogMemory => ({
  ownerId: "player",
  width: grid.width,
  height: grid.height,
  tiles: grid.tiles.map((tile) => ({
    state: "visible" as const,
    rememberedTile: tile,
  })),
});
