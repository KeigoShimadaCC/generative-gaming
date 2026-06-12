import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import "../../src/engine/effects/core.js";
import "../../src/engine/effects/spatial.js";
import "../../src/engine/items/triggers.js";
import "../../src/engine/npc/dialogue.js";
import "../../src/engine/systems/combat.js";
import "../../src/engine/systems/inventory.js";
import "../../src/engine/systems/movement.js";
import "../../src/engine/systems/player.js";
import "../../src/engine/systems/status.js";
import "../../src/engine/systems/traps.js";

import { validShallowsManifestFixture } from "../../src/schemas/fixtures/manifest.js";
import type {
  FloorManifest,
  ManifestItemEntry,
  ManifestNpcEntry,
  ManifestRosterEntry,
  ManifestTrapEntry,
} from "../../src/schemas/manifest.js";
import type {
  EnemyDefinition,
  ItemDefinition,
  NpcDefinition,
  TrapDefinition,
} from "../../src/schemas/entities/index.js";
import {
  startRun,
  stepRun,
  type FloorContent,
  type FloorContentProvider,
} from "../../src/engine/run/loop.js";
import { computeStateHash } from "../../src/harness/trace/hash.js";
import {
  parseTraceNdjson,
  verifyTraceContent,
} from "../../src/harness/replay/index.js";
import type { ParsedTrace, VerifyResult } from "../../src/harness/replay/types.js";

const GOLDEN_DIR = new URL("./", import.meta.url);
const EXPECTED_TRACE_FILES = [
  "band-lowest.ndjson",
  "band-middle.ndjson",
  "band-shallows.ndjson",
  "mock-director-shallows.ndjson",
  "persona-aggressive.ndjson",
  "persona-balanced.ndjson",
  "persona-cautious.ndjson",
  "replay-mini-wait.ndjson",
] as const;

describe("golden trace replay", () => {
  it("keeps the expected release anchor trace set present", () => {
    expect(goldenTraceFiles()).toEqual([...EXPECTED_TRACE_FILES]);
  });

  it.each(EXPECTED_TRACE_FILES)("replays %s twice identically", (fileName) => {
    const content = readGolden(fileName);
    const first = verifyGoldenContent(content);
    const second = verifyGoldenContent(content);

    expect(first).toEqual({ status: "identical" });
    expect(second).toEqual({ status: "identical" });
  });
});

const goldenTraceFiles = (): readonly string[] =>
  readdirSync(GOLDEN_DIR)
    .filter((fileName) => fileName.endsWith(".ndjson"))
    .sort();

const readGolden = (fileName: string): string =>
  readFileSync(new URL(fileName, GOLDEN_DIR), "utf8");

const verifyGoldenContent = (content: string): VerifyResult => {
  const trace = parseTraceNdjson(content);
  if (trace.header.contentRef.providerId === "mock:valid-shallows-manifest") {
    return replayTraceWithProvider(trace, mockDirectorFixtureProvider());
  }

  return verifyTraceContent(content);
};

const replayTraceWithProvider = (
  trace: ParsedTrace,
  provider: FloorContentProvider,
): VerifyResult => {
  const started = startRun(trace.header.seed, provider);
  if (!started.ok) {
    return {
      status: "unreadable",
      error: `failed to start run: ${started.error.message}`,
    };
  }

  let state = started.state;

  for (const record of trace.turns) {
    const stepped = stepRun(state, record.action, provider);
    if (!stepped.ok) {
      return {
        status: "unreadable",
        error: `step failed at turn ${record.turn}: ${stepped.error.message}`,
      };
    }

    state = stepped.state;
    const actualHash = computeStateHash(state);
    if (state.run.turn !== record.turn || actualHash !== record.stateHash) {
      return {
        status: "diverged",
        report: {
          firstDivergentTurn: record.turn,
          expectedHash: record.stateHash,
          actualHash,
        },
      };
    }
  }

  return { status: "identical" };
};

const mockDirectorFixtureProvider = (): FloorContentProvider => ({
  getFloor: (_depth, seed) =>
    manifestToFloorContent(validShallowsManifestFixture, seed),
});

const manifestToFloorContent = (
  manifest: FloorManifest,
  seed: string,
): FloorContent => ({
  params: {
    ...manifest.params,
    seed,
  },
  roster: manifest.roster.map(stripPlacementHint),
  items: manifest.items.map(stripPlacementHint),
  traps: manifest.traps.map(stripPlacementHint),
  npcs: manifest.npcs.map(stripPlacementHint),
  ...(manifest.quest === null ? {} : { quest: manifest.quest }),
});

function stripPlacementHint(entry: ManifestRosterEntry): EnemyDefinition;
function stripPlacementHint(entry: ManifestItemEntry): ItemDefinition;
function stripPlacementHint(entry: ManifestTrapEntry): TrapDefinition;
function stripPlacementHint(entry: ManifestNpcEntry): NpcDefinition;
function stripPlacementHint(
  entry:
    | ManifestRosterEntry
    | ManifestItemEntry
    | ManifestTrapEntry
    | ManifestNpcEntry,
): EnemyDefinition | ItemDefinition | TrapDefinition | NpcDefinition {
  const copy = { ...entry } as {
    placementHint?: unknown;
  } & Record<string, unknown>;
  delete copy.placementHint;
  return copy as EnemyDefinition | ItemDefinition | TrapDefinition | NpcDefinition;
}
