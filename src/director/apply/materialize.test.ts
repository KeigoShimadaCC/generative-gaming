import { describe, expect, it } from "vitest";

import {
  collectLegalPlacementCells,
  type PlacementGrid,
} from "../../engine/floorgen/place.js";
import { createTile, createTileGrid, Terrain, withTile } from "../../engine/map/index.js";
import { serialize } from "../../engine/state/index.js";
import {
  evaluateGate2,
  defaultGate2Config,
  type Gate2Config,
} from "../../gauntlet/gate2/run.js";
import { hashSerializedState } from "../../harness/trace/index.js";
import {
  validLowestManifestFixture,
  validManifestFixtures,
  validMiddleManifestFixture,
  validShallowsManifestFixture,
} from "../../schemas/fixtures/manifest.js";
import type {
  FloorManifest,
  ManifestPlacementHint,
} from "../../schemas/manifest.js";
import { materialize, type MaterializeOptions } from "./materialize.js";

describe("manifest materialization", () => {
  it("materializes the same manifest and seed to the same serialized floor hash", () => {
    const seed = "apply-determinism-run";
    const first = materialize(validShallowsManifestFixture, seed);
    const second = materialize(validShallowsManifestFixture, seed);
    const firstHash = hashSerializedState(serialize(first.floor.state));
    const secondHash = hashSerializedState(serialize(second.floor.state));

    expect(secondHash).toBe(firstHash);
    expect(second.floor.generated).toEqual(first.floor.generated);
    expect(second.floor.placements).toEqual(first.floor.placements);
    expect(second.deviations).toEqual(first.deviations);
  });

  it("attaches assembled content, quests, narration, and origin metadata", () => {
    const result = materialize(validMiddleManifestFixture, "apply-attachments");
    const entities = Object.values(result.floor.entities);
    const quest = validMiddleManifestFixture.quest;

    expect(result.floor.narration).toEqual(validMiddleManifestFixture.narration);
    expect(result.floor.metadata.originTags).toEqual(
      validMiddleManifestFixture.metadata.originTags,
    );
    expect(quest).not.toBeNull();
    expect(
      quest === null ? null : result.floor.state.quests.quests[quest.id]?.definition,
    ).toEqual(quest);
    expect(entities.filter((entity) => entity.kind === "npc")).toHaveLength(
      validMiddleManifestFixture.npcs.length,
    );
    expect(
      entities
        .map((entity) => originOf(entity.definition))
        .filter((origin) => origin !== null),
    ).toContain("made");
    for (const entity of entities) {
      expect("placementHint" in (entity.definition as Record<string, unknown>)).toBe(
        false,
      );
    }
  });

  it.each(validManifestFixtures)(
    "materializes the %s band fixture and records the current small Gate 2 outcome",
    (manifest) => {
      const result = materialize(manifest, `${manifest.params.seed}:apply`);
      const evaluation = evaluateGate2(manifest, {
        config: smallCompletionConfig(manifest),
      });
      const shouldClear = manifest.band === "shallows";

      expect(result.floor.state.run.band).toBe(manifest.band);
      expect(result.floor.state.player.position).toEqual(result.floor.generated.entrance);
      expect(evaluation.aggregate.clearRatePercent).toBe(shouldClear ? 100 : 0);
      expect(evaluation.runs.every((run) => run.cleared)).toBe(shouldClear);
    },
  );

  it("places legally and records deviations for unsatisfiable placement hints", () => {
    const outOfRange = materialize(
      withHint(validLowestManifestFixture, {
        roomIndex: 999,
        distance: null,
        spread: false,
      }),
      "apply-out-of-range-room",
    );
    const sameCellSpread = materialize(
      withHint(validShallowsManifestFixture, {
        roomIndex: 0,
        distance: "near_entrance",
        spread: true,
      }),
      "apply-same-cell-spread",
      { transformFloor: singleHintCellFloor },
    );

    expect(outOfRange.deviations.length).toBeGreaterThan(0);
    expect(
      outOfRange.deviations.some((deviation) =>
        deviation.reasons.includes("room_index_unsatisfiable"),
      ),
    ).toBe(true);
    expect(sameCellSpread.deviations.length).toBeGreaterThan(0);

    assertLegalPlacements(outOfRange);
    assertLegalPlacements(sameCellSpread);
  });
});

const smallCompletionConfig = (manifest: FloorManifest): Gate2Config => {
  const base = defaultGate2Config(manifest);

  return {
    ...base,
    policies: ["balanced", "aggressive"] as const,
    seeds: [
      `${manifest.params.seed}:apply-bot-a`,
      `${manifest.params.seed}:apply-bot-b`,
    ],
    maxTurns: 240,
    wallClockBudgetMs: 1_000,
  };
};

const withHint = (
  manifest: FloorManifest,
  hint: ManifestPlacementHint,
): FloorManifest => ({
  ...manifest,
  roster: manifest.roster.map((entry) => ({ ...entry, placementHint: hint })),
  items: manifest.items.map((entry) => ({ ...entry, placementHint: hint })),
  traps: manifest.traps.map((entry) => ({ ...entry, placementHint: hint })),
  npcs: manifest.npcs.map((entry) => ({ ...entry, placementHint: hint })),
});

const singleHintCellFloor: NonNullable<MaterializeOptions["transformFloor"]> = (
  floor,
) => {
  const entrance = { x: 1, y: 1 };
  const stairsDown = { x: 10, y: 1 };
  let grid = createTileGrid({
    width: 12,
    height: 4,
    fill: Terrain.Wall,
  });

  for (let x = entrance.x; x <= stairsDown.x; x += 1) {
    grid = withTile(grid, { x, y: 1 }, createTile(Terrain.Floor));
  }

  grid = withTile(grid, entrance, createTile(Terrain.Entrance));
  grid = withTile(grid, stairsDown, createTile(Terrain.StairsDown));

  return {
    ...floor,
    grid,
    entrance,
    stairsDown,
    entranceRoomIndex: 0,
    stairsRoomIndex: 1,
    rooms: [
      {
        x: 2,
        y: 1,
        width: 1,
        height: 1,
        center: { x: 2, y: 1 },
      },
      {
        x: 3,
        y: 1,
        width: 7,
        height: 1,
        center: { x: 6, y: 1 },
      },
    ],
  };
};

const assertLegalPlacements = (result: ReturnType<typeof materialize>): void => {
  const grid: PlacementGrid = {
    grid: result.floor.generated.grid,
    entrance: result.floor.generated.entrance,
    stairsDown: result.floor.generated.stairsDown,
    rooms: result.floor.generated.rooms,
  };
  const legal = new Set(
    collectLegalPlacementCells(grid).map((position) => positionKey(position)),
  );
  const placed = result.floor.placements.map((placement) =>
    positionKey(placement.position),
  );

  expect(result.floor.placements).toHaveLength(
    result.floor.manifest.roster.length +
      result.floor.manifest.items.length +
      result.floor.manifest.traps.length +
      result.floor.manifest.npcs.length,
  );
  expect(new Set(placed).size).toBe(placed.length);
  for (const position of placed) {
    expect(legal.has(position)).toBe(true);
  }
};

const positionKey = (position: { readonly x: number; readonly y: number }): string =>
  `${position.x},${position.y}`;

const originOf = (definition: object): "made" | "old_stock" | "kept" | null => {
  if (!("origin" in definition)) {
    return null;
  }

  const origin = definition.origin;
  return origin === "made" || origin === "old_stock" || origin === "kept"
    ? origin
    : null;
};
