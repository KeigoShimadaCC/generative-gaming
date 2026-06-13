"use client";

import { create } from "zustand";

import {
  createClientGameSession,
  type ClientGameSession,
  type ClientGameSessionStep,
  type ClientPrefetchState,
  type ClientServedFloor
} from "@/input/game-session";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type SettingsState
} from "@/components/settings/model";
import {
  clearActiveRun,
  loadActiveRun,
  loadRunIndex,
  runIndexEntryFromState,
  saveActiveRun,
  upsertRunIndexEntry,
  type ActiveRunRecord,
  type RunIndexEntry
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
  type TransitionLatencySample
} from "@/components/transition/model";
import type { RunAction } from "@engine/run";
import { serialize, type GameState } from "@engine/state";
import { checkActionLegality } from "@engine/turn";
import { createFallbackFloorContentProvider } from "@/api/director/fallback-provider-web";

const ARRIVAL_COMPLETION_RETRY_MS = 100;
const DESCEND_FLOOR_RETRY_MS = 2_000;
const DESCEND_FLOOR_RETRY_BUDGET_MS = 30_000;
const BOT_STATE_BRIDGE_QUERY_PARAM = "botBridge";
const BOT_STATE_BRIDGE_ENABLED_VALUE = "1";

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
    reason: string
  ) => void;
  readonly setInputLocked: (inputLocked: boolean) => void;
  readonly patchUi: (patch: Partial<UiSlice>) => void;
};

export type BotStateBridgeTarget = {
  readonly location?: {
    readonly search: string;
  };
  __GG_BOT_STATE__?: string;
};

export const defaultUi: UiSlice = {
  contextPanelMode: "inspect",
  diaryOpen: false,
  artifactOpen: false,
  keymapOpen: false,
  pendingConfirm: null,
  inputLocked: false
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
      runIndex: loadRunIndex(storage)
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
      ui: defaultUi
    });
  },
  continueActiveRun: () => {
    const activeRun = get().activeRun;
    if (
      activeRun === null ||
      activeRun.gameState.run.terminalStatus !== "ACTIVE"
    ) {
      return;
    }

    const gameSession = createClientGameSession({
      seed: activeRun.seed,
      restoredState: activeRun.gameState,
      restoredTraceContent: activeRun.traceContent
    });
    gameSession.prefetchNextFloor();
    set({
      gameSession,
      gameState: activeRun.gameState,
      screen: "playing",
      terminalRun: null,
      transition: null,
      arrivalIntroLine: null,
      ui: defaultUi
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
    const { gameSession, transition } = get();
    if (
      gameSession === null ||
      transition === null ||
      transition.phase !== "descending" ||
      !transition.floorReady
    ) {
      return;
    }

    enterResolvedFloor(get, set, gameSession);
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
          reason
        }
      } as const satisfies GameState["log"][number];
      const gameState = {
        ...current.gameState,
        log: [...current.gameState.log, event]
      };

      current.gameSession?.replaceState(gameState);

      return { gameState };
    }),
  setInputLocked: (inputLocked) =>
    set((current) => ({
      ui: { ...current.ui, inputLocked }
    })),
  patchUi: (patch) =>
    set((current) => ({
      ui: { ...current.ui, ...patch }
    }))
}));

useGameStore.subscribe((state) => {
  updateBotStateBridge(state.gameState);
});

export const updateBotStateBridge = (
  gameState: GameState | null,
  target: BotStateBridgeTarget | null = botStateBridgeTarget()
): void => {
  if (
    target === null ||
    process.env.NODE_ENV === "production" ||
    !botStateBridgeRequested(target)
  ) {
    clearBotStateBridge(target);
    return;
  }

  if (gameState === null) {
    clearBotStateBridge(target);
    return;
  }

  Object.defineProperty(target, "__GG_BOT_STATE__", {
    configurable: true,
    enumerable: false,
    value: serialize(gameState),
    writable: false
  });
};

type StoreSet = typeof useGameStore.setState;
type StoreGet = typeof useGameStore.getState;

const beginDescendTransition = (get: StoreGet, set: StoreSet): void => {
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
      startedAtMs
    }),
    arrivalIntroLine: null
  });

  void resolveTransitionFloor({
    get,
    set,
    session: gameSession,
    depth: nextDepth,
    startedAtMs
  });
};

const resolveTransitionFloor = async ({
  get,
  set,
  session,
  depth,
  startedAtMs
}: {
  readonly get: StoreGet;
  readonly set: StoreSet;
  readonly session: ClientGameSession;
  readonly depth: number;
  readonly startedAtMs: number;
}): Promise<void> => {
  const deadlineMs = startedAtMs + DESCEND_FLOOR_RETRY_BUDGET_MS;

  while (sameDescendingTransition(get().transition, descendingToken(depth, startedAtMs))) {
    if (nowMs() >= deadlineMs) {
      await recoverDescendWithFallback(get, set, session, depth, startedAtMs);
      return;
    }

    const resolved = await attemptResolveDescendFloor({
      get,
      set,
      session,
      depth,
      startedAtMs,
      deadlineMs
    });
    if (resolved) {
      if (get().transition?.phase !== "arrival") {
        await completeDescendTransition(get, set, session, depth, startedAtMs);
      }
      return;
    }

    if (!sameDescendingTransition(get().transition, descendingToken(depth, startedAtMs))) {
      return;
    }

    const waitMs = Math.min(DESCEND_FLOOR_RETRY_MS, deadlineMs - nowMs());
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }
};

const attemptResolveDescendFloor = async ({
  get,
  set,
  session,
  depth,
  startedAtMs,
  deadlineMs
}: {
  readonly get: StoreGet;
  readonly set: StoreSet;
  readonly session: ClientGameSession;
  readonly depth: number;
  readonly startedAtMs: number;
  readonly deadlineMs: number;
}): Promise<boolean> => {
  const token = descendingToken(depth, startedAtMs);

  try {
    const pollTimeoutMs = Math.min(
      DESCEND_FLOOR_RETRY_MS,
      Math.max(0, deadlineMs - nowMs())
    );
    if (pollTimeoutMs <= 0) {
      return false;
    }

    const snapshotBeforePoll = get().transition;
    const controllerState = await withTimeout(
      session.pollFloor(depth),
      pollTimeoutMs
    );
    const transitionAfterPoll = rebindDescendingTransition(
      get,
      set,
      token,
      snapshotBeforePoll
    );
    if (transitionAfterPoll === null) {
      return false;
    }

    patchCurrentTransition(get, set, {
      controllerState: controllerStateForStore(controllerState)
    });

    const snapshotBeforeResolve = get().transition;
    const resolveTimeoutMs = Math.min(
      DESCEND_FLOOR_RETRY_MS,
      Math.max(0, deadlineMs - nowMs())
    );
    if (resolveTimeoutMs <= 0) {
      return false;
    }

    const needsResolveTimeout =
      controllerState === "in_flight" || controllerState === "ready";
    const served = needsResolveTimeout
      ? await withTimeout(session.resolveFloor(depth), resolveTimeoutMs)
      : await session.resolveFloor(depth);
    const transitionAfterResolve = rebindDescendingTransition(
      get,
      set,
      token,
      snapshotBeforeResolve
    );
    if (transitionAfterResolve === null) {
      return false;
    }

    if (transitionAfterResolve.floorReady) {
      if (
        shouldAutoEnterFloor(transitionAfterResolve, nowMs()) &&
        shouldFinishReadyDescendFloor(controllerState, served.source)
      ) {
        return (
          finishReadyDescendFloor(
            get,
            set,
            session,
            transitionAfterResolve
          ) || true
        );
      }
      return true;
    }

    const readyTransition = markTransitionFloorReady(
      transitionAfterResolve,
      nowMs(),
      served.source
    );
    setTransitionState(set, readyTransition);
    if (
      shouldAutoEnterFloor(readyTransition, nowMs()) &&
      shouldFinishReadyDescendFloor(controllerState, served.source)
    ) {
      return finishReadyDescendFloor(get, set, session, readyTransition) || true;
    }
    return true;
  } catch {
    return false;
  }
};

const rebindDescendingTransition = (
  get: StoreGet,
  set: StoreSet,
  token: FloorTransitionState,
  snapshot: FloorTransitionState | null
): FloorTransitionState | null => {
  const current = get().transition;
  if (sameDescendingTransition(current, token)) {
    return current;
  }

  if (
    current === null &&
    snapshot !== null &&
    sameDescendingTransition(snapshot, token)
  ) {
    setTransitionState(set, snapshot);
    return snapshot;
  }

  return null;
};

const completeDescendTransition = async (
  get: StoreGet,
  set: StoreSet,
  session: ClientGameSession,
  depth: number,
  startedAtMs: number
): Promise<void> => {
  const token = descendingToken(depth, startedAtMs);
  const transition = get().transition;
  if (!sameDescendingTransition(transition, token) || !transition.floorReady) {
    return;
  }

  completeArrivalWhenReady(get, set);

  const next = get().transition;
  if (next === null) {
    return;
  }

  if (shouldAutoEnterFloor(next, nowMs())) {
    await enterResolvedFloorAsync(get, set, session);
    return;
  }

  const delayMs = Math.max(0, READY_THEATER_MS - (nowMs() - next.startedAtMs));
  globalThis.setTimeout(() => {
    const current = get().transition;
    if (
      current !== null &&
      sameDescendingTransition(current, token) &&
      shouldAutoEnterFloor(current, nowMs())
    ) {
      enterResolvedFloor(get, set, session);
    }
  }, delayMs);
};

const recoverDescendWithFallback = async (
  get: StoreGet,
  set: StoreSet,
  session: ClientGameSession,
  depth: number,
  startedAtMs: number
): Promise<void> => {
  const token = descendingToken(depth, startedAtMs);
  if (!sameDescendingTransition(get().transition, token)) {
    return;
  }

  let fallback = await withTimeout(
    resolveFallbackAfterEntryFailure(session, depth),
    DESCEND_FLOOR_RETRY_MS
  ).catch(() => null);

  if (fallback === null) {
    fallback = {
      depth,
      source: "fallback",
      content: createFallbackFloorContentProvider().getFloor(
        depth,
        session.state.run.seed
      )
    };
  }

  if (
    fallback.source !== "fallback" ||
    !sameDescendingTransition(get().transition, token)
  ) {
    clearFailedTransition(get, set);
    return;
  }

  session.setServedFloor(fallback);
  const transition = get().transition;
  if (transition === null || !sameDescendingTransition(transition, token)) {
    return;
  }

  setTransitionState(
    set,
    markTransitionFloorReady(transition, nowMs(), "fallback")
  );
  await enterResolvedFloorAsync(get, set, session);
};

const descendingToken = (
  depth: number,
  startedAtMs: number
): FloorTransitionState => ({
  phase: "descending",
  depth,
  startedAtMs,
  whisper: "",
  controllerState: "none",
  floorReady: false,
  readyAtMs: null,
  servedSource: null,
  arrivalStartedAtMs: null,
  playableAtMs: null
});

const shouldFinishReadyDescendFloor = (
  controllerState: ClientPrefetchState,
  servedSource: ClientServedFloor["source"]
): boolean => controllerState === "none" && servedSource === "fallback";

const finishReadyDescendFloor = (
  get: StoreGet,
  set: StoreSet,
  session: ClientGameSession,
  readyTransition: FloorTransitionState
): boolean => {
  try {
    const result = session.step({ kind: "descend" });
    commitResolvedFloorEntry(get, set, session, readyTransition, result);
    return true;
  } catch {
    return false;
  }
};

const enterResolvedFloor = (
  get: StoreGet,
  set: StoreSet,
  session: ClientGameSession
): void => {
  void enterResolvedFloorAsync(get, set, session);
};

const enterResolvedFloorAsync = async (
  get: StoreGet,
  set: StoreSet,
  gameSession: ClientGameSession
): Promise<void> => {
  const { transition } = get();
  if (
    transition === null ||
    transition.phase !== "descending" ||
    !transition.floorReady
  ) {
    return;
  }

  try {
    const result = gameSession.step({ kind: "descend" });
    commitResolvedFloorEntry(get, set, gameSession, transition, result);
    return;
  } catch {
    const stepped = await stepResolvedFloorAfterEntryFailure(
      get,
      set,
      gameSession,
      transition
    );
    if (stepped === null) {
      return;
    }

    commitResolvedFloorEntry(
      get,
      set,
      gameSession,
      stepped.transition,
      stepped.result
    );
  }
};

const commitResolvedFloorEntry = (
  get: StoreGet,
  set: StoreSet,
  gameSession: ClientGameSession,
  servedTransition: FloorTransitionState,
  result: ClientGameSessionStep
): void => {
  const arrivalStartedAtMs = nowMs();
  const arrivalTransition = startArrivalRitual(
    servedTransition,
    arrivalStartedAtMs
  );
  const introLine = floorIntroFromState(result.state);
  const latencySample = transitionLatencySample(
    result.state,
    arrivalTransition,
    arrivalStartedAtMs
  );
  persistActiveRun(gameSession);
  gameSession.prefetchNextFloor();

  set((current) => ({
    gameState: result.state,
    activeRun: activeRunFromSession(gameSession),
    transition: arrivalTransition,
    arrivalIntroLine: introLine,
    latencySamples: [...current.latencySamples, latencySample],
    ui: { ...current.ui, inputLocked: true, pendingConfirm: null }
  }));

  scheduleArrivalCompletion(get, set);
};

const stepResolvedFloorAfterEntryFailure = async (
  get: StoreGet,
  set: StoreSet,
  gameSession: ClientGameSession,
  transition: FloorTransitionState
): Promise<{
  readonly result: ClientGameSessionStep;
  readonly transition: FloorTransitionState;
} | null> => {
  const current = get().transition;
  if (!sameDescendingTransition(current, transition)) {
    return null;
  }

  const fallback = await resolveFallbackAfterEntryFailure(
    gameSession,
    transition.depth
  );
  if (fallback === null) {
    clearFailedTransition(get, set);
    return null;
  }

  if (fallback.source !== "fallback") {
    clearFailedTransition(get, set);
    return null;
  }

  gameSession.setServedFloor(fallback);

  const recovered = get().transition;
  if (!sameDescendingTransition(recovered, transition)) {
    return null;
  }

  const fallbackTransition = markTransitionFloorReady(
    recovered,
    recovered.readyAtMs ?? nowMs(),
    "fallback"
  );
  setTransitionState(set, fallbackTransition);

  try {
    return {
      result: gameSession.step({ kind: "descend" }),
      transition: fallbackTransition
    };
  } catch {
    clearFailedTransition(get, set);
    return null;
  }
};

const resolveFallbackAfterEntryFailure = async (
  gameSession: ClientGameSession,
  depth: number
): Promise<Awaited<ReturnType<ClientGameSession["resolveFloor"]>> | null> => {
  try {
    return await gameSession.resolveFloor(depth);
  } catch {
    return null;
  }
};

const clearFailedTransition = (get: StoreGet, set: StoreSet): void => {
  set((current) => ({
    transition: null,
    arrivalIntroLine: null,
    ui: { ...current.ui, inputLocked: false }
  }));
};

const sameDescendingTransition = (
  current: FloorTransitionState | null,
  expected: FloorTransitionState
): current is FloorTransitionState =>
  current !== null &&
  current.phase === "descending" &&
  expected.phase === "descending" &&
  current.depth === expected.depth &&
  current.startedAtMs === expected.startedAtMs;

const finishArrival = (get: StoreGet, set: StoreSet): boolean => {
  const { transition } = get();
  if (
    transition === null ||
    transition.phase !== "arrival" ||
    transition.servedSource === null
  ) {
    return false;
  }

  set((current) => ({
    transition: null,
    arrivalIntroLine: null,
    ui: { ...current.ui, inputLocked: false }
  }));
  return true;
};

const completeArrivalWhenReady = (get: StoreGet, set: StoreSet): boolean => {
  const current = get().transition;
  if (current === null || !shouldResumePlay(current, nowMs())) {
    return false;
  }

  return finishArrival(get, set);
};

const scheduleArrivalCompletion = (get: StoreGet, set: StoreSet): void => {
  if (completeArrivalWhenReady(get, set)) {
    return;
  }

  const transition = get().transition;
  if (transition === null || transition.phase !== "arrival") {
    return;
  }

  const currentMs = nowMs();
  const delayMs =
    transition.playableAtMs !== null && transition.playableAtMs > currentMs
      ? transition.playableAtMs - currentMs
      : ARRIVAL_COMPLETION_RETRY_MS;

  globalThis.setTimeout(() => {
    const current = get().transition;
    if (!sameArrivalTransition(current, transition)) {
      return;
    }

    scheduleArrivalCompletion(get, set);
  }, delayMs);
};

const sameArrivalTransition = (
  current: FloorTransitionState | null,
  expected: FloorTransitionState
): boolean =>
  current !== null &&
  current.phase === "arrival" &&
  expected.phase === "arrival" &&
  current.depth === expected.depth &&
  current.startedAtMs === expected.startedAtMs &&
  current.arrivalStartedAtMs === expected.arrivalStartedAtMs;

const transitionLatencySample = (
  state: GameState,
  transition: FloorTransitionState,
  recordedAtMs: number
): TransitionLatencySample => ({
  runId: state.run.runId,
  fromDepth: Math.max(1, transition.depth - 1),
  toDepth: transition.depth,
  stairsToPlayableMs: Math.round(recordedAtMs - transition.startedAtMs),
  controllerState: transition.controllerState,
  servedSource: transition.servedSource ?? "fallback",
  recordedAtMs
});

const setTransitionState = (
  set: StoreSet,
  transition: FloorTransitionState | null
): void => {
  set((current) => ({ ...current, transition }));
};

const patchCurrentTransition = (
  get: StoreGet,
  set: StoreSet,
  patch: Partial<FloorTransitionState>
): void => {
  const transition = get().transition;
  if (transition === null) {
    return;
  }

  setTransitionState(set, { ...transition, ...patch });
};

const controllerStateForStore = (
  state: "ready" | "in_flight" | "none"
): FloorControllerState => state;

const persistAfterStep = (
  session: ClientGameSession,
  state: GameState,
  set: StoreSet
): void => {
  if (state.run.terminalStatus === "ACTIVE") {
    persistActiveRun(session);
    set({
      gameState: state,
      activeRun: activeRunFromSession(session)
    });
    return;
  }

  const storage = browserStorage();
  const entry = runIndexEntryFromState({
    state,
    createdAt: session.createdAt,
    traceContent: session.traceContent
  });
  const runIndex = upsertRunIndexEntry(storage, entry);
  clearActiveRun(storage);
  set({
    gameState: state,
    activeRun: null,
    runIndex,
    terminalRun: state,
    screen: "title",
    ui: defaultUi
  });
};

const persistActiveRun = (session: ClientGameSession): void => {
  saveActiveRun(browserStorage(), activeRunFromSession(session));
};

const activeRunFromSession = (session: ClientGameSession): ActiveRunRecord => ({
  runId: session.state.run.runId,
  seed: session.state.run.seed,
  createdAt: session.createdAt,
  gameState: session.state,
  traceContent: session.traceContent
});

const browserStorage = (): Storage | null =>
  typeof window === "undefined" ? null : window.localStorage;

const botStateBridgeTarget = (): BotStateBridgeTarget | null =>
  typeof window === "undefined" ? null : window;

const botStateBridgeRequested = (target: BotStateBridgeTarget): boolean =>
  new URLSearchParams(target.location?.search ?? "").get(
    BOT_STATE_BRIDGE_QUERY_PARAM
  ) === BOT_STATE_BRIDGE_ENABLED_VALUE;

const clearBotStateBridge = (target: BotStateBridgeTarget | null): void => {
  if (target !== null) {
    delete target.__GG_BOT_STATE__;
  }
};

const nowMs = (): number =>
  typeof performance === "undefined" ? Date.now() : performance.now();

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = globalThis.setTimeout(
          () => reject(new Error("descend floor request timed out")),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timeoutId !== undefined) {
      globalThis.clearTimeout(timeoutId);
    }
  }
};
