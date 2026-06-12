import { describe, expect, it } from "vitest";

import {
  getFallbackFloor,
  loadFallbackContentPack,
} from "../../harness/content-loader.js";
import {
  createTile,
  createTileGrid,
  Terrain,
  withTile,
} from "../../engine/map/index.js";
import type { Position } from "../../engine/state/index.js";
import type { RoomRect } from "../../engine/floorgen/index.js";
import { PROTOCOL_VERSION } from "../../schemas/protocol.js";
import type {
  FloorManifest,
  ManifestItemEntry,
  ManifestNpcEntry,
  ManifestRosterEntry,
  ManifestTrapEntry,
} from "../../schemas/manifest.js";
import { judgeGate2, type Gate2Report } from "./judge.js";
import {
  defaultGate2Config,
  evaluateGate2,
  runGate2,
  type CandidateFloorTransform,
  type Gate2Config,
} from "./run.js";

describe("Gate 2 simulated playability", () => {
  it("passes a normal fallback floor with the small current-bot ensemble", () => {
    const manifest = fallbackManifest(1, "gate2-fallback-pass");
    const report = runGate2(manifest, {
      config: currentBotRealityConfig(manifest),
      clock: sequenceClock(10, 34),
      transformFloor: corridorFloor,
    });

    expect(report.pass, failedDetails(report)).toBe(true);
    expect(report.metrics.totalRuns).toBe(4);
    expect(report.metrics.clearRatePercent).toBe(100);
    expect(report.candidate.hasThreatOnPath).toBe(true);
    expect(report.elapsedMs).toBe(24);
  });

  it("rejects an engineered unwinnable floor with walled stairs", () => {
    const manifest = fallbackManifest(3, "gate2-walled-stairs");
    const report = runGate2(manifest, {
      config: currentBotRealityConfig(manifest),
      clock: sequenceClock(0, 12),
      transformFloor: walledStairsFloor,
    });

    expect(report.pass).toBe(false);
    expect(report.verdict.codes).toContain("G2_CLEAR_RATE");
    expect(report.metrics.clearRatePercent).toBe(0);
    expect(report.candidate.stairsReachable).toBe(false);
  });

  it("rejects a zero-threat floor below depth 2", () => {
    const manifest = {
      ...fallbackManifest(1, "gate2-zero-threat"),
      roster: [],
    } satisfies FloorManifest;
    const report = runGate2(manifest, {
      config: currentBotRealityConfig(manifest),
      clock: sequenceClock(0, 9),
      transformFloor: corridorFloor,
    });

    expect(report.pass).toBe(false);
    expect(report.verdict.codes).toContain("G2_ZERO_THREAT");
    expect(report.candidate.hasThreatOnPath).toBe(false);
  });

  it("is deterministic for the same candidate, policies, and seeds", () => {
    const manifest = fallbackManifest(1, "gate2-deterministic");
    const options = {
      config: currentBotRealityConfig(manifest),
      clock: sequenceClock(100, 117),
      transformFloor: corridorFloor,
    };
    const first = runGate2(manifest, options);
    const second = runGate2(manifest, {
      ...options,
      clock: sequenceClock(100, 117),
    });

    expect(second.verdict).toEqual(first.verdict);
    expect(second.metrics).toEqual(first.metrics);
    expect(second.candidate).toEqual(first.candidate);
  });

  it("fires configured judge thresholds and hard rejects with frozen G2 codes", () => {
    const manifest = fallbackManifest(1, "gate2-judge-codes");
    const evaluation = evaluateGate2(manifest, {
      config: currentBotRealityConfig(manifest),
      clock: sequenceClock(0, 1),
      transformFloor: corridorFloor,
    });

    expect(
      judgeGate2({
        ...evaluation,
        thresholds: defaultGate2Config(manifest).thresholdsByBand,
      }).verdict.codes,
    ).toContain("G2_HP_RETENTION");

    expect(
      judgeGate2({
        ...evaluation,
        aggregate: {
          ...evaluation.aggregate,
          deathCount: 1,
        },
      }).verdict.codes,
    ).toContain("G2_DEATH_SHALLOW");

    expect(
      judgeGate2({
        ...evaluation,
        depth: 6,
        band: "middle",
        aggregate: {
          ...evaluation.aggregate,
          clearRatePercent: 50,
        },
      }).verdict.codes,
    ).toContain("G2_HARD_CLEAR_RATE");

    expect(
      judgeGate2({
        ...evaluation,
        elapsedMs: evaluation.wallClockBudgetMs + 1,
      }).verdict.codes,
    ).toContain("G2_WALL_CLOCK");
  });
});

const currentBotRealityConfig = (manifest: FloorManifest): Gate2Config => {
  const base = defaultGate2Config(manifest);

  return {
    ...base,
    policies: ["balanced", "aggressive"],
    seeds: ["gate2-seed-a", "gate2-seed-b"],
    maxTurns: 120,
    wallClockBudgetMs: 1_000,
    thresholdsByBand: {
      shallows: allowCurrentHpRetention(base.thresholdsByBand.shallows),
      middle: allowCurrentHpRetention(base.thresholdsByBand.middle),
      lowest: allowCurrentHpRetention(base.thresholdsByBand.lowest),
    },
  };
};

const allowCurrentHpRetention = (
  threshold: Gate2Config["thresholdsByBand"]["shallows"],
): Gate2Config["thresholdsByBand"]["shallows"] => ({
  ...threshold,
  medianHpRetentionPercent: {
    ...threshold.medianHpRetentionPercent,
    max: 100,
  },
});

const fallbackManifest = (depth: number, seed: string): FloorManifest => {
  const floor = getFallbackFloor(loadFallbackContentPack(), depth);
  const originEntries = [...floor.roster, ...floor.npcs];

  return {
    protocolVersion: PROTOCOL_VERSION,
    depth: floor.depth,
    band: floor.band,
    params: {
      bandOrSize: floor.band,
      roomCountRange: floor.params.roomCountRange,
      flavor: floor.flavor,
      seed,
    },
    roster: floor.roster.map(
      (entry): ManifestRosterEntry => ({
        ...entry,
        placementHint: null,
      }),
    ),
    items: floor.items.map(
      (entry): ManifestItemEntry => ({
        ...entry,
        placementHint: null,
      }),
    ),
    traps: floor.traps.map(
      (entry): ManifestTrapEntry => ({
        ...entry,
        placementHint: null,
      }),
    ),
    npcs: floor.npcs.map(
      (entry): ManifestNpcEntry => ({
        ...entry,
        placementHint: null,
      }),
    ),
    quest: floor.quest,
    narration: {
      floorIntro: "The old stock floor waits in test silence.",
      observations: [],
    },
    metadata: {
      originTags: {
        made: originEntries.filter((entry) => entry.origin === "made").length,
        old_stock: originEntries.filter((entry) => entry.origin === "old_stock").length,
        kept: originEntries.filter((entry) => entry.origin === "kept").length,
      },
      callbacks: [],
      signature: false,
    },
  };
};

const corridorFloor: CandidateFloorTransform = (floor) => {
  const entrance = { x: 1, y: 1 };
  const stairsDown = { x: 14, y: 1 };
  const room = corridorRoom(entrance, stairsDown);
  let grid = createTileGrid({
    width: floor.grid.width,
    height: floor.grid.height,
    fill: Terrain.Wall,
  });

  for (let x = entrance.x; x <= stairsDown.x; x += 1) {
    grid = withTile(grid, { x, y: entrance.y }, createTile(Terrain.Floor));
  }
  grid = withTile(grid, entrance, createTile(Terrain.Entrance));
  grid = withTile(grid, stairsDown, createTile(Terrain.StairsDown));

  return {
    ...floor,
    grid,
    entrance,
    stairsDown,
    entranceRoomIndex: 0,
    stairsRoomIndex: 0,
    rooms: [room],
  };
};

const walledStairsFloor: CandidateFloorTransform = (floor, manifest) => {
  const corridor = corridorFloor(floor, manifest);
  let grid = corridor.grid;

  for (const position of neighbors(corridor.stairsDown)) {
    grid = withTile(grid, position, createTile(Terrain.Wall));
  }
  grid = withTile(grid, corridor.stairsDown, createTile(Terrain.StairsDown));

  return {
    ...corridor,
    grid,
  };
};

const corridorRoom = (entrance: Position, stairsDown: Position): RoomRect => ({
  x: entrance.x,
  y: entrance.y,
  width: stairsDown.x - entrance.x + 1,
  height: 1,
  center: {
    x: Math.floor((entrance.x + stairsDown.x) / 2),
    y: entrance.y,
  },
});

const neighbors = (position: Position): readonly Position[] => [
  { x: position.x - 1, y: position.y - 1 },
  { x: position.x, y: position.y - 1 },
  { x: position.x + 1, y: position.y - 1 },
  { x: position.x - 1, y: position.y },
  { x: position.x + 1, y: position.y },
  { x: position.x - 1, y: position.y + 1 },
  { x: position.x, y: position.y + 1 },
  { x: position.x + 1, y: position.y + 1 },
];

const sequenceClock = (...values: readonly number[]) => {
  let index = 0;

  return {
    now: () => {
      const value = values[Math.min(index, values.length - 1)] ?? 0;
      index += 1;
      return value;
    },
  };
};

const failedDetails = (
  report: Gate2Report,
): string =>
  report.checks
    .filter((check) => !check.pass)
    .map((check) => `${check.code}: ${check.detail}`)
    .join("\n");
