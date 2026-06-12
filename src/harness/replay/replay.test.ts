import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { path as findPath } from "../../engine/map/path.js";
import {
  currentFloorRuntime,
  startRun,
  stepRun,
  type FloorContentProvider,
  type RunAction
} from "../../engine/run/loop.js";
import type { RunEvent } from "../../engine/run/events.js";
import type { GameState, Position } from "../../engine/state/index.js";
import {
  gridFromState,
  type MoveDirection
} from "../../engine/turn/actions.js";
import { createFallbackFloorContentProvider } from "../fallback-provider.js";
import {
  createFileTraceWriter,
  record,
  traceRunId,
  type EngineLikeSession,
  type TraceContentRef,
  type TraceFsAdapter
} from "../trace/recorder.js";
import {
  buildTraceFromRun,
  parseTraceNdjson,
  recordAndVerifyRoundTrip,
  verify,
  verifyTraceContent
} from "./index.js";

const FIXTURE_TRACE_URL = new URL(
  "../../../tests/golden/replay-mini-wait.ndjson",
  import.meta.url
);

const CREATED_AT = "2026-06-12T00:00:00.000Z";
const DEFAULT_CONTENT_REF = {
  providerId: "fallback:old-stock",
  packVersion: "0.0.0"
} as const satisfies TraceContentRef;

describe("trace replay", () => {
  it("round-trips a short fixture run identically", () => {
    const provider = createFallbackFloorContentProvider();
    const trace = buildTraceFromRun({
      seed: "replay-round-trip",
      actions: [{ kind: "wait" }, { kind: "wait" }, { kind: "wait" }],
      provider,
      contentRef: DEFAULT_CONTENT_REF,
      createdAt: CREATED_AT
    });

    expect(verifyTraceContent(trace)).toEqual({ status: "identical" });
  });

  it("real recorder records a two-floor fixture run and real replayer verifies it identical", () => {
    const trace = recordTwoFloorFixtureTrace();
    const parsed = parseTraceNdjson(trace);

    expect(parsed.header).toMatchObject({
      recordType: "header",
      modelId: "none",
      contentRef: DEFAULT_CONTENT_REF,
      runId: traceRunId("replay-two-floor-fixture", CREATED_AT)
    });
    expect(
      parsed.turns
        .flatMap((turn) => turn.events)
        .filter((event) => event.type === "run_floor_entered")
        .map((event) => event.data.depth)
    ).toEqual([2]);
    expect(verifyTraceContent(trace)).toEqual({ status: "identical" });
  });

  it("replays the committed golden fixture minted by the canonical recorder", () => {
    const provider = createFallbackFloorContentProvider();
    const result = recordAndVerifyRoundTrip({
      seed: "golden-mini-wait",
      actions: [{ kind: "wait" }, { kind: "wait" }],
      provider,
      contentRef: DEFAULT_CONTENT_REF,
      createdAt: CREATED_AT,
      tracePath: FIXTURE_TRACE_URL.pathname
    });

    expect(result.verify).toEqual({ status: "identical" });
    expect(verify(FIXTURE_TRACE_URL.pathname)).toEqual({ status: "identical" });
    expect(readFileSync(FIXTURE_TRACE_URL, "utf8")).toBe(result.trace);
  });

  it("returns unreadable for a corrupted trace line", () => {
    const provider = createFallbackFloorContentProvider();
    const trace = buildTraceFromRun({
      seed: "replay-corrupt",
      actions: [{ kind: "wait" }, { kind: "wait" }],
      provider,
      contentRef: DEFAULT_CONTENT_REF,
      createdAt: CREATED_AT
    });

    const lines = trace.trim().split("\n");
    lines[lines.length - 1] = "{not-json";
    const corrupted = `${lines.join("\n")}\n`;

    const result = verifyTraceContent(corrupted);
    expect(result.status).toBe("unreadable");
    if (result.status !== "unreadable") {
      throw new Error("expected unreadable result");
    }
    expect(result.error).toMatch(/invalid JSON/i);
  });

  it("detects induced divergence from a canonically minted trace", () => {
    const provider = createFallbackFloorContentProvider();
    const trace = buildTraceFromRun({
      seed: "replay-diverge",
      actions: [
        { kind: "wait" },
        { kind: "wait" },
        { kind: "wait" },
        { kind: "wait" }
      ],
      provider,
      contentRef: DEFAULT_CONTENT_REF,
      createdAt: CREATED_AT
    });

    const parsed = parseTraceNdjson(trace);
    const tamperedTurn = parsed.turns[2];
    if (tamperedTurn === undefined) {
      throw new Error("expected at least three turn records");
    }

    const tampered = {
      ...tamperedTurn,
      action: { kind: "abort" as const }
    };

    const lines = trace.trim().split("\n");
    lines[3] = JSON.stringify(tampered);
    const tamperedTrace = `${lines.join("\n")}\n`;

    const result = verifyTraceContent(tamperedTrace);
    expect(result).toEqual({
      status: "diverged",
      report: {
        firstDivergentTurn: tampered.turn,
        expectedHash: tampered.stateHash,
        actualHash: expect.any(String)
      }
    });

    if (result.status !== "diverged") {
      throw new Error("expected diverged result");
    }

    expect(result.report.actualHash).not.toBe(result.report.expectedHash);
  });

  it("records and verifies a round-trip in one call", () => {
    const provider = createFallbackFloorContentProvider();
    const result = recordAndVerifyRoundTrip({
      seed: "replay-golden-helper",
      actions: [{ kind: "wait" }],
      provider,
      contentRef: DEFAULT_CONTENT_REF,
      createdAt: CREATED_AT
    });

    expect(result.verify).toEqual({ status: "identical" });
    expect(
      result.trace.split("\n").filter((line) => line.length > 0)
    ).toHaveLength(2);
  });
});

const recordTwoFloorFixtureTrace = (): string => {
  const seed = "replay-two-floor-fixture";
  const runId = traceRunId(seed, CREATED_AT);
  const fs = new MemoryTraceFs();
  const provider = createFallbackFloorContentProvider();
  const session = record(createRunSession(seed, provider), {
    seed,
    createdAt: CREATED_AT,
    modelId: "none",
    contentRef: DEFAULT_CONTENT_REF,
    runId,
    writer: createFileTraceWriter({ runId, fs })
  });

  moveToDepth(session, 2);

  return fs.read(`runs/${runId}/trace.ndjson`);
};

const createRunSession = (
  seed: string,
  provider: FloorContentProvider
): EngineLikeSession<RunAction, RunEvent> => {
  const started = startRun(seed, provider);
  expect(started.ok, started.ok ? "" : started.error.message).toBe(true);
  if (!started.ok) {
    throw new Error(started.error.message);
  }

  let state = started.state;

  return {
    get state() {
      return state;
    },
    step: (action) => {
      const result = stepRun(state, action, provider);
      expect(result.ok, result.ok ? "" : result.error.message).toBe(true);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      state = result.state;
      return {
        state: result.state,
        events: result.events
      };
    }
  };
};

const moveToDepth = (
  session: EngineLikeSession<RunAction, RunEvent>,
  targetDepth: number
): void => {
  let steps = 0;

  while (session.state.run.depth < targetDepth) {
    const runtime = currentFloorRuntime(session.state);
    if (runtime === null) {
      throw new Error("missing floor runtime");
    }

    while (!samePosition(session.state.player.position, runtime.stairsDown)) {
      session.step(nextMoveToward(session.state, runtime.stairsDown));
      steps += 1;
      if (steps > 200) {
        throw new Error("fixture path exceeded 200 steps");
      }
    }

    session.step({ kind: "descend" });
    steps += 1;
  }

  expect(session.state.run.depth).toBe(targetDepth);
};

const nextMoveToward = (state: GameState, target: Position): RunAction => {
  const grid = gridFromState(state);
  if (grid === null) {
    throw new Error("missing grid");
  }

  const route = findPath(grid, state.player.position, target, {
    openDoors: true,
    isOccupied: (position) => isActorAt(state, position)
  });
  const next = route?.[1];
  if (next === undefined) {
    throw new Error("no route to stairs");
  }

  return {
    kind: "move",
    direction: directionBetween(state.player.position, next)
  };
};

const isActorAt = (state: GameState, position: Position): boolean =>
  Object.values(state.entities).some(
    (entity) =>
      (entity.kind === "enemy" || entity.kind === "npc") &&
      samePosition(entity.position, position)
  );

const directionBetween = (from: Position, to: Position): MoveDirection => {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);

  if (dx === -1 && dy === -1) {
    return "northwest";
  }
  if (dx === 0 && dy === -1) {
    return "north";
  }
  if (dx === 1 && dy === -1) {
    return "northeast";
  }
  if (dx === -1 && dy === 0) {
    return "west";
  }
  if (dx === 1 && dy === 0) {
    return "east";
  }
  if (dx === -1 && dy === 1) {
    return "southwest";
  }
  if (dx === 0 && dy === 1) {
    return "south";
  }
  if (dx === 1 && dy === 1) {
    return "southeast";
  }

  throw new Error(
    `positions are not adjacent: ${JSON.stringify({ from, to })}`
  );
};

const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

class MemoryTraceFs implements TraceFsAdapter {
  private readonly files = new Map<string, string>();

  makeDir(): void {}

  writeNewFile(path: string, contents: string): void {
    if (this.files.has(path)) {
      throw new Error(`file already exists: ${path}`);
    }
    this.files.set(path, contents);
  }

  appendFile(path: string, contents: string): void {
    const current = this.files.get(path);
    if (current === undefined) {
      throw new Error(`file does not exist: ${path}`);
    }
    this.files.set(path, current + contents);
  }

  read(path: string): string {
    const contents = this.files.get(path);
    if (contents === undefined) {
      throw new Error(`file does not exist: ${path}`);
    }
    return contents;
  }
}
