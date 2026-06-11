import { describe, expect, it } from "vitest";

import { createRng, type Rng } from "./index.js";

function sequence(rng: Rng, count: number): number[] {
  const values: number[] = [];

  for (let index = 0; index < count; index += 1) {
    values.push(rng.nextUint32());
  }

  return values;
}

describe("createRng", () => {
  it("produces identical 1000-value sequences for the same seed", () => {
    expect(sequence(createRng("floor:alpha"), 1000)).toEqual(
      sequence(createRng("floor:alpha"), 1000),
    );
  });

  it("produces different sequences for different seeds", () => {
    expect(sequence(createRng("floor:alpha"), 64)).not.toEqual(
      sequence(createRng("floor:beta"), 64),
    );
  });

  it("re-creates the same sequence across simulated process runs", () => {
    const firstRun = {
      root: sequence(createRng("process-seed"), 16),
      fork: sequence(createRng("process-seed").fork("floor:3"), 16),
      helpers: helperTrace(createRng("process-seed")),
    };

    const secondRun = {
      root: sequence(createRng("process-seed"), 16),
      fork: sequence(createRng("process-seed").fork("floor:3"), 16),
      helpers: helperTrace(createRng("process-seed")),
    };

    expect(secondRun).toEqual(firstRun);
  });
});

describe("fork", () => {
  it("creates named streams independent of other forks and parent draws", () => {
    const parent = createRng("run:1");
    const forkA = parent.fork("a");
    const forkB = parent.fork("b");
    const baselineA = sequence(createRng("run:1").fork("a"), 32);

    const interleavedA: number[] = [];
    for (let index = 0; index < 32; index += 1) {
      parent.nextUint32();
      interleavedA.push(forkA.nextUint32());
      parent.nextUint32();
    }

    expect(interleavedA).toEqual(baselineA);
    expect(interleavedA).not.toEqual(sequence(forkB, 32));
    expect(interleavedA).not.toEqual(sequence(createRng("run:1"), 32));
  });

  it("re-creates the same named fork regardless of parent state", () => {
    const parent = createRng("run:2");
    const beforeParentDraws = sequence(parent.fork("encounters"), 16);

    sequence(parent, 50);

    expect(sequence(parent.fork("encounters"), 16)).toEqual(beforeParentDraws);
  });
});

describe("rng helpers", () => {
  it("draws inclusive integers within bounds", () => {
    const rng = createRng("int-bounds");

    expect(rng.int(7, 7)).toBe(7);

    for (let index = 0; index < 1000; index += 1) {
      const value = rng.int(-3, 3);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(3);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("picks only existing items", () => {
    const rng = createRng("pick-items");
    const items = ["north", "south", "east", "west"] as const;
    const seen = new Set<string>();

    for (let index = 0; index < 100; index += 1) {
      const value = rng.pick(items);
      expect(items).toContain(value);
      seen.add(value);
    }

    expect(seen.size).toBeGreaterThan(1);
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it("weightedPick respects zero weights and favors larger weights", () => {
    const zeroWeightRng = createRng("zero-weight");
    for (let index = 0; index < 100; index += 1) {
      expect(zeroWeightRng.weightedPick(["never", "always"], [0, 1])).toBe(
        "always",
      );
    }

    const rng = createRng("weighted-sanity");
    let low = 0;
    let high = 0;

    for (let index = 0; index < 2000; index += 1) {
      if (rng.weightedPick(["low", "high"], [1, 3]) === "high") {
        high += 1;
      } else {
        low += 1;
      }
    }

    expect(high).toBeGreaterThan(low * 2);
    expect(() => rng.weightedPick(["bad"], [0])).toThrow(RangeError);
  });

  it("shuffles without mutating the input array", () => {
    const original = [1, 2, 3, 4, 5, 6];
    const shuffled = createRng("shuffle").shuffle(original);

    expect(original).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(original);
    expect(shuffled).toEqual(createRng("shuffle").shuffle(original));
    expect(shuffled).not.toEqual(original);
  });

  it("rolls percent chances with integer percentages", () => {
    const alwaysMiss = createRng("percent-zero");
    const alwaysHit = createRng("percent-hundred");

    for (let index = 0; index < 100; index += 1) {
      expect(alwaysMiss.percent(0)).toBe(false);
      expect(alwaysHit.percent(100)).toBe(true);
    }

    const rng = createRng("percent-sanity");
    let hits = 0;

    for (let index = 0; index < 1000; index += 1) {
      if (rng.percent(25)) {
        hits += 1;
      }
    }

    expect(hits).toBeGreaterThan(190);
    expect(hits).toBeLessThan(310);
    expect(() => rng.percent(12.5)).toThrow(RangeError);
  });
});

function helperTrace(rng: Rng): readonly unknown[] {
  return [
    rng.int(1, 6),
    rng.pick(["a", "b", "c"]),
    rng.weightedPick(["low", "high"], [1, 2]),
    rng.shuffle([1, 2, 3, 4]),
    rng.percent(40),
  ];
}
