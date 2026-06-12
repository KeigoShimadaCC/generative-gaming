"use client";

import "@/api/director/engine-runtime-web";

import { createFallbackFloorContentProvider } from "@/api/director/fallback-provider-web";
import {
  freezeTurnCount,
  isWorldPaused,
} from "@engine/npc";
import {
  startRun,
  stepRun,
  type FloorContentProvider,
  type FloorContent,
  type RunAction,
  type RunLoopResult,
} from "@engine/run";
import {
  serialize,
  type GameState,
} from "@engine/state";
import type { TurnHooks } from "@engine/turn";

type RunEvent = Extract<RunLoopResult, { readonly ok: true }>["events"][number];

export type ClientPrefetchState = "ready" | "in_flight" | "none";

export type ClientServedFloorSource = "generated" | "fallback";

export type ClientServedFloor = {
  readonly depth: number;
  readonly content: FloorContent;
  readonly source: ClientServedFloorSource;
};

export type ClientTraceHeader = {
  readonly recordType: "header";
  readonly protocolVersion: GameState["version"]["protocolVersion"];
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

export type ClientTraceTurn = {
  readonly turn: number;
  readonly action: RunAction;
  readonly events: readonly RunEvent[];
  readonly stateHash: string;
};

export type ClientParsedTrace = {
  readonly header: ClientTraceHeader;
  readonly turns: readonly ClientTraceTurn[];
};

export type ClientGameSessionStep = {
  readonly state: GameState;
  readonly events: readonly RunEvent[];
};

export type ClientGameSession = {
  readonly state: GameState;
  readonly createdAt: string;
  readonly traceContent: string;
  readonly parsedTrace: ClientParsedTrace;
  readonly step: (action: RunAction) => ClientGameSessionStep;
  readonly replaceState: (state: GameState) => void;
  readonly setServedFloor: (served: ClientServedFloor) => void;
  readonly pollFloor: (depth: number) => Promise<ClientPrefetchState>;
  readonly resolveFloor: (depth: number) => Promise<ClientServedFloor>;
  readonly prefetchNextFloor: () => void;
};

export type ClientGameSessionOptions = {
  readonly seed: string;
  readonly provider?: FloorContentProvider;
  readonly restoredState?: GameState;
  readonly restoredTraceContent?: string;
};

export const createClientGameSession = ({
  seed,
  provider = createFallbackFloorContentProvider(),
  restoredState,
  restoredTraceContent,
}: ClientGameSessionOptions): ClientGameSession => {
  const floorProvider = createClientServedFloorProvider(provider);
  const started = startRun(seed, floorProvider);
  if (!started.ok) {
    throw new Error(started.error.message);
  }

  let state = restoredState ?? started.state;
  const trace =
    restoredTraceContent === undefined
      ? createClientTrace({
          seed,
          createdAt: new Date().toISOString(),
          runId: state.run.runId,
          version: state.version,
        })
      : restoreClientTrace(restoredTraceContent) ??
        createClientTrace({
          seed,
          createdAt: new Date().toISOString(),
          runId: state.run.runId,
          version: state.version,
        });
  const createdAt = trace.header.createdAt;

  return {
    get state() {
      return state;
    },
    get createdAt() {
      return createdAt;
    },
    get traceContent() {
      return trace.content;
    },
    get parsedTrace() {
      return trace.parsed;
    },
    step: (action) => {
      const before = state;
      const result = stepPlayerAction(before, action, floorProvider);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      state = appendMissingReturnedEvents(before, result.state, result.events);
      trace.recordTurn(action, { state, events: result.events });

      return {
        state,
        events: result.events,
      };
    },
    replaceState: (nextState) => {
      state = nextState;
    },
    setServedFloor: (served) => {
      floorProvider.setServedFloor(served);
    },
    pollFloor: (depth) => pollPrefetchStatus(state.run.runId, depth),
    resolveFloor: async (depth) => {
      const served = await resolvePrefetchedFloor(state.run.runId, depth, seed);
      floorProvider.setServedFloor(served);
      return served;
    },
    prefetchNextFloor: () => {
      void startPrefetchForCurrentFloor(state.run.runId, state.run.depth, trace.parsed);
    },
  };
};

type ClientServedFloorProvider = FloorContentProvider & {
  readonly setServedFloor: (served: ClientServedFloor) => void;
};

const createClientServedFloorProvider = (
  fallbackProvider: FloorContentProvider,
): ClientServedFloorProvider => {
  const servedFloors = new Map<number, ClientServedFloor>();

  return {
    getFloor: (depth, seed) => {
      const served = servedFloors.get(depth);
      if (served === undefined) {
        return fallbackProvider.getFloor(depth, seed);
      }

      servedFloors.delete(depth);
      return withSeed(served.content, seed);
    },
    setServedFloor: (served) => {
      servedFloors.set(served.depth, served);
    },
  };
};

const withSeed = (content: FloorContent, seed: string): FloorContent => ({
  ...content,
  params: {
    ...content.params,
    seed,
  },
});

const stepPlayerAction = (
  state: GameState,
  action: RunAction,
  provider: FloorContentProvider,
): RunLoopResult => {
  const turnBefore = state.run.turn;
  const shouldFreezeWorld = action.kind === "talk" || isWorldPaused(state);
  const result = shouldFreezeWorld
    ? stepRun(state, action, provider, { hooks: frozenWorldTurnHooks() })
    : stepRun(state, action, provider);

  if (!result.ok) {
    return result;
  }

  let nextState = result.state;
  const events = [...result.events];

  if (action.kind === "talk" || isWorldPaused(state) || isWorldPaused(nextState)) {
    nextState = freezeTurnCount(nextState, turnBefore);
  }

  return {
    ok: true,
    state: nextState,
    events,
  };
};

const frozenWorldTurnHooks = (): TurnHooks => ({
  actorTurn: ({ state }) => state,
  ticks: {
    damageOverTime: ({ state }) => state,
    durations: ({ state }) => state,
    hunger: ({ state }) => state,
    regen: ({ state }) => state,
  },
});

const appendMissingReturnedEvents = (
  before: GameState,
  after: GameState,
  events: readonly RunEvent[],
): GameState => {
  const appendedCount = Math.max(0, after.log.length - before.log.length);
  if (appendedCount >= events.length) {
    return after;
  }

  return {
    ...after,
    log: [...after.log, ...events.slice(appendedCount)],
  };
};

type TraceVersion = {
  readonly protocolVersion: GameState["version"]["protocolVersion"];
  readonly engineVersion: string;
};

const CONTENT_REF = {
  providerId: "fallback:old-stock",
  packVersion: "0.0.0",
} as const;

const createClientTrace = ({
  seed,
  createdAt,
  runId,
  version,
}: {
  readonly seed: string;
  readonly createdAt: string;
  readonly runId: string;
  readonly version: TraceVersion;
}) => {
  const header: ClientTraceHeader = {
    recordType: "header",
    protocolVersion: version.protocolVersion,
    engineVersion: version.engineVersion,
    modelId: "web-client",
    contentRef: CONTENT_REF,
    seed,
    createdAt,
    runId,
  };
  const turns: ClientTraceTurn[] = [];
  const lines = [JSON.stringify(header)];

  return {
    header,
    get content() {
      return `${lines.join("\n")}\n`;
    },
    get parsed(): ClientParsedTrace {
      return {
        header,
        turns: [...turns],
      };
    },
    recordTurn: (
      action: RunAction,
      result: ClientGameSessionStep,
    ): ClientTraceTurn => {
      const line: ClientTraceTurn = {
        turn: result.state.run.turn,
        action,
        events: result.events,
        stateHash: computeStateHash(result.state),
      };
      turns.push(line);
      lines.push(JSON.stringify(line));
      return line;
    },
  };
};

const restoreClientTrace = (
  content: string,
): ReturnType<typeof createClientTrace> | null => {
  const lines = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return null;
  }

  try {
    const header = JSON.parse(lines[0] ?? "") as ClientTraceHeader;
    if (header.recordType !== "header") {
      return null;
    }
    const turns = lines.slice(1).map((line) => JSON.parse(line) as ClientTraceTurn);
    const mutableLines = [...lines];
    const mutableTurns = [...turns];

    return {
      header,
      get content() {
        return `${mutableLines.join("\n")}\n`;
      },
      get parsed(): ClientParsedTrace {
        return {
          header,
          turns: [...mutableTurns],
        };
      },
      recordTurn: (
        action: RunAction,
        result: ClientGameSessionStep,
      ): ClientTraceTurn => {
        const line: ClientTraceTurn = {
          turn: result.state.run.turn,
          action,
          events: result.events,
          stateHash: computeStateHash(result.state),
        };
        mutableTurns.push(line);
        mutableLines.push(JSON.stringify(line));
        return line;
      },
    };
  } catch {
    return null;
  }
};

const computeStateHash = (state: GameState): string =>
  hashSerializedState(serialize(state));

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

const startPrefetchForCurrentFloor = async (
  runId: string,
  depth: number,
  trace: ClientParsedTrace,
): Promise<void> => {
  try {
    await postJson("/api/director/start-generation", {
      runId,
      depth,
      trace,
    });
  } catch {
    // Offline fallback remains playable; transition instrumentation records "none".
  }
};

const pollPrefetchStatus = async (
  runId: string,
  depth: number,
): Promise<ClientPrefetchState> => {
  try {
    const response = await postJson("/api/director/poll-status", { runId });
    if (!isRecord(response)) {
      return "none";
    }

    if (response.status === "ready" && response.depth === depth) {
      return "ready";
    }

    if (response.status === "in_flight" && response.depth === depth) {
      return "in_flight";
    }

    return "none";
  } catch {
    return "none";
  }
};

const resolvePrefetchedFloor = async (
  runId: string,
  depth: number,
  seed: string,
): Promise<ClientServedFloor> => {
  try {
    const response = await postJson("/api/director/get-floor", {
      runId,
      depth,
      seed,
    });
    if (!isServedFloor(response)) {
      throw new Error("malformed served floor");
    }
    return response;
  } catch {
    return {
      depth,
      source: "fallback",
      content: createFallbackFloorContentProvider().getFloor(depth, seed),
    };
  }
};

const postJson = async (
  url: string,
  body: unknown,
): Promise<unknown> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }

  return response.json() as Promise<unknown>;
};

const isServedFloor = (value: unknown): value is ClientServedFloor =>
  isRecord(value) &&
  typeof value.depth === "number" &&
  (value.source === "generated" || value.source === "fallback") &&
  isRecord(value.content);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
