import { writeFileSync } from "node:fs";

import {
  startRun,
  stepRun,
  type FloorContentProvider,
  type RunAction
} from "../../engine/run/loop.js";
import type { RunEvent } from "../../engine/run/events.js";
import {
  createFileTraceWriter,
  record,
  traceRunId,
  type EngineLikeSession,
  type TraceContentRef,
  type TraceFsAdapter
} from "../trace/recorder.js";
import { verifyTraceContent } from "./replay.js";
import type { VerifyResult } from "./types.js";

export type BuildTraceOptions = {
  readonly seed: string;
  readonly actions: readonly RunAction[];
  readonly provider: FloorContentProvider;
  readonly contentRef: TraceContentRef;
  readonly createdAt: string;
  readonly modelId?: string;
  readonly runId?: string;
};

export const buildTraceFromRun = (options: BuildTraceOptions): string => {
  const runId = options.runId ?? traceRunId(options.seed, options.createdAt);
  const fs = new MemoryTraceFs();
  const session = record(createRunSession(options.seed, options.provider), {
    seed: options.seed,
    createdAt: options.createdAt,
    modelId: options.modelId ?? "none",
    contentRef: options.contentRef,
    runId,
    writer: createFileTraceWriter({ runId, fs })
  });

  for (const action of options.actions) {
    session.step(action);
  }

  return fs.read(`runs/${runId}/trace.ndjson`);
};

export type RecordAndVerifyRoundTripOptions = BuildTraceOptions & {
  readonly tracePath?: string;
};

export type RecordAndVerifyRoundTripResult = {
  readonly trace: string;
  readonly verify: VerifyResult;
  readonly tracePath?: string;
};

export const recordAndVerifyRoundTrip = (
  options: RecordAndVerifyRoundTripOptions
): RecordAndVerifyRoundTripResult => {
  const trace = buildTraceFromRun(options);
  const verify = verifyTraceContent(trace);

  if (options.tracePath !== undefined) {
    writeFileSync(options.tracePath, trace, "utf8");
  }

  return {
    trace,
    verify,
    ...(options.tracePath === undefined ? {} : { tracePath: options.tracePath })
  };
};

const createRunSession = (
  seed: string,
  provider: FloorContentProvider
): EngineLikeSession<RunAction, RunEvent> => {
  const started = startRun(seed, provider);
  if (!started.ok) {
    throw new Error(`failed to start run: ${started.error.message}`);
  }

  let state = started.state;

  return {
    get state() {
      return state;
    },
    step: (action) => {
      const stepped = stepRun(state, action, provider);
      if (!stepped.ok) {
        throw new Error(
          `step failed at turn ${state.run.turn} for action ${action.kind}: ${stepped.error.message}`
        );
      }

      state = stepped.state;
      return {
        state: stepped.state,
        events: stepped.events
      };
    }
  };
};

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
