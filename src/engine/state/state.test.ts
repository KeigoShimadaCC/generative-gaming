import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { config } from "../../config/index.js";
import type { DepthBand } from "../../schemas/entities/index.js";
import {
  allocateEntityId,
  createInitialEntityCounters,
  createInitialState,
  depthBandForDepth,
} from "./init.js";
import { deserialize, serialize } from "./serialize.js";

describe("engine state initialization", () => {
  it("round-trips through stable serialization byte-identically", () => {
    const serialized = serialize(createInitialState("round-trip-seed"));

    expect(serialize(deserialize(serialized))).toBe(serialized);
  });

  it("matches the committed initial-state golden fixture", () => {
    const golden = readFileSync(
      new URL("./__fixtures__/initial-state.golden.json", import.meta.url),
      "utf8",
    ).trimEnd();

    expect(serialize(createInitialState("phase-06-golden"))).toBe(golden);
    expect(serialize(deserialize(golden))).toBe(golden);
  });

  it("allocates deterministic monotonic ids per entity kind", () => {
    let counters = createInitialEntityCounters();
    const firstEnemy = allocateEntityId(counters, "enemy");
    counters = firstEnemy.entityCounters;

    const firstItem = allocateEntityId(counters, "item");
    counters = firstItem.entityCounters;

    const secondEnemy = allocateEntityId(counters, "enemy");

    expect([firstEnemy.id, firstItem.id, secondEnemy.id]).toEqual([
      "enemy#1",
      "item#1",
      "enemy#2",
    ]);
    expect(secondEnemy.entityCounters).toEqual({
      enemy: 2,
      npc: 0,
      item: 1,
      trap: 0,
    });
    expect(createInitialState("id-seed").ids.entityCounters).toEqual(
      createInitialEntityCounters(),
    );
  });

  it("derives depth bands from the config table", () => {
    for (const [band, range] of depthBandEntries()) {
      expect(depthBandForDepth(range.minFloor)).toBe(band);
      expect(depthBandForDepth(range.maxFloor)).toBe(band);
    }

    expect(() =>
      depthBandForDepth(config.runStructure.depthFloors + 1),
    ).toThrow(RangeError);
  });
});

describe("engine state determinism guard", () => {
  it("does not call ambient nondeterministic APIs", () => {
    const forbiddenCalls = [
      ["Math", "random"].join("."),
      ["Date", "now"].join("."),
    ] as const;

    for (const file of stateFiles(new URL("./", import.meta.url))) {
      const contents = readFileSync(file, "utf8");

      for (const call of forbiddenCalls) {
        expect(contents, `${file.pathname} must not include ${call}`).not.toContain(
          call,
        );
      }
    }
  });
});

const depthBandEntries = (): readonly [
  DepthBand,
  {
    readonly minFloor: number;
    readonly maxFloor: number;
  },
][] =>
  Object.entries(config.runStructure.depthBands) as readonly [
    DepthBand,
    {
      readonly minFloor: number;
      readonly maxFloor: number;
    },
  ][];

const stateFiles = (directory: URL): readonly URL[] => {
  const files: URL[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = new URL(
      `${entry.name}${entry.isDirectory() ? "/" : ""}`,
      directory,
    );

    if (entry.isDirectory()) {
      files.push(...stateFiles(child));
      continue;
    }

    if ([".json", ".md", ".ts"].some((extension) => entry.name.endsWith(extension))) {
      files.push(child);
    }
  }

  return files;
};
