import { describe, expect, it } from "vitest";

import type { GameState } from "../state/index.js";
import {
  TICK_HOOK_ORDER,
  registerTickHook,
  start,
  step,
  type TickHookName,
  type TurnEvent,
} from "./loop.js";

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly tick_registry_probe: {
      readonly hook: TickHookName;
      readonly label: string;
    };
  }
}

describe("tick hook registry", () => {
  it("runs registered hooks in fixed slot order and flows returned state/events", () => {
    const seen: TickHookName[] = [];
    const unregisters = TICK_HOOK_ORDER.map((slot) =>
      registerTickHook(slot, ({ hook, state }) => {
        seen.push(hook);

        return {
          state: withPlayerXp(state, state.player.xp + 1),
          events: [tickProbeEvent(state, hook, "registered")],
        };
      }),
    );

    try {
      const result = step(start("tick-registry-order"), { kind: "wait" });

      expect(seen).toEqual(TICK_HOOK_ORDER);
      expect(result.state.player.xp).toBe(TICK_HOOK_ORDER.length);
      expect(
        result.events
          .filter(isTickRegistryProbeEvent)
          .map((event) => event.data.hook),
      ).toEqual(TICK_HOOK_ORDER);
    } finally {
      for (const unregister of [...unregisters].reverse()) {
        unregister();
      }
    }
  });

  it("restores the previous hook when unregistering a replacement", () => {
    const seen: string[] = [];
    const unregisterFirst = registerTickHook("regen", ({ state }) => {
      seen.push("first");
      return state;
    });
    const unregisterSecond = registerTickHook("regen", ({ state }) => {
      seen.push("second");
      return state;
    });

    try {
      unregisterSecond();
      step(start("tick-registry-restore"), { kind: "wait" });

      expect(seen).toEqual(["first"]);
    } finally {
      unregisterSecond();
      unregisterFirst();
    }
  });
});

const withPlayerXp = (state: GameState, xp: number): GameState => ({
  ...state,
  player: {
    ...state.player,
    xp,
  },
});

const tickProbeEvent = (
  state: GameState,
  hook: TickHookName,
  label: string,
): TurnEvent =>
  ({
    turn: state.run.turn,
    type: "tick_registry_probe",
    data: {
      hook,
      label,
    },
  }) as TurnEvent;

const isTickRegistryProbeEvent = (
  event: TurnEvent,
): event is Extract<TurnEvent, { readonly type: "tick_registry_probe" }> =>
  event.type === "tick_registry_probe";
