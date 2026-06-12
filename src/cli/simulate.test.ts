import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cautiousPolicy, balancedPolicy } from "../harness/bots/policies/index.js";
import {
  parseSeeds,
  parseSimulateArgs,
  runSimulate,
  SIMULATE_HELP_TEXT,
} from "./simulate.js";

const MINI_POLICIES = [cautiousPolicy.name, balancedPolicy.name] as const;
const LOW_MAX_TURNS = 8;

let seedCounter = 0;

const uniqueSeeds = (): [string, string] => {
  seedCounter += 1;
  const suffix = `${seedCounter}-${Date.now()}`;
  return [`cli-sim-a-${suffix}`, `cli-sim-b-${suffix}`];
};

describe("simulate args", () => {
  it("parses single and batch modes", () => {
    expect(parseSimulateArgs(["--help"]).help).toBe(true);
    expect(parseSimulateArgs(["--policy", "cautious", "--seed", "abc"])).toEqual({
      help: false,
      batch: false,
      policy: "cautious",
      seed: "abc",
      maxTurns: 900,
      outPath: null,
    });
    expect(
      parseSimulateArgs([
        "--batch",
        "--policies",
        "cautious,balanced",
        "--seeds",
        "2",
        "--max-turns",
        "12",
        "--out",
        "out.json",
      ]),
    ).toEqual({
      help: false,
      batch: true,
      policies: ["cautious", "balanced"],
      seeds: ["simulate-1", "simulate-2"],
      maxTurns: 12,
      outPath: "out.json",
    });
  });

  it("expands numeric and list seeds", () => {
    expect(parseSeeds("3")).toEqual(["simulate-1", "simulate-2", "simulate-3"]);
    expect(parseSeeds("one,two")).toEqual(["one", "two"]);
  });

  it("documents help text", () => {
    expect(SIMULATE_HELP_TEXT).toContain("--batch");
    expect(SIMULATE_HELP_TEXT).toContain("--max-turns");
  });
});

describe("simulate runs", () => {
  it("runs a small batch, prints a sane table, and writes JSON", () => {
    const outDir = mkdtempSync(join(tmpdir(), "gg-simulate-"));
    const outPath = join(outDir, "batch.json");
    const seeds = uniqueSeeds();

    const result = runSimulate({
      help: false,
      batch: true,
      policies: [...MINI_POLICIES],
      seeds,
      maxTurns: LOW_MAX_TURNS,
      outPath,
    });

    expect(result.rows).toHaveLength(4);
    expect(result.table).toContain("policy");
    expect(result.table).toContain("terminal");
    expect(result.table).toContain("cautious");
    expect(result.table).toContain("balanced");
    expect(result.table.split("\n")).toHaveLength(6);

    const json = JSON.parse(readFileSync(outPath, "utf8")) as {
      rows: Array<{ policy: string; seed: string; terminal: string }>;
      hasFailures: boolean;
    };
    expect(json.rows).toHaveLength(4);
    expect(json.hasFailures).toBe(result.exitCode !== 0);
  }, 60_000);

  it("returns a nonzero exit code when runs hit the turn cap", () => {
    const result = runSimulate({
      help: false,
      batch: true,
      policies: [cautiousPolicy.name],
      seeds: [`cli-sim-cap-${++seedCounter}-${Date.now()}`],
      maxTurns: 1,
      outPath: null,
    });

    expect(result.exitCode).toBe(1);
    expect(result.rows[0]?.terminal).not.toBe("ACTIVE");
  }, 30_000);
});
