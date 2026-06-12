"use client";

import { create } from "zustand";

import {
  createClientGameSession,
  type ClientGameSession,
  type ClientGameSessionStep,
} from "@/input/game-session";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type SettingsState,
} from "@/components/settings/model";
import {
  clearActiveRun,
  loadActiveRun,
  loadRunIndex,
  runIndexEntryFromState,
  saveActiveRun,
  upsertRunIndexEntry,
  type ActiveRunRecord,
  type RunIndexEntry,
} from "@/components/runindex/model";
import {
  READY_THEATER_MS,
  createDescendingTransition,
  floorIntroFromState,
  markTransitionFloorReady,
  shouldAutoEnterFloor,
  shouldResumePlay,
  startArrivalRitual,
  type FloorControllerState,
  type FloorTransitionState,
  type TransitionLatencySample,
} from "@/components/transition/model";
import type { RunAction } from "@engine/run";
import type { GameState } from "@engine/state";
import { checkActionLegality } from "@engine/turn";

export type ContextPanelMode = "inspect" | "inventory" | "quest" | "dialogue";
export type AppScreen = "title" | "playing" | "settings" | "run-index";

export type PendingConfirm = {
  readonly action: RunAction;
  readonly prompt: string;
};

export type InputFeedbackActionKind = Exclude<RunAction["kind"], "take_hoard">;

export type UiSlice = {
  readonly contextPanelMode: ContextPanelMode;
  readonly diaryOpen: boolean;
  readonly artifactOpen: boolean;
  readonly keymapOpen: boolean;
  readonly pendingConfirm: PendingConfirm | null;
  readonly inputLocked: boolean;
};

export type GameStore = {
  readonly gameState: GameState | null;
  readonly gameSession: ClientGameSession | null;
  readonly screen: AppScreen;
  readonly settings: SettingsState;
  readonly activeRun: ActiveRunRecord | null;
  readonly runIndex: readonly RunIndexEntry[];
  readonly terminalRun: GameState | null;
  readonly transition: FloorTransitionState | null;
  readonly arrivalIntroLine: string | null;
  readonly latencySamples: readonly TransitionLatencySample[];
  readonly ui: UiSlice;
  readonly hydratePersistence: () => void;
  readonly startGameSession: (options: { readonly seed: string }) => void;
  readonly continueActiveRun: () => void;
  readonly openTitle: () => void;
  readonly openSettings: () => void;
  readonly openRunIndex: () => void;
  readonly updateSettings: (settings: SettingsState) => void;
  readonly skipTransitionTheater: () => void;
  readonly setGameState: (state: GameState) => void;
  readonly dispatchAction: (action: RunAction) => ClientGameSessionStep | null;
  readonly appendInputFeedback: (
    actionKind: InputFeedbackActionKind,
    reason: string,
  ) => void;
  readonly setInputLocked: (inputLocked: boolean) => void;
  readonly patchUi: (patch: Partial<UiSlice>) => void;
};

export const defaultUi: UiSlice = {
  contextPanelMode: "inspect",
  diaryOpen: false,
  artifactOpen: false,
  keymapOpen: false,
  pendingConfirm: null,
  inputLocked: false,
};

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  gameSession: null,
  screen: "title",
  settings: DEFAULT_SETTINGS,
  activeRun: null,
  runIndex: [],
  terminalRun: null,
  transition: null,
  arrivalIntroLine: null,
  latencySamples: [],
  ui: defaultUi,
  hydratePersistence: () => {
    const storage = browserStorage();
    set({
      settings: loadSettings(storage),
      activeRun: loadActiveRun(storage),
      runIndex: loadRunIndex(storage),
    });
  },
  startGameSession: ({ seed }) => {
    const gameSession = createClientGameSession({ seed });
    const activeRun = activeRunFromSession(gameSession);
    persistActiveRun(gameSession);
    gameSession.prefetchNextFloor();
    set({
      gameSession,
      gameState: gameSession.state,
      screen: "playing",
      activeRun,
      terminalRun: null,
      transition: null,
      arrivalIntroLine: null,
      ui: defaultUi,
    });
  },
  continueActiveRun: () => {
    const activeRun = get().activeRun;
    if (activeRun === null || activeRun.gameState.run.terminalStatus !== "ACTIVE") {
      return;
    }

    const gameSession = createClientGameSession({
      seed: activeRun.seed,
      restoredState: activeRun.gameState,
      restoredTraceContent: activeRun.traceContent,
    });
    gameSession.prefetchNextFloor();
    set({
      gameSession,
      gameState: activeRun.gameState,
      screen: "playing",
      terminalRun: null,
      transition: null,
      arrivalIntroLine: null,
      ui: defaultUi,
    });
  },
  openTitle: () => set({ screen: "title" }),
  openSettings: () => set({ screen: "settings" }),
  openRunIndex: () =>
    set({ screen: "run-index", runIndex: loadRunIndex(browserStorage()) }),
  updateSettings: (settings) => {
    saveSettings(browserStorage(), settings);
    set({ settings });
  },
  skipTransitionTheater: () => {
    const transition = get().transition;
    if (
      transition === null ||
      transition.phase !== "descending" ||
      !transition.floorReady
    ) {
      return;
    }

    enterResolvedFloor(get, set);
  },
  setGameState: (gameState) =>
    set((current) => {
      current.gameSession?.replaceState(gameState);
      return { gameState };
    }),
  dispatchAction: (action) => {
    const session = get().gameSession;
    if (session === null) {
      return null;
    }

    const state = get().gameState;
    if (
      state !== null &&
      action.kind === "descend" &&
      state.run.terminalStatus === "ACTIVE" &&
      checkActionLegality(state, action).status === "legal"
    ) {
      beginDescendTransition(get, set);
      return null;
    }

    const result = session.step(action);
    persistAfterStep(session, result.state, set);
    return result;
  },
  appendInputFeedback: (actionKind, reason) =>
    set((current) => {
      if (current.gameState === null) {
        return {};
      }

      const event = {
        turn: current.gameState.run.turn,
        type: "action_illegal",
        data: {
          actionKind,
          reason,
        },
      } as const satisfies GameState["log"][number];
      const gameState = {
        ...current.gameState,
        log: [...current.gameState.log, event],
      };

      current.gameSession?.replaceState(gameState);

      return { gameState };
    }),
  setInputLocked: (inputLocked) =>
    set((current) => ({
      ui: { ...current.ui, inputLocked },
    })),
  patchUi: (patch) =>
    set((current) => ({
      ui: { ...current.ui, ...patch },
    })),
}));

type StoreSet = typeof useGameStore.setState;
type StoreGet = typeof useGameStore.getState;

const beginDescendTransition = (
  get: StoreGet,
  set: StoreSet,
): void => {
  const { gameSession, gameState } = get();
  if (gameSession === null || gameState === null || get().transition !== null) {
    return;
  }

  const nextDepth = gameState.run.depth + 1;
  const startedAtMs = nowMs();
  set({
    ui: { ...get().ui, inputLocked: true },
    transition: createDescendingTransition({
      depth: nextDepth,
      whisper: floorIntroFromState(gameState),
      controllerState: "none",
      startedAtMs,
    }),
    arrivalIntroLine: null,
  });

  void resolveTransitionFloor({
    get,
    set,
    session: gameSession,
    depth: nextDepth,
    startedAtMs,
  });
};

const resolveTransitionFloor = async ({
  get,
  set,
  session,
  depth,
  startedAtMs,
}: {
  readonly get: StoreGet;
  readonly set: StoreSet;
  readonly session: ClientGameSession;
  readonly depth: number;
  readonly startedAtMs: number;
}): Promise<void> => {
  const controllerState = await session.pollFloor(depth);
  patchCurrentTransition(get, set, {
    controllerState: controllerStateForStore(controllerState),
  });

  const served = await session.resolveFloor(depth);
  const readyAtMs = nowMs();
  const transition = get().transition;
  if (
    transition === null ||
    transition.phase !== "descending" ||
    transition.depth !== depth ||
    transition.startedAtMs !== startedAtMs
  ) {
    return;
  }

  set({
    transition: markTransitionFloorReady(
      transition,
      readyAtMs,
      served.source,
    ),
  });

  const next = get().transition;
  if (next === null) {
    return;
  }

  if (shouldAutoEnterFloor(next, nowMs())) {
    enterResolvedFloor(get, set);
    return;
  }

  const delayMs = Math.max(0, READY_THEATER_MS - (nowMs() - next.startedAtMs));
  globalThis.setTimeout(() => {
    const current = get().transition;
    if (current !== null && shouldAutoEnterFloor(current, nowMs())) {
      enterResolvedFloor(get, set);
    }
  }, delayMs);
};

const enterResolvedFloor = (
  get: StoreGet,
  set: StoreSet,
): void => {
  const { gameSession, transition } = get();
  if (
    gameSession === null ||
    transition === null ||
    transition.phase !== "descending" ||
    !transition.floorReady
  ) {
    return;
  }

  const result = gameSession.step({ kind: "descend" });
  const arrivalStartedAtMs = nowMs();
  const arrivalTransition = startArrivalRitual(transition, arrivalStartedAtMs);
  const introLine = floorIntroFromState(result.state);
  const latencySample = transitionLatencySample(
    result.state,
    arrivalTransition,
    arrivalStartedAtMs,
  );
  persistActiveRun(gameSession);
  gameSession.prefetchNextFloor();
  console.info("[stairs-to-playable]", latencySample);

  set({
    gameState: result.state,
    activeRun: activeRunFromSession(gameSession),
    transition: arrivalTransition,
    arrivalIntroLine: introLine,
    latencySamples: [...get().latencySamples, latencySample],
    ui: { ...get().ui, inputLocked: true, pendingConfirm: null },
  });

  const resumeDelayMs = Math.max(
    0,
    (arrivalTransition.playableAtMs ?? nowMs()) - nowMs(),
  );
  globalThis.setTimeout(() => {
    const current = get().transition;
    if (current !== null && shouldResumePlay(current, nowMs())) {
      finishArrival(get, set);
    }
  }, resumeDelayMs);
};

const finishArrival = (
  get: StoreGet,
  set: StoreSet,
): void => {
  const { transition } = get();
  if (
    transition === null ||
    transition.phase !== "arrival" ||
    transition.servedSource === null
  ) {
    return;
  }

  set({
    transition: null,
    arrivalIntroLine: null,
    ui: { ...get().ui, inputLocked: false },
  });
};

const transitionLatencySample = (
  state: GameState,
  transition: FloorTransitionState,
  recordedAtMs: number,
): TransitionLatencySample => ({
  runId: state.run.runId,
  fromDepth: Math.max(1, transition.depth - 1),
  toDepth: transition.depth,
  stairsToPlayableMs: Math.round(recordedAtMs - transition.startedAtMs),
  controllerState: transition.controllerState,
  servedSource: transition.servedSource ?? "fallback",
  recordedAtMs,
});

const patchCurrentTransition = (
  get: StoreGet,
  set: StoreSet,
  patch: Partial<FloorTransitionState>,
): void => {
  const transition = get().transition;
  if (transition === null) {
    return;
  }

  set({ transition: { ...transition, ...patch } });
};

const controllerStateForStore = (
  state: "ready" | "in_flight" | "none",
): FloorControllerState => state;

const persistAfterStep = (
  session: ClientGameSession,
  state: GameState,
  set: StoreSet,
): void => {
  if (state.run.terminalStatus === "ACTIVE") {
    persistActiveRun(session);
    set({
      gameState: state,
      activeRun: activeRunFromSession(session),
    });
    return;
  }

  const storage = browserStorage();
  const entry = runIndexEntryFromState({
    state,
    createdAt: session.createdAt,
    traceContent: session.traceContent,
  });
  const runIndex = upsertRunIndexEntry(storage, entry);
  clearActiveRun(storage);
  set({
    gameState: state,
    activeRun: null,
    runIndex,
    terminalRun: state,
    screen: "title",
    ui: defaultUi,
  });
};

const persistActiveRun = (session: ClientGameSession): void => {
  saveActiveRun(browserStorage(), activeRunFromSession(session));
};

const activeRunFromSession = (
  session: ClientGameSession,
): ActiveRunRecord => ({
  runId: session.state.run.runId,
  seed: session.state.run.seed,
  createdAt: session.createdAt,
  gameState: session.state,
  traceContent: session.traceContent,
});

const browserStorage = (): Storage | null =>
  typeof window === "undefined" ? null : window.localStorage;

const nowMs = (): number =>
  typeof performance === "undefined" ? Date.now() : performance.now();
