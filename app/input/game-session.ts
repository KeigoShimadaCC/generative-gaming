"use client";

import "@/api/director/engine-runtime-web";

import { createFallbackFloorContentProvider } from "@/api/director/fallback-provider-web";
import {
  dialogueTurnHooks,
  freezeTurnCount,
  isWorldPaused,
} from "@engine/npc";
import {
  startRun,
  stepRun,
  type FloorContentProvider,
  type RunAction,
  type RunLoopResult,
} from "@engine/run";
import type { GameState } from "@engine/state";

type RunEvent = Extract<RunLoopResult, { readonly ok: true }>["events"][number];

export type ClientGameSessionStep = {
  readonly state: GameState;
  readonly events: readonly RunEvent[];
};

export type ClientGameSession = {
  readonly state: GameState;
  readonly step: (action: RunAction) => ClientGameSessionStep;
  readonly replaceState: (state: GameState) => void;
};

export type ClientGameSessionOptions = {
  readonly seed: string;
  readonly provider?: FloorContentProvider;
};

export const createClientGameSession = ({
  seed,
  provider = createFallbackFloorContentProvider(),
}: ClientGameSessionOptions): ClientGameSession => {
  const started = startRun(seed, provider);
  if (!started.ok) {
    throw new Error(started.error.message);
  }

  let state = started.state;

  return {
    get state() {
      return state;
    },
    step: (action) => {
      const before = state;
      const result = stepPlayerAction(before, action, provider);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      state = appendMissingReturnedEvents(before, result.state, result.events);

      return {
        state,
        events: result.events,
      };
    },
    replaceState: (nextState) => {
      state = nextState;
    },
  };
};

const stepPlayerAction = (
  state: GameState,
  action: RunAction,
  provider: FloorContentProvider,
): RunLoopResult => {
  const turnBefore = state.run.turn;
  const result = stepRun(state, action, provider, {
    hooks: dialogueTurnHooks(),
  });

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
