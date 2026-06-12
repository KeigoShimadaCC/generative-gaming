import { describe, expect, it } from "vitest";

import { loadFallbackContentPack } from "../../harness/content-loader.js";
import { validApproachMeleeBehaviorFixture } from "../../schemas/fixtures/entities.js";
import {
  validShallowsManifestFixture,
} from "../../schemas/fixtures/manifest.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import {
  distance,
  NOVELTY_NEAR_DUPLICATE_THRESHOLD,
  type NoveltyComponents,
} from "./novelty.js";

const fallbackPack = loadFallbackContentPack();

describe("novelty distance", () => {
  it("flags engineered near-duplicates against fallback and recent corpus", () => {
    const baseline = validShallowsManifestFixture;
    const nearDuplicate: FloorManifest = {
      ...baseline,
      params: { ...baseline.params, seed: "near-dup-seed" },
    };

    const result = distance(nearDuplicate, {
      fallbackPack,
      recentManifests: [baseline],
    });

    expect(result.nearDuplicate).toBe(true);
    expect(result.vsRecent?.nameSimilarity).toBe(1);
    expect(result.vsRecent?.compositionOverlap).toBe(1);
  });

  it("passes engineered fresh manifests with low overlap to fallback", () => {
    const fresh = freshShallowsManifest();

    const result = distance(fresh, {
      fallbackPack,
      recentManifests: [validShallowsManifestFixture],
    });

    expect(result.nearDuplicate).toBe(false);
    expect(result.distance).toBeGreaterThan(NOVELTY_NEAR_DUPLICATE_THRESHOLD);
    expect(result.score).toBeGreaterThan(0.45);
    expect(result.components.nameSimilarity).toBeLessThan(0.55);
    expect(result.components.compositionOverlap).toBeLessThan(0.75);
  });

  it("matches hand-checked component math for a controlled pair", () => {
    const leftNames = ["alpha", "beta"];
    const rightNames = ["alpha", "gamma"];
    const nameSimilarity = mean(
      leftNames.map((name) =>
        Math.max(
          ...rightNames.map(
            (other) => 1 - levenshtein(name, other) / Math.max(name.length, other.length, 1),
          ),
        ),
      ),
    );
    const compositionOverlap = multisetJaccard(
      ["behavior:approach_melee", "effect:damage"],
      ["behavior:thief", "effect:heal"],
    );
    const statDistance = 1;

    const components: NoveltyComponents = {
      nameSimilarity,
      statVectorDistance: statDistance,
      compositionOverlap,
    };
    const blended =
      components.nameSimilarity * 0.35 +
      (1 - components.statVectorDistance) * 0.3 +
      components.compositionOverlap * 0.35;

    expect(nameSimilarity).toBeCloseTo(0.6, 5);
    expect(compositionOverlap).toBe(0);
    expect(1 - blended).toBeCloseTo(0.79, 5);

    const measured = distance(freshShallowsManifest(), {
      fallbackPack,
      recentManifests: [],
    });
    expect(measured.components.statVectorDistance).toBeGreaterThan(0);
    expect(measured.components.statVectorDistance).toBeLessThanOrEqual(1);
  });
});

const freshShallowsManifest = (): FloorManifest => {
  const base = validShallowsManifestFixture;

  return {
    ...base,
    params: {
      ...base.params,
      flavor: "open",
      roomCountRange: { min: 6, max: 9 },
      seed: "fresh-shallows",
    },
    roster: [
      {
        ...base.roster[0]!,
        id: "fresh-wisp-stalker",
        name: "wisp stalker",
        behaviors: [{ ...validApproachMeleeBehaviorFixture, kind: "thief" }],
        stats: {
          ...base.roster[0]!.stats,
          hp: base.roster[0]!.stats.hp + 4,
          attack: base.roster[0]!.stats.attack + 3,
        },
      },
      {
        ...base.roster[1]!,
        id: "fresh-rime-collector",
        name: "rime collector",
        behaviors: [{ ...validApproachMeleeBehaviorFixture, kind: "caster" }],
      },
    ],
    items: base.items.map((item, index) => ({
      ...item,
      id: `fresh-item-${index}`,
      name: `fresh item ${index}`,
    })),
    traps: base.traps.map((trap) => ({
      ...trap,
      id: "fresh-snare",
      name: "fresh snare",
    })),
    narration: {
      floorIntro: "A new draft of stone waits under unfamiliar lamps.",
      observations: [
        {
          id: "fresh-obs",
          triggerTag: "fresh-room",
          text: "Nothing here remembers the fallback stock.",
        },
      ],
    },
    metadata: {
      ...base.metadata,
      callbacks: ["fresh-room"],
    },
  };
};

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const levenshtein = (left: string, right: string): number => {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let row = 0; row < rows; row += 1) {
    matrix[row]![0] = row;
  }
  for (let col = 0; col < cols; col += 1) {
    matrix[0]![col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row]![col] = Math.min(
        (matrix[row - 1]![col] ?? 0) + 1,
        (matrix[row]![col - 1] ?? 0) + 1,
        (matrix[row - 1]![col - 1] ?? 0) + cost,
      );
    }
  }

  return matrix[left.length]![right.length] ?? 0;
};

const multisetJaccard = (left: readonly string[], right: readonly string[]): number => {
  const leftCounts = new Map<string, number>();
  const rightCounts = new Map<string, number>();

  for (const tag of left) {
    leftCounts.set(tag, (leftCounts.get(tag) ?? 0) + 1);
  }
  for (const tag of right) {
    rightCounts.set(tag, (rightCounts.get(tag) ?? 0) + 1);
  }

  const tags = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
  let intersection = 0;
  let union = 0;

  for (const tag of tags) {
    const leftCount = leftCounts.get(tag) ?? 0;
    const rightCount = rightCounts.get(tag) ?? 0;
    intersection += Math.min(leftCount, rightCount);
    union += Math.max(leftCount, rightCount);
  }

  return union === 0 ? 0 : intersection / union;
};
