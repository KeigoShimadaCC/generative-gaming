import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

import { ENGINE_VERSION, PROTOCOL_VERSION } from "../../schemas/protocol.js";
import type { EngineLogEvent, GameState } from "../../engine/state/index.js";
import { computeStateHash } from "./hash.js";

export type TraceContentRef = {
  readonly providerId: string;
  readonly packVersion: string;
};

export type TraceHeader = {
  readonly recordType: "header";
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly engineVersion: string;
  readonly modelId: string;
  readonly contentRef: TraceContentRef;
  readonly seed: string;
  readonly createdAt: string;
  readonly runId: string;
};

export type TraceTurnLine<
  Action = unknown,
  Event extends EngineLogEvent = EngineLogEvent
> = {
  readonly turn: number;
  readonly action: Action;
  readonly events: readonly Event[];
  readonly stateHash: string;
};

export type EngineLikeStepResult<
  Event extends EngineLogEvent = EngineLogEvent
> = {
  readonly state: GameState;
  readonly events: readonly Event[];
};

export type EngineLikeSession<
  Action,
  Event extends EngineLogEvent = EngineLogEvent
> = {
  readonly state: GameState;
  readonly getAvailableActions?: () => readonly Action[];
  readonly step: (action: Action) => EngineLikeStepResult<Event>;
  readonly isTerminal?: () => boolean;
};

export type RecordedSession<
  Action,
  Event extends EngineLogEvent = EngineLogEvent
> = EngineLikeSession<Action, Event> & {
  readonly trace: TraceRecorder<Action, Event>;
};

export type TraceRecorderOptions = {
  readonly seed: string;
  readonly createdAt: string;
  readonly modelId: string;
  readonly contentRef: TraceContentRef;
  readonly runId?: string;
  readonly writer?: TraceWriter;
};

export type TraceRecorder<
  Action = unknown,
  Event extends EngineLogEvent = EngineLogEvent
> = {
  readonly header: TraceHeader;
  readonly path: string;
  readonly recordTurn: (
    action: Action,
    result: EngineLikeStepResult<Event>
  ) => TraceTurnLine<Action, Event>;
};

export type TraceWriter = {
  readonly path: string;
  readonly writeHeader: (header: TraceHeader) => void;
  readonly appendTurn: <Action, Event extends EngineLogEvent>(
    line: TraceTurnLine<Action, Event>
  ) => void;
};

export type TraceFsAdapter = {
  readonly makeDir: (path: string) => void;
  readonly writeNewFile: (path: string, contents: string) => void;
  readonly appendFile: (path: string, contents: string) => void;
};

export type FileTraceWriterOptions = {
  readonly runId: string;
  readonly rootDir?: string;
  readonly fs?: TraceFsAdapter;
};

export const createTraceRecorder = <
  Action,
  Event extends EngineLogEvent = EngineLogEvent
>(
  options: TraceRecorderOptions
): TraceRecorder<Action, Event> => {
  const runId = options.runId ?? traceRunId(options.seed, options.createdAt);
  const writer = options.writer ?? createFileTraceWriter({ runId });
  const header: TraceHeader = {
    recordType: "header",
    protocolVersion: PROTOCOL_VERSION,
    engineVersion: ENGINE_VERSION,
    modelId: options.modelId,
    contentRef: options.contentRef,
    seed: options.seed,
    createdAt: options.createdAt,
    runId
  };

  writer.writeHeader(header);

  return {
    header,
    path: writer.path,
    recordTurn: (action, result) => {
      // Trace turn numbers use the recorder's post-step state convention.
      const line: TraceTurnLine<Action, Event> = {
        turn: result.state.run.turn,
        action,
        events: result.events,
        stateHash: computeStateHash(result.state)
      };
      writer.appendTurn(line);
      return line;
    }
  };
};

export const record = <Action, Event extends EngineLogEvent = EngineLogEvent>(
  session: EngineLikeSession<Action, Event>,
  options: TraceRecorderOptions
): RecordedSession<Action, Event> => {
  const trace = createTraceRecorder<Action, Event>(options);

  return {
    get state() {
      return session.state;
    },
    getAvailableActions: session.getAvailableActions?.bind(session),
    isTerminal: session.isTerminal?.bind(session),
    step: (action) => {
      const result = session.step(action);
      trace.recordTurn(action, result);
      return result;
    },
    trace
  };
};

export const createFileTraceWriter = (
  options: FileTraceWriterOptions
): TraceWriter => {
  const rootDir = trimTrailingSlash(options.rootDir ?? "runs");
  const dir = `${rootDir}/${options.runId}`;
  const path = `${dir}/trace.ndjson`;
  const fs = options.fs ?? nodeTraceFsAdapter;

  return {
    path,
    writeHeader: (header) => {
      fs.makeDir(dir);
      fs.writeNewFile(path, `${JSON.stringify(header)}\n`);
    },
    appendTurn: (line) => {
      fs.appendFile(path, `${JSON.stringify(line)}\n`);
    }
  };
};

export const traceRunId = (seed: string, createdAt: string): string =>
  `run-${runIdComponent(seed)}-${runIdComponent(createdAt)}`;

const runIdComponent = (value: string): string => {
  const component = value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (component.length === 0) {
    return "blank";
  }

  return component.slice(0, 80);
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/g, "");

const nodeTraceFsAdapter: TraceFsAdapter = {
  makeDir: (path) => {
    mkdirSync(path, { recursive: true });
  },
  writeNewFile: (path, contents) => {
    writeFileSync(path, contents, { encoding: "utf8", flag: "wx" });
  },
  appendFile: (path, contents) => {
    appendFileSync(path, contents, { encoding: "utf8" });
  }
};
