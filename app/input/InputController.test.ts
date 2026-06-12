import { describe, expect, it } from "vitest";

import { currentFloorRuntime, type RunAction } from "@engine/run";
import type { EntityInstance, GameState, Position } from "@engine/state";
import { buildReplayFrames } from "@/components/runindex/replay";

import { createClientGameSession } from "./game-session";
import { KEYMAP_BINDINGS, type KeyBindingContext } from "./keys";
import {
  dispatchGameKey,
  inputFocusContext,
  type InputDispatchDeps,
} from "./dispatcher";
import { defaultUi, type InputFeedbackActionKind, type UiSlice } from "@/store/game-store";

describe("keyboard input dispatch", () => {
  it("covers every keymap table binding with the declared handler intent", () => {
    const checked: string[] = [];

    for (const binding of KEYMAP_BINDINGS) {
      for (const context of binding.contexts) {
        for (const key of binding.keys) {
          const initialUi = uiForContext(context);
          const harness = createHarness(stateForTableBindings(), initialUi);
          const result = harness.press(key);

          checked.push(`${binding.id}:${context}:${key}`);
          expect(result.status, `${binding.id} ${context} ${key}`).not.toBe("ignored");

          switch (binding.intent.kind) {
            case "run_action":
              expect(harness.actions.at(-1), binding.id).toEqual(binding.intent.action);
              break;
            case "set_context_mode":
              expect(harness.ui.contextPanelMode, binding.id).toBe(binding.intent.mode);
              break;
            case "toggle_diary":
              expect(harness.ui.diaryOpen, binding.id).toBe(!initialUi.diaryOpen);
              break;
            case "open_keymap":
              expect(harness.ui.keymapOpen, binding.id).toBe(true);
              break;
            case "close_keymap":
              expect(harness.ui.keymapOpen, binding.id).toBe(false);
              break;
            case "close_top":
              expect(result.status, binding.id).toBe("handled");
              break;
            case "request_abort":
              expect(result.status, binding.id).toBe("confirm_required");
              expect(harness.ui.pendingConfirm, binding.id).toMatchObject({
                action: { kind: "abort" },
                prompt: "Abandon the run? y/n",
              });
              break;
            case "confirm_yes":
              expect(harness.actions.at(-1), binding.id).toEqual({ kind: "wait" });
              break;
            case "confirm_no":
              expect(harness.feedback.at(-1)?.reason, binding.id).toBe("Cancelled.");
              break;
          }
        }
      }
    }

    console.info(
      `key-table bindings covered: ${checked.length} key/context pairs across ${KEYMAP_BINDINGS.length} bindings`,
    );
  });

  it("dispatches illegal engine reasons into the visible log", () => {
    const session = createClientGameSession({ seed: "phase-50-illegal" });
    session.replaceState(withoutEntities(session.state, "item"));
    const result = session.step({ kind: "pickup" });

    expect(result.events).toEqual([
      expect.objectContaining({
        type: "action_illegal",
        data: expect.objectContaining({
          reason: "there is no item here to pick up",
        }),
      }),
    ]);
    expect(result.state.log.at(-1)).toMatchObject({
      type: "action_illegal",
      data: {
        actionKind: "pickup",
        reason: "there is no item here to pick up",
      },
    });
  });

  it("records canonical replayable trace lines from the web session holder", () => {
    const session = createClientGameSession({ seed: "phase-52-trace" });
    session.step({ kind: "wait" });
    session.step({ kind: "wait" });

    expect(session.parsedTrace.turns).toHaveLength(2);
    expect(session.traceContent.split("\n").filter(Boolean)).toHaveLength(3);
    expect(buildReplayFrames(session.traceContent).status).toBe("identical");
  });

  it("runs enemy behavior turns through the web session holder", () => {
    const session = createClientGameSession({ seed: "fullclear-combat-web" });
    const initial = withAdjacentEnemy(withFullHp(session.state));
    session.replaceState(initial);
    let current = initial;
    const events: ReturnType<typeof session.step>["events"][number][] = [];

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = session.step({ kind: "wait" });
      current = result.state;
      events.push(...result.events);

      if (current.player.hp.current < initial.player.hp.current) {
        break;
      }
    }

    expect(events.some((event) => event.type === "actor_turn")).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "attack_hit" && event.data.defenderId === "player",
      ),
    ).toBe(true);
    expect(current.player.hp.current).toBeLessThan(initial.player.hp.current);
  });

  it("confirms top-level Esc before dispatching engine abort to ABORTED", () => {
    const session = createClientGameSession({ seed: "phase-55-abort-confirm" });
    const harness = createHarness(session.state);
    const request = harness.press("Escape");

    expect(request.status).toBe("confirm_required");
    expect(harness.actions).toEqual([]);
    expect(harness.ui.pendingConfirm).toMatchObject({
      action: { kind: "abort" },
      prompt: "Abandon the run? y/n",
    });

    const yes = harness.press("y");
    expect(yes.status).toBe("action_dispatched");
    expect(harness.actions).toEqual([{ kind: "abort" }]);

    const aborted = session.step(harness.actions[0]!);
    expect(aborted.state.run.terminalStatus).toBe("ABORTED");

    const panelHarness = createHarness(session.state, {
      ...defaultUi,
      contextPanelMode: "inventory",
    });
    expect(inputFocusContext(panelHarness.ui)).toBe("play");
    expect(panelHarness.press("Escape").status).toBe("handled");
    expect(panelHarness.ui.contextPanelMode).toBe("inspect");
    expect(panelHarness.ui.pendingConfirm).toBeNull();
  });

  it("intercepts descend next to an enemy until y/Enter confirms or n/Esc cancels", () => {
    const base = withAdjacentEnemy(
      withPlayerOnStairs(
        createClientGameSession({ seed: "phase-50-confirm" }).state,
      ),
    );
    const harness = createHarness(base);
    const request = harness.press(">");

    expect(request.status).toBe("confirm_required");
    expect(harness.actions).toEqual([]);
    expect(harness.ui.pendingConfirm?.action).toEqual({ kind: "descend" });

    const yes = harness.press("y");
    expect(yes.status).toBe("action_dispatched");
    expect(harness.actions).toEqual([{ kind: "descend" }]);

    const cancelHarness = createHarness(base);
    cancelHarness.press(">");
    const no = cancelHarness.press("n");
    expect(no.status).toBe("handled");
    expect(cancelHarness.actions).toEqual([]);
    expect(cancelHarness.ui.pendingConfirm).toBeNull();
    expect(cancelHarness.feedback.at(-1)).toEqual({
      actionKind: "descend",
      reason: "Cancelled.",
    });
  });

  it("stops repeated movement on each auto-travel notable", () => {
    const cases = [
      {
        name: "enemy sighted",
        state: withoutEntities(highHpState(), "item"),
        expected: "enemy_sighted",
      },
      {
        name: "item underfoot",
        state: withItemUnderfoot(withoutEntities(highHpState(), "enemy")),
        expected: "item_underfoot",
      },
      {
        name: "hp threshold",
        state: lowHpState(withoutEntities(stateForTableBindings(), "enemy", "item")),
        expected: "hp_threshold",
      },
    ] as const;

    for (const testCase of cases) {
      const harness = createHarness(testCase.state);
      const result = harness.press("ArrowRight", { repeat: true });

      expect(result.status, testCase.name).toBe("travel_stopped");
      expect(result.status === "travel_stopped" ? result.reason : null).toBe(
        testCase.expected,
      );
      expect(harness.actions, testCase.name).toEqual([]);
      expect(harness.feedback.at(-1)?.reason, testCase.name).toContain(
        "Auto-travel stopped:",
      );
    }
  });

  it("drops action keys while input is locked and ignores overlay keys except Esc/?", () => {
    const locked = createHarness(stateForTableBindings(), {
      ...defaultUi,
      inputLocked: true,
    });

    expect(locked.press("ArrowRight").status).toBe("input_locked");
    expect(locked.actions).toEqual([]);

    const overlay = createHarness(stateForTableBindings(), {
      ...defaultUi,
      keymapOpen: true,
    });

    expect(inputFocusContext(overlay.ui)).toBe("overlay");
    expect(overlay.press("g").status).toBe("ignored");
    expect(overlay.actions).toEqual([]);
    expect(overlay.ui.keymapOpen).toBe(true);

    expect(overlay.press("?").status).toBe("handled");
    expect(overlay.ui.keymapOpen).toBe(false);

    const escapeOverlay = createHarness(stateForTableBindings(), {
      ...defaultUi,
      keymapOpen: true,
    });
    expect(escapeOverlay.press("Escape").status).toBe("handled");
    expect(escapeOverlay.ui.keymapOpen).toBe(false);
  });
});

type Harness = {
  ui: UiSlice;
  actions: RunAction[];
  feedback: Array<{
    readonly actionKind: InputFeedbackActionKind;
    readonly reason: string;
  }>;
  readonly press: (
    key: string,
    options?: { readonly repeat?: boolean },
  ) => ReturnType<typeof dispatchGameKey>;
};

const createHarness = (
  gameState: GameState,
  initialUi: UiSlice = defaultUi,
): Harness => {
  let deps: InputDispatchDeps;
  const harness: Harness = {
    ui: { ...initialUi },
    actions: [],
    feedback: [],
    press: (key, options = {}) =>
      dispatchGameKey(
        {
          gameState,
          ui: harness.ui,
        },
        deps,
        { key, repeat: options.repeat },
      ),
  };

  deps = {
    dispatchAction: (action) => {
      harness.actions.push(action);
    },
    patchUi: (patch) => {
      harness.ui = { ...harness.ui, ...patch };
    },
    appendInputFeedback: (actionKind, reason) => {
      harness.feedback.push({ actionKind, reason });
    },
    lockInput: () => {
      harness.ui = { ...harness.ui, inputLocked: true };
    },
  };

  return harness;
};

const uiForContext = (context: KeyBindingContext): UiSlice => {
  switch (context) {
    case "play":
      return defaultUi;
    case "confirm":
      return {
        ...defaultUi,
        pendingConfirm: {
          action: { kind: "wait" },
          prompt: "Really? y/n",
        },
      };
    case "overlay":
      return { ...defaultUi, keymapOpen: true };
    case "paused-layer":
      return { ...defaultUi, diaryOpen: true };
  }
};

const stateForTableBindings = (): GameState =>
  withoutEntities(
    createClientGameSession({ seed: "phase-50-key-table" }).state,
    "enemy",
    "item",
  );

const highHpState = (): GameState => {
  const state = createClientGameSession({ seed: "phase-50-travel-high" }).state;

  return {
    ...state,
    player: {
      ...state.player,
      hp: {
        ...state.player.hp,
        current: state.player.hp.max,
      },
    },
  };
};

const lowHpState = (state: GameState): GameState => ({
  ...state,
  player: {
    ...state.player,
    hp: {
      ...state.player.hp,
      current: 1,
    },
  },
});

const withFullHp = (state: GameState): GameState => ({
  ...state,
  player: {
    ...state.player,
    hp: {
      ...state.player.hp,
      current: state.player.hp.max,
    },
  },
});

const withPlayerOnStairs = (state: GameState): GameState => {
  const runtime = currentFloorRuntime(state);
  if (runtime === null) {
    throw new Error("test state missing floor runtime");
  }

  return withPlayerPosition(state, runtime.stairsDown);
};

const withAdjacentEnemy = (state: GameState): GameState => {
  const position = {
    x: state.player.position.x + 1,
    y: state.player.position.y,
  };
  const existing = Object.values(state.entities).find(
    (entity) => entity.kind === "enemy",
  );

  if (existing !== undefined) {
    return {
      ...state,
      entities: {
        ...state.entities,
        [existing.id]: {
          ...existing,
          position,
        },
      },
    };
  }

  throw new Error("fallback state missing enemy fixture");
};

const withItemUnderfoot = (state: GameState): GameState => {
  const existing = Object.values(state.entities).find(
    (entity) => entity.kind === "item",
  );

  if (existing === undefined) {
    throw new Error("fallback state missing item fixture");
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [existing.id]: {
        ...existing,
        position: state.player.position,
      },
    },
  };
};

const withoutEntities = (
  state: GameState,
  ...kinds: readonly EntityInstance["kind"][]
): GameState => {
  const blocked = new Set(kinds);

  return {
    ...state,
    entities: Object.fromEntries(
      Object.entries(state.entities).filter(([, entity]) => !blocked.has(entity.kind)),
    ),
  };
};

const withPlayerPosition = (state: GameState, position: Position): GameState => ({
  ...state,
  player: {
    ...state.player,
    position,
  },
});
