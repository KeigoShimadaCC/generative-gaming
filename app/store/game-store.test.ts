import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARRIVAL_RITUAL_MS } from "@/components/transition/model";
import type {
  ClientGameSession,
  ClientGameSessionStep,
  ClientPrefetchState,
  ClientServedFloor
} from "@/input/game-session";
import { createInitialState, deserialize, type GameState } from "@engine/state";

import {
  defaultUi,
  updateBotStateBridge,
  useGameStore,
  type BotStateBridgeTarget
} from "./game-store";

vi.mock("@/input/game-session", () => ({
  createClientGameSession: vi.fn()
}));

vi.mock("@engine/turn", () => ({
  checkActionLegality: vi.fn(() => ({ status: "legal" }))
}));

describe("game store arrival transition", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      now: 0,
      toFake: ["Date", "performance", "setTimeout", "clearTimeout"]
    });
    resetGameStore();
  });

  afterEach(() => {
    resetGameStore();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("resumes on the original arrival timer when servedSource is already set", async () => {
    await beginArrival(createFakeSession("arrival-happy-path"));

    await vi.advanceTimersByTimeAsync(ARRIVAL_RITUAL_MS - 1);
    expect(useGameStore.getState().transition?.phase).toBe("arrival");
    expect(useGameStore.getState().ui.inputLocked).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(useGameStore.getState().transition).toBeNull();
    expect(useGameStore.getState().arrivalIntroLine).toBeNull();
    expect(useGameStore.getState().ui.inputLocked).toBe(false);
  });

  it("retries and resumes when servedSource appears after playableAt", async () => {
    await beginArrival(createFakeSession("arrival-delayed-source"));
    const arrival = useGameStore.getState().transition;
    expect(arrival?.phase).toBe("arrival");
    expect(arrival?.servedSource).toBe("generated");

    useGameStore.setState({
      transition: arrival === null ? null : { ...arrival, servedSource: null }
    });

    await vi.advanceTimersByTimeAsync(ARRIVAL_RITUAL_MS);
    expect(useGameStore.getState().transition?.phase).toBe("arrival");
    expect(useGameStore.getState().ui.inputLocked).toBe(true);

    const waitingForSource = useGameStore.getState().transition;
    useGameStore.setState({
      transition:
        waitingForSource === null
          ? null
          : { ...waitingForSource, servedSource: "generated" }
    });

    await vi.advanceTimersByTimeAsync(99);
    expect(useGameStore.getState().transition?.phase).toBe("arrival");
    expect(useGameStore.getState().ui.inputLocked).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(useGameStore.getState().transition).toBeNull();
    expect(useGameStore.getState().arrivalIntroLine).toBeNull();
    expect(useGameStore.getState().ui.inputLocked).toBe(false);
  });

  it("serves fallback and completes arrival when generated floor entry throws", async () => {
    const session = createFakeSession("entry-fallback", {
      failFirstDescend: true,
      resolvedSources: ["generated", "fallback"]
    });

    await beginArrival(session);

    expect(session.step).toHaveBeenCalledTimes(2);
    expect(session.resolveFloor).toHaveBeenCalledTimes(2);
    expect(session.setServedFloor).toHaveBeenCalledWith(
      expect.objectContaining({ depth: 2, source: "fallback" })
    );
    expect(useGameStore.getState().gameState?.run.depth).toBe(2);
    expect(useGameStore.getState().transition).toMatchObject({
      phase: "arrival",
      depth: 2,
      servedSource: "fallback"
    });
    expect(useGameStore.getState().latencySamples.at(-1)).toMatchObject({
      toDepth: 2,
      servedSource: "fallback"
    });
    expect(useGameStore.getState().ui.inputLocked).toBe(true);

    await vi.advanceTimersByTimeAsync(ARRIVAL_RITUAL_MS);

    expect(useGameStore.getState().transition).toBeNull();
    expect(useGameStore.getState().arrivalIntroLine).toBeNull();
    expect(useGameStore.getState().ui.inputLocked).toBe(false);
  });
});

describe("game store bot state bridge", () => {
  it("publishes a read-only serialized snapshot when the dev bridge flag is set", () => {
    const target = bridgeTarget("?botBridge=1");
    const state = createInitialState("bot-bridge-on");

    updateBotStateBridge(state, target);

    expect(target.__GG_BOT_STATE__).toBeTypeOf("string");
    expect(deserialize(target.__GG_BOT_STATE__ ?? "").run.seed).toBe(
      "bot-bridge-on"
    );
    expect(
      Object.getOwnPropertyDescriptor(target, "__GG_BOT_STATE__")?.writable
    ).toBe(false);
  });

  it("keeps the snapshot absent when the dev bridge flag is not set", () => {
    const target = bridgeTarget("");
    target.__GG_BOT_STATE__ = "stale";

    updateBotStateBridge(createInitialState("bot-bridge-off"), target);

    expect("__GG_BOT_STATE__" in target).toBe(false);
  });
});

const resetGameStore = (): void => {
  useGameStore.setState({
    gameState: null,
    gameSession: null,
    screen: "title",
    activeRun: null,
    runIndex: [],
    terminalRun: null,
    transition: null,
    arrivalIntroLine: null,
    latencySamples: [],
    ui: defaultUi
  });
};

const bridgeTarget = (search: string): BotStateBridgeTarget => ({
  location: { search }
});

const beginArrival = async (session: ClientGameSession): Promise<void> => {
  useGameStore.setState({
    gameSession: session,
    gameState: session.state,
    screen: "playing",
    transition: null,
    arrivalIntroLine: null,
    ui: defaultUi
  });

  expect(
    useGameStore.getState().dispatchAction({ kind: "descend" })
  ).toBeNull();
  await vi.advanceTimersByTimeAsync(0);

  expect(session.pollFloor).toHaveBeenCalledWith(2);
  expect(session.resolveFloor).toHaveBeenCalledWith(2);
  expect(session.step).toHaveBeenCalledWith({ kind: "descend" });
  expect(useGameStore.getState().transition?.phase).toBe("arrival");
  expect(useGameStore.getState().ui.inputLocked).toBe(true);
};

type FakeSessionOptions = {
  readonly failFirstDescend?: boolean;
  readonly resolvedSources?: readonly ClientServedFloor["source"][];
};

const createFakeSession = (
  seed: string,
  options: FakeSessionOptions = {}
): ClientGameSession => {
  let state = createInitialState(seed);
  let descendCalls = 0;
  let resolveCalls = 0;

  const session: ClientGameSession = {
    get state() {
      return state;
    },
    createdAt: "2026-06-13T00:00:00.000Z",
    traceContent: "{}\n",
    parsedTrace: {} as ClientGameSession["parsedTrace"],
    step: vi.fn((action): ClientGameSessionStep => {
      if (action.kind === "descend") {
        descendCalls += 1;
        if (options.failFirstDescend === true && descendCalls === 1) {
          throw new Error("roster is outside middle spawn budget");
        }

        state = stateAtDepth(state, state.run.depth + 1);
      }

      return { state, events: [] };
    }),
    replaceState: vi.fn((nextState) => {
      state = nextState;
    }),
    setServedFloor: vi.fn(),
    pollFloor: vi.fn(
      (): Promise<ClientPrefetchState> => Promise.resolve("none")
    ),
    resolveFloor: vi.fn((depth: number): Promise<ClientServedFloor> => {
      const sources = options.resolvedSources;
      const source =
        sources === undefined
          ? "generated"
          : (sources[Math.min(resolveCalls, sources.length - 1)] ??
            "generated");
      resolveCalls += 1;

      return Promise.resolve({
        depth,
        content: {} as ClientServedFloor["content"],
        source
      });
    }),
    prefetchNextFloor: vi.fn()
  };

  return session;
};

const stateAtDepth = (state: GameState, depth: number): GameState => ({
  ...state,
  run: {
    ...state.run,
    depth
  },
  floor: {
    ...state.floor,
    depth,
    floorId: `floor#${depth}`
  }
});
