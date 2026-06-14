import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createFallbackFloorContentProvider } from "../harness/fallback-provider.js";
import { runBot } from "../harness/bots/driver.js";
import { cautiousPolicy } from "../harness/bots/policies/index.js";
import type { TraceWriter } from "../harness/trace/recorder.js";
import {
  formatVerifyResult,
  parseReplayArgs,
  REPLAY_HELP_TEXT,
  replayWatchTrace,
  runReplay,
  verifyExitCode,
} from "./replay.js";
import { parseTraceNdjson } from "../harness/replay/parse.js";
import { verifyTraceContent } from "../harness/replay/replay.js";

const MINI_SEED = "cli-replay-mini";
const MINI_MAX_TURNS = 6;

describe("replay args", () => {
  it("parses verify and watch modes", () => {
    expect(parseReplayArgs(["--help"]).help).toBe(true);
    expect(parseReplayArgs(["runs/trace.ndjson"])).toEqual({
      help: false,
      tracePath: "runs/trace.ndjson",
      watch: false,
      delayMs: 0,
    });
    expect(parseReplayArgs(["runs/trace.ndjson", "--watch", "--delay", "0"])).toEqual({
      help: false,
      tracePath: "runs/trace.ndjson",
      watch: true,
      delayMs: 0,
    });
  });

  it("rejects delay values with trailing garbage", () => {
    expect(() =>
      parseReplayArgs(["runs/trace.ndjson", "--delay", "50abc"]),
    ).toThrow("--delay must be a non-negative integer");
    expect(() =>
      parseReplayArgs(["runs/trace.ndjson", "--delay=50abc"]),
    ).toThrow("--delay must be a non-negative integer");
  });

  it("documents help text", () => {
    expect(REPLAY_HELP_TEXT).toContain("--watch");
    expect(REPLAY_HELP_TEXT).toContain("--delay");
  });
});

describe("replay runs", () => {
  it("verifies a freshly recorded mini trace as identical", () => {
    const tracePath = writeMiniTrace();

    const result = runReplay({
      help: false,
      tracePath,
      watch: false,
      delayMs: 0,
    });

    expect(result.output).toBe("identical");
    expect(result.exitCode).toBe(0);
    expect(verifyExitCode({ status: "identical" })).toBe(0);
    expect(formatVerifyResult({ status: "identical" })).toBe("identical");
  }, 30_000);

  it("renders each recorded turn in watch mode", () => {
    const tracePath = writeMiniTrace();
    const content = readFileSync(tracePath, "utf8");
    const watched = replayWatchTrace(parseTraceNdjson(content));
    const watchResult = runReplay({
      help: false,
      tracePath,
      watch: true,
      delayMs: 0,
    });

    expect(watched.frames.length).toBeGreaterThan(1);
    expect(watched.frames[0]).toMatch(/d\d/);
    expect(watchResult.output).toContain("--- turn 0 ---");
    expect(watchResult.output).toContain("--- turn 1 ---");
    expect(watchResult.exitCode).toBe(0);
  }, 30_000);
});

const writeMiniTrace = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "gg-replay-"));
  const tracePath = join(dir, "trace.ndjson");
  const run = runBot(
    cautiousPolicy,
    MINI_SEED,
    createFallbackFloorContentProvider(),
    MINI_MAX_TURNS,
    {
      writer: memoryTraceWriter(tracePath),
      runId: `bot-${cautiousPolicy.name}-${MINI_SEED}`,
    },
  );

  writeFileSync(tracePath, run.trace.content, "utf8");
  expect(verifyTraceContent(run.trace.content)).toEqual({ status: "identical" });
  return tracePath;
};

const memoryTraceWriter = (path: string): TraceWriter => ({
  path,
  writeHeader: () => {},
  appendTurn: () => {},
});
