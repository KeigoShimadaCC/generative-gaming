import { describe, expect, it } from "vitest";

import {
  createTileGrid,
  getTile,
  type TileGrid,
} from "../map/index.js";
import { createTile, Terrain, type Tile } from "../map/terrain.js";
import { createRng } from "../rng/index.js";
import type { Position } from "../state/index.js";
import {
  floorParamsForBand,
  generateFloor,
  roomContaining,
  type RoomRect,
} from "./generate.js";
import {
  allocateCells,
  collectLegalPlacementCells,
  type PlacementGrid,
  type PlacementRequest,
} from "./place.js";

const placementRng = (seed: string) => createRng(seed).fork("floorgen");

const expectSuccessfulFloor = (seed: string) => {
  const result = generateFloor(floorParamsForBand("middle", "open", seed));
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.floor;
};

const toPlacementGrid = (floor: {
  grid: TileGrid;
  entrance: Position;
  stairsDown: Position;
  rooms: readonly RoomRect[];
}): PlacementGrid => ({
  grid: floor.grid,
  entrance: floor.entrance,
  stairsDown: floor.stairsDown,
  rooms: floor.rooms,
});

describe("allocateCells", () => {
  it("honors room-index and distance hints on generated fixtures", () => {
    const floor = expectSuccessfulFloor("phase17-place-hints");
    const grid = toPlacementGrid(floor);

    const roomIndex = floor.stairsRoomIndex;
    const result = allocateCells(
      grid,
      [
        {
          id: "stairs-room-enemy",
          kind: "enemy",
          hint: { roomIndex },
        },
      ],
      placementRng("phase17-place-hints"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const placement = result.placements[0];
    expect(placement).toBeDefined();
    expect(roomContaining(floor.rooms, placement?.position ?? { x: -1, y: -1 })).toBe(
      roomIndex,
    );
    expect(result.deviations).toEqual([]);

    const farResult = allocateCells(
      grid,
      [
        {
          id: "far-item",
          kind: "item",
          hint: { distance: "far_from_entrance" },
        },
      ],
      placementRng("phase17-place-far"),
    );

    expect(farResult.ok).toBe(true);
    if (!farResult.ok) {
      return;
    }

    const legal = collectLegalPlacementCells(grid);
    const maxDistance = Math.max(
      ...legal.map((position) =>
        Math.abs(position.x - floor.entrance.x) +
          Math.abs(position.y - floor.entrance.y),
      ),
    );
    const farPlacement = farResult.placements[0]?.position;
    expect(farPlacement).toBeDefined();
    const placedDistance =
      Math.abs((farPlacement?.x ?? 0) - floor.entrance.x) +
      Math.abs((farPlacement?.y ?? 0) - floor.entrance.y);
    expect(placedDistance).toBe(maxDistance);
    expect(farResult.deviations).toEqual([]);
  });

  it("records deviations when hints are unsatisfiable and still places legally", () => {
    const floor = expectSuccessfulFloor("phase17-place-deviation");
    const grid = toPlacementGrid(floor);

    const result = allocateCells(
      grid,
      [
        {
          id: "impossible-room",
          kind: "trap",
          hint: { roomIndex: floor.rooms.length + 5 },
        },
      ],
      placementRng("phase17-place-deviation"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.deviations).toEqual([
      {
        requestId: "impossible-room",
        hint: { roomIndex: floor.rooms.length + 5 },
        reasons: ["room_index_unsatisfiable"],
      },
    ]);

    const position = result.placements[0]?.position;
    expect(position).toBeDefined();
    expect(collectLegalPlacementCells(grid).some(
      (cell) => cell.x === position?.x && cell.y === position?.y,
    )).toBe(true);
  });

  it("keeps one entity per cell across 500 seeded crowded allocations", () => {
    const failures: string[] = [];

    for (let seedIndex = 0; seedIndex < 500; seedIndex += 1) {
      const floor = expectSuccessfulFloor(`phase17-place-crowd:${seedIndex}`);
      const grid = toPlacementGrid(floor);
      const legalCount = collectLegalPlacementCells(grid).length;
      const requestCount = Math.min(legalCount, 6 + (seedIndex % 4));

      const requests: PlacementRequest[] = Array.from(
        { length: requestCount },
        (_, index) => ({
          id: `entity-${index}`,
          kind: index % 2 === 0 ? "enemy" : "item",
          hint: index % 3 === 0 ? { spread: true } : undefined,
        }),
      );

      const result = allocateCells(
        grid,
        requests,
        placementRng(`phase17-place-crowd:${seedIndex}`),
      );

      if (!result.ok) {
        failures.push(`${seedIndex}: ${result.error.code}`);
        continue;
      }

      const keys = result.placements.map(
        (placement) => `${placement.position.x},${placement.position.y}`,
      );
      if (new Set(keys).size !== keys.length) {
        failures.push(`${seedIndex}: duplicate cell`);
      }
    }

    expect(failures).toEqual([]);
  }, 120_000);

  it("never places on exits or unreachable cells in adversarial fixtures", () => {
    const { grid, markers } = parsePlacementMap(UNREACHABLE_ISLAND);
    const entrance = marker(markers, "@");
    const stairsDown = marker(markers, "S");
    const placementGrid: PlacementGrid = {
      grid,
      entrance,
      stairsDown,
      rooms: [
        {
          x: 1,
          y: 1,
          width: 3,
          height: 3,
          center: { x: 2, y: 2 },
        },
        {
          x: 6,
          y: 1,
          width: 3,
          height: 3,
          center: { x: 7, y: 2 },
        },
      ],
    };

    const legal = collectLegalPlacementCells(placementGrid);
    expect(legal.some((cell) => cell.x === 7 && cell.y === 2)).toBe(false);

    const result = allocateCells(
      placementGrid,
      [
        { id: "a", kind: "enemy" },
        { id: "b", kind: "item" },
        { id: "c", kind: "trap" },
      ],
      placementRng("phase17-place-adversarial"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    for (const placement of result.placements) {
      expect(placement.position).not.toEqual(entrance);
      expect(placement.position).not.toEqual(stairsDown);
      expect(getTile(grid, placement.position).terrain).not.toBe(Terrain.Entrance);
      expect(getTile(grid, placement.position).terrain).not.toBe(Terrain.StairsDown);
      expect(legal.some(
        (cell) => cell.x === placement.position.x && cell.y === placement.position.y,
      )).toBe(true);
    }
  });

  it("is deterministic for the same floor, requests, and seed", () => {
    const floor = expectSuccessfulFloor("phase17-place-determinism");
    const grid = toPlacementGrid(floor);
    const requests: PlacementRequest[] = [
      { id: "e1", kind: "enemy", hint: { roomIndex: 0 } },
      { id: "i1", kind: "item", hint: { distance: "near_entrance" } },
      { id: "t1", kind: "trap", hint: { spread: true } },
    ];
    const rngSeed = "phase17-place-determinism";

    const first = allocateCells(grid, requests, placementRng(rngSeed));
    const second = allocateCells(grid, requests, placementRng(rngSeed));

    expect(first).toEqual(second);
  });

  it("returns a typed allocation error when requests exceed legal capacity", () => {
    const { grid, markers } = parsePlacementMap(TINY_ROOM);
    const entrance = marker(markers, "@");
    const stairsDown = marker(markers, "S");
    const placementGrid: PlacementGrid = {
      grid,
      entrance,
      stairsDown,
      rooms: [{ x: 1, y: 1, width: 3, height: 1, center: { x: 2, y: 1 } }],
    };

    const legalCount = collectLegalPlacementCells(placementGrid).length;
    const result = allocateCells(
      placementGrid,
      Array.from({ length: legalCount + 1 }, (_, index) => ({
        id: `req-${index}`,
        kind: "enemy" as const,
      })),
      placementRng("phase17-place-impossible"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toEqual({
      kind: "allocation-error",
      code: "capacity_exhausted",
      message: `cannot place ${legalCount + 1} entities on ${legalCount} legal cells`,
      legalCellCount: legalCount,
      requestCount: legalCount + 1,
    });
  });
});

const UNREACHABLE_ISLAND = `
##########
#@.......#
#.######.#
#.#....#.#
#.#.##.#.#
#.#....#.#
#.######S#
##########
`;

const TINY_ROOM = `
#####
#@S.#
#####
`;

type ParsedPlacementMap = {
  readonly grid: TileGrid;
  readonly markers: ReadonlyMap<string, Position>;
};

const parsePlacementMap = (source: string): ParsedPlacementMap => {
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
      const tile = tileForPlacementCharacter(character);

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

const tileForPlacementCharacter = (character: string | undefined): Tile => {
  switch (character) {
    case "#":
      return createTile(Terrain.Wall);
    case ".":
      return createTile(Terrain.Floor);
    case "@":
      return createTile(Terrain.Entrance);
    case "S":
      return createTile(Terrain.StairsDown);
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
