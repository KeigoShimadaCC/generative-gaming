import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { config } from "../../config/index.js";
import { path as findPath } from "../map/path.js";
import { Terrain } from "../map/terrain.js";
import { LAYOUT_FLAVORS } from "./flavors.js";
import {
  floorParamsForBand,
  generateFloor,
  roomContaining,
  serializeGridBytes,
  type FloorParams,
} from "./generate.js";

const BANDS = ["shallows", "middle", "lowest"] as const;

const GOLDEN_SEEDS: Record<(typeof LAYOUT_FLAVORS)[number], string> = {
  open: "phase17-golden-open",
  warren: "phase17-golden-warren",
  halls: "phase17-golden-halls",
  ring: "phase17-golden-ring",
  sanctum: "phase17-golden-sanctum",
};

const expectSuccessfulFloor = (params: FloorParams) => {
  const result = generateFloor(params);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.floor;
};

describe("floor generation", () => {
  it("passes a 1000-seed sweep across bands and flavors with full connectivity", () => {
    let successes = 0;
    const failures: string[] = [];

    for (let seedIndex = 0; seedIndex < 1_000; seedIndex += 1) {
      const band = BANDS[seedIndex % BANDS.length] ?? "shallows";
      const flavor = LAYOUT_FLAVORS[seedIndex % LAYOUT_FLAVORS.length] ?? "open";
      const params = floorParamsForBand(band, flavor, `phase17-sweep:${seedIndex}`);
      const result = generateFloor(params);

      if (!result.ok) {
        failures.push(`${band}/${flavor}/${seedIndex}: ${result.error.code}`);
        continue;
      }

      const floor = result.floor;
      const entranceRoom = roomContaining(floor.rooms, floor.entrance);
      const stairsRoom = roomContaining(floor.rooms, floor.stairsDown);

      if (entranceRoom === null || stairsRoom === null) {
        failures.push(`${band}/${flavor}/${seedIndex}: specials not in rooms`);
        continue;
      }

      if (entranceRoom === stairsRoom) {
        failures.push(`${band}/${flavor}/${seedIndex}: entrance and stairs share room`);
        continue;
      }

      const route = findPath(floor.grid, floor.entrance, floor.stairsDown, {
        openDoors: true,
      });
      if (route === null) {
        failures.push(`${band}/${flavor}/${seedIndex}: no path entrance→stairs`);
        continue;
      }

      successes += 1;
    }

    expect(failures).toEqual([]);
    expect(successes).toBe(1_000);
  }, 120_000);

  it("is deterministic for the same seed and params", () => {
    const params = floorParamsForBand("middle", "halls", "phase17-determinism");
    const first = expectSuccessfulFloor(params);
    const second = expectSuccessfulFloor(params);

    expect(serializeGridBytes(first.grid)).toBe(serializeGridBytes(second.grid));
    expect(first.entrance).toEqual(second.entrance);
    expect(first.stairsDown).toEqual(second.stairsDown);
  });

  it(
    "returns a typed generation error for adversarial params without hanging",
    () => {
      const result = generateFloor({
        bandOrSize: { width: 8, height: 8 },
        roomCountRange: { min: 40, max: 40 },
        flavor: "warren",
        seed: "phase17-adversarial",
      });

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }

      expect(result.error).toEqual({
        kind: "generation-error",
        code: "retry_exhausted",
        message: "floor generation failed after 5 attempts",
        attempts: 5,
      });
    },
    15_000,
  );

  for (const flavor of LAYOUT_FLAVORS) {
    it(`matches the committed golden layout for ${flavor}`, () => {
      const fixturePath = new URL(
        `./__fixtures__/layout-${flavor}.golden.json`,
        import.meta.url,
      );
      const params = floorParamsForBand("middle", flavor, GOLDEN_SEEDS[flavor]);
      const floor = expectSuccessfulFloor(params);
      const snapshot = JSON.stringify({
        entrance: floor.entrance,
        stairsDown: floor.stairsDown,
        entranceRoomIndex: floor.entranceRoomIndex,
        stairsRoomIndex: floor.stairsRoomIndex,
        grid: floor.grid,
      });

      const golden = readFileSync(fixturePath, "utf8").trimEnd();
      expect(snapshot).toBe(golden);
    });
  }

  it("uses only config band geometry for bandOrSize presets", () => {
    for (const band of BANDS) {
      const params = floorParamsForBand(band, "open", `phase17-band-${band}`);
      const floor = expectSuccessfulFloor(params);
      const geometry = config.runStructure.floorGeometry[band].grid;

      expect(floor.grid.width).toBe(geometry.width);
      expect(floor.grid.height).toBe(geometry.height);
    }
  });

  it("places entrance and stairs terrain markers", () => {
    const floor = expectSuccessfulFloor(
      floorParamsForBand("shallows", "warren", "phase17-markers"),
    );

    const entranceTile =
      floor.grid.tiles[
        floor.entrance.y * floor.grid.width + floor.entrance.x
      ];
    const stairsTile =
      floor.grid.tiles[
        floor.stairsDown.y * floor.grid.width + floor.stairsDown.x
      ];

    expect(entranceTile?.terrain).toBe(Terrain.Entrance);
    expect(stairsTile?.terrain).toBe(Terrain.StairsDown);
  });
});
