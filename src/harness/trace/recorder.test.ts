import { describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import {
  currentFloorRuntime,
  startRun,
  stepRun,
  type FloorContentProvider,
  type RunAction
} from "../../engine/run/loop.js";
import type { RunEvent } from "../../engine/run/events.js";
import { applyStatus } from "../../engine/systems/status.js";
import {
  deserialize,
  serialize,
  type GameState,
  type Position
} from "../../engine/state/index.js";
import { ENGINE_VERSION, PROTOCOL_VERSION } from "../../schemas/protocol.js";
import { FallbackFloorContentProvider } from "../fallback-provider.js";
import {
  createFileTraceWriter,
  record,
  traceRunId,
  type EngineLikeSession,
  type TraceFsAdapter,
  type TraceHeader,
  type TraceTerminalLine,
  type TraceTurnLine
} from "./recorder.js";
import { computeStateHash, hashSerializedState } from "./hash.js";

const CONTENT_REF = {
  providerId: "fallback:old-stock",
  packVersion: "0.0.0"
} as const;
const CREATED_AT = "2026-06-12T00:00:00.000Z";

describe("trace recorder", () => {
  it("records a short fixture run as parseable stamped NDJSON", () => {
    const seed = "trace-short";
    const fs = new MemoryTraceFs();
    const runId = traceRunId(seed, CREATED_AT);
    const session = record(createFallbackRunSession(seed), {
      seed,
      createdAt: CREATED_AT,
      modelId: "none",
      contentRef: CONTENT_REF,
      runId,
      writer: createFileTraceWriter({ runId, fs })
    });

    session.step({ kind: "wait" });
    session.step({ kind: "abort" });

    const lines = readTraceLines(fs, runId);
    expect(lines).toHaveLength(4);

    const header = expectHeader(lines[0]);
    expect(header).toMatchObject({
      recordType: "header",
      protocolVersion: PROTOCOL_VERSION,
      engineVersion: ENGINE_VERSION,
      modelId: "none",
      contentRef: CONTENT_REF,
      seed,
      createdAt: CREATED_AT,
      runId
    });

    const turnLines = lines.slice(1, -1).map(expectTurnLine);
    expect(turnLines.map((line) => line.action.kind)).toEqual([
      "wait",
      "abort"
    ]);
    expect(
      turnLines.every((line) => /^[0-9a-f]{8}$/.test(line.stateHash))
    ).toBe(true);
    expect(turnLines.flatMap((line) => line.events).length).toBeGreaterThan(0);
    expect(expectTerminalLine(lines.at(-1), turnLines.at(-1)?.turn)).toMatchObject({
      recordType: "terminal",
      terminalStatus: "ABORTED"
    });
  });

  it("records decayed status durations through trace serialization until expiry", () => {
    const seed = "trace-status-duration-decay";
    const fs = new MemoryTraceFs();
    const runId = traceRunId(seed, CREATED_AT);
    const baseSession = createFallbackRunSession(seed);
    const burnDuration = bounds.statusVocabulary.durationTurns.burn.min;
    const burned = applyStatus(
      baseSession.state,
      "player",
      "burn",
      burnDuration
    );
    baseSession.replaceState(burned.state);

    const session = record(baseSession, {
      seed,
      createdAt: CREATED_AT,
      modelId: "none",
      contentRef: CONTENT_REF,
      runId,
      writer: createFileTraceWriter({ runId, fs })
    });
    const observedDurations: Array<number | "expired"> = [];

    for (let turn = 0; turn < burnDuration; turn += 1) {
      const result = session.step({ kind: "wait" });
      expect(deserialize(serialize(result.state))).toEqual(result.state);
      observedDurations.push(
        result.state.player.statuses.find((entry) => entry.status === "burn")
          ?.duration ?? "expired"
      );
    }

    expect(observedDurations).toEqual([
      ...Array.from({ length: burnDuration - 1 }, (_value, index) =>
        burnDuration - 1 - index
      ),
      "expired"
    ]);

    const turnLines = readTraceLines(fs, runId).slice(1).map(expectTurnLine);
    expect(turnLines).toHaveLength(burnDuration);
    expect(
      turnLines.every((line) => /^[0-9a-f]{8}$/.test(line.stateHash))
    ).toBe(true);
  });

  it("hashes stable serialized state deterministically", () => {
    const state = expectStartedRun(
      "trace-hash",
      new FallbackFloorContentProvider()
    );
    const serialized = serialize(state);

    expect(computeStateHash(state)).toBe(hashSerializedState(serialized));
    expect(computeStateHash(deserialize(serialized))).toBe(
      computeStateHash(state)
    );
  });

  it("does not alter final state for the same seed and actions", () => {
    const unrecordedHash = playShortScript("trace-purity", false);
    const recordedHash = playShortScript("trace-purity", true);

    expect(recordedHash).toBe(unrecordedHash);
  });

  it("records a full fallback WIN smoke through 12 floors", () => {
    const seed = "trace-full-win";
    const fs = new MemoryTraceFs();
    const runId = traceRunId(seed, CREATED_AT);
    const baseSession = createFallbackRunSession(seed);
    const session = record(baseSession, {
      seed,
      createdAt: CREATED_AT,
      modelId: "none",
      contentRef: CONTENT_REF,
      runId,
      writer: createFileTraceWriter({ runId, fs })
    });
    const visitedDepths: number[] = [session.state.run.depth];

    for (let depth = 1; depth < config.runStructure.depthFloors; depth += 1) {
      baseSession.replaceState(
        withPlayerPosition(
          session.state,
          requiredRuntime(session.state).stairsDown
        )
      );
      session.step({ kind: "descend" });
      visitedDepths.push(session.state.run.depth);
    }

    const hoard = requiredRuntime(session.state).hoard;
    expect(hoard).not.toBeNull();
    baseSession.replaceState(
      withPlayerPosition(session.state, hoard?.position ?? { x: -1, y: -1 })
    );
    session.step({ kind: "take_hoard" });

    expect(visitedDepths).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(session.state.run.terminalStatus).toBe(
      config.runStructure.terminalStates.win
    );

    const lines = readTraceLines(fs, runId);
    const turnLines = lines.slice(1, -1).map(expectTurnLine);
    expect(turnLines).toHaveLength(config.runStructure.depthFloors);
    expect(
      turnLines
        .flatMap((line) => line.events)
        .filter((event) => event.type === "run_floor_entered")
        .map((event) => event.data.depth)
    ).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(turnLines.at(-1)?.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["hoard_taken", "terminal_state"])
    );
    expect(expectTerminalLine(lines.at(-1), turnLines.at(-1)?.turn)).toMatchObject(
      {
        recordType: "terminal",
        terminalStatus: config.runStructure.terminalStates.win
      }
    );
  });
});

const playShortScript = (seed: string, withRecorder: boolean): string => {
  const baseSession = createFallbackRunSession(seed);
  const session = withRecorder
    ? record(baseSession, {
        seed,
        createdAt: CREATED_AT,
        modelId: "none",
        contentRef: CONTENT_REF,
        writer: memoryWriter(seed)
      })
    : baseSession;

  session.step({ kind: "wait" });
  session.step({ kind: "wait" });
  session.step({ kind: "abort" });

  return computeStateHash(session.state);
};

type MutableRunSession = EngineLikeSession<RunAction, RunEvent> & {
  readonly replaceState: (state: GameState) => void;
};

const createFallbackRunSession = (seed: string): MutableRunSession => {
  const provider = new FallbackFloorContentProvider();
  let state = expectStartedRun(seed, provider);

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
    },
    isTerminal: () => state.run.terminalStatus !== "ACTIVE",
    replaceState: (nextState) => {
      state = nextState;
    }
  };
};

const expectStartedRun = (
  seed: string,
  provider: FloorContentProvider
): GameState => {
  const started = startRun(seed, provider);
  expect(started.ok, started.ok ? "" : started.error.message).toBe(true);
  if (!started.ok) {
    throw new Error(started.error.message);
  }
  return started.state;
};

const requiredRuntime = (state: GameState) => {
  const runtime = currentFloorRuntime(state);
  expect(runtime).not.toBeNull();
  if (runtime === null) {
    throw new Error("missing run floor runtime");
  }
  return runtime;
};

const withPlayerPosition = (
  state: GameState,
  position: Position
): GameState => ({
  ...state,
  player: {
    ...state.player,
    position
  }
});

const memoryWriter = (seed: string) => {
  const runId = traceRunId(seed, CREATED_AT);
  return createFileTraceWriter({
    runId,
    fs: new MemoryTraceFs()
  });
};

const readTraceLines = (fs: MemoryTraceFs, runId: string): readonly string[] =>
  fs.read(`runs/${runId}/trace.ndjson`).trimEnd().split("\n");

const expectHeader = (line: string | undefined): TraceHeader => {
  expect(line).toBeDefined();
  const parsed = JSON.parse(line ?? "null") as unknown;
  expect(isRecord(parsed)).toBe(true);
  if (!isRecord(parsed) || parsed.recordType !== "header") {
    throw new Error("missing trace header");
  }
  return parsed as TraceHeader;
};

const expectTurnLine = (
  line: string | undefined
): TraceTurnLine<RunAction, RunEvent> => {
  expect(line).toBeDefined();
  const parsed = JSON.parse(line ?? "null") as unknown;
  expect(isRecord(parsed)).toBe(true);
  if (!isRecord(parsed)) {
    throw new Error("missing trace turn line");
  }
  expect(typeof parsed.turn).toBe("number");
  expect(isRecord(parsed.action)).toBe(true);
  expect(Array.isArray(parsed.events)).toBe(true);
  expect(typeof parsed.stateHash).toBe("string");
  return parsed as TraceTurnLine<RunAction, RunEvent>;
};

const expectTerminalLine = (
  line: string | undefined,
  expectedTurn: number | undefined
): TraceTerminalLine => {
  expect(line).toBeDefined();
  const parsed = JSON.parse(line ?? "null") as unknown;
  expect(isRecord(parsed)).toBe(true);
  if (!isRecord(parsed)) {
    throw new Error("missing trace terminal line");
  }
  expect(parsed.recordType).toBe("terminal");
  expect(parsed.turn).toBe(expectedTurn);
  expect(typeof parsed.stateHash).toBe("string");
  return parsed as TraceTerminalLine;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

class MemoryTraceFs implements TraceFsAdapter {
  readonly dirs: string[] = [];
  readonly files = new Map<string, string>();

  makeDir(path: string): void {
    this.dirs.push(path);
  }

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
