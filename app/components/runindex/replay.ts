import "@/api/director/engine-runtime-web";

import { createFallbackFloorContentProvider } from "@/api/director/fallback-provider-web";
import {
  startRun,
  stepRun,
  type RunAction,
} from "@engine/run";
import {
  serialize,
  type GameState,
} from "@engine/state";

export type ParsedTraceHeader = {
  readonly recordType: "header";
  readonly protocolVersion: string;
  readonly engineVersion: string;
  readonly modelId: string;
  readonly contentRef: {
    readonly providerId: string;
    readonly packVersion: string;
  };
  readonly seed: string;
  readonly createdAt: string;
  readonly runId: string;
};

export type ParsedTraceTurn = {
  readonly turn: number;
  readonly action: RunAction;
  readonly events: readonly GameState["log"][number][];
  readonly stateHash: string;
};

export type ParsedTrace = {
  readonly header: ParsedTraceHeader;
  readonly turns: readonly ParsedTraceTurn[];
};

export type ReplayFrame = {
  readonly index: number;
  readonly label: string;
  readonly state: GameState;
  readonly action: RunAction | null;
};

export type ReplayBuildResult =
  | {
      readonly status: "identical";
      readonly header: ParsedTraceHeader;
      readonly frames: readonly ReplayFrame[];
    }
  | {
      readonly status: "diverged";
      readonly header: ParsedTraceHeader;
      readonly frames: readonly ReplayFrame[];
      readonly firstDivergentTurn: number;
      readonly expectedHash: string;
      readonly actualHash: string;
    }
  | {
      readonly status: "unreadable";
      readonly error: string;
      readonly frames: readonly ReplayFrame[];
    };

export const buildReplayFrames = (content: string): ReplayBuildResult => {
  let trace: ParsedTrace;
  try {
    trace = parseTraceContent(content);
  } catch (error) {
    return {
      status: "unreadable",
      error: error instanceof Error ? error.message : String(error),
      frames: [],
    };
  }

  const provider = createFallbackFloorContentProvider();
  const started = startRun(trace.header.seed, provider);
  if (!started.ok) {
    return {
      status: "unreadable",
      error: started.error.message,
      frames: [],
    };
  }

  let state = started.state;
  const frames: ReplayFrame[] = [
    {
      index: 0,
      label: "Start",
      state,
      action: null,
    },
  ];

  for (const [index, record] of trace.turns.entries()) {
    const stepped = stepRun(state, record.action, provider);
    if (!stepped.ok) {
      return {
        status: "unreadable",
        error: stepped.error.message,
        frames,
      };
    }

    state = stepped.state;
    const actualHash = computeStateHash(state);
    frames.push({
      index: index + 1,
      label: actionLabel(record.action, record.turn),
      state,
      action: record.action,
    });

    if (state.run.turn !== record.turn || actualHash !== record.stateHash) {
      return {
        status: "diverged",
        header: trace.header,
        frames,
        firstDivergentTurn: record.turn,
        expectedHash: record.stateHash,
        actualHash,
      };
    }
  }

  return {
    status: "identical",
    header: trace.header,
    frames,
  };
};

export const parseTraceContent = (content: string): ParsedTrace => {
  const lines = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("trace is empty");
  }

  const header = parseHeader(JSON.parse(lines[0] ?? "") as unknown);
  const turns: ParsedTraceTurn[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const raw = lines[index] ?? "";
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new Error(
        `line ${index + 1}: invalid JSON (${error instanceof Error ? error.message : String(error)})`,
      );
    }

    turns.push(parseTurn(value, index + 1));
  }

  return { header, turns };
};

export const computeStateHash = (state: GameState): string =>
  hashSerializedState(serialize(state));

const parseHeader = (value: unknown): ParsedTraceHeader => {
  if (!isRecord(value) || value.recordType !== "header") {
    throw new Error("line 1: trace header must be a header object");
  }

  if (!isRecord(value.contentRef)) {
    throw new Error("line 1: contentRef must be an object");
  }

  return {
    recordType: "header",
    protocolVersion: readString(value, "protocolVersion", "header"),
    engineVersion: readString(value, "engineVersion", "header"),
    modelId: readString(value, "modelId", "header"),
    seed: readString(value, "seed", "header"),
    createdAt: readString(value, "createdAt", "header"),
    runId: readString(value, "runId", "header"),
    contentRef: {
      providerId: readString(value.contentRef, "providerId", "contentRef"),
      packVersion: readString(value.contentRef, "packVersion", "contentRef"),
    },
  };
};

const parseTurn = (value: unknown, lineNumber: number): ParsedTraceTurn => {
  if (!isRecord(value)) {
    throw new Error(`line ${lineNumber}: trace turn must be an object`);
  }

  const action = value.action;
  if (!isRecord(action) || typeof action.kind !== "string") {
    throw new Error(`line ${lineNumber}: action.kind must be a string`);
  }

  if (!Array.isArray(value.events)) {
    throw new Error(`line ${lineNumber}: events must be an array`);
  }

  return {
    turn: readInteger(value, "turn", `line ${lineNumber}`),
    action: action as unknown as RunAction,
    events: value.events as readonly GameState["log"][number][],
    stateHash: readString(value, "stateHash", `line ${lineNumber}`),
  };
};

const actionLabel = (action: RunAction, turn: number): string =>
  `t${turn} ${action.kind}`;

const readString = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): string => {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return value;
};

const readInteger = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): number => {
  const value = record[key];
  if (!Number.isInteger(value)) {
    throw new Error(`${label}.${key} must be an integer`);
  }
  return value as number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const hashSerializedState = (serialized: string): string => {
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
};
