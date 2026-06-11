import { describe, expect, it } from "vitest";

import {
  makeEffectBundleFixture,
  makeEffectFixture,
  validQuaffTriggerFixture,
  validSelfTargetingFixture
} from "../../schemas/fixtures/vocab.js";
import type { EffectBundle } from "../../schemas/vocab/index.js";
import { createRng } from "../rng/index.js";
import { createInitialState } from "../state/index.js";
import { serialize } from "../state/serialize.js";
import {
  effectExecutedEvent,
  executeBundle,
  registerEffectExecutor,
  rejectEffect,
  type EffectExecutionContext,
  type EffectExecutor
} from "./registry.js";

describe("effect executor registry", () => {
  it("executes registered bundle effects in order", () => {
    const damage = makeEffectFixture("damage", "damage", { amount: 1 });
    const heal = makeEffectFixture("heal", "heal", { amount: 1 });
    const unregisterDamage = registerEffectExecutor("damage", xpExecutor(1));
    const unregisterHeal = registerEffectExecutor("heal", xpExecutor(10));

    try {
      const state = createInitialState("registry-order");
      const result = executeBundle(
        state,
        bundle([damage, heal]),
        context("registry-order")
      );

      expect(result.state.player.xp).toBe(11);
      expect(result.events.map((event) => event.type)).toEqual([
        "effect_executed",
        "effect_executed"
      ]);
      expect(
        result.events.map(
          (event) => effectExecuted(event).data.details.xpBefore
        )
      ).toEqual([0, 1]);
    } finally {
      unregisterHeal();
      unregisterDamage();
    }
  });

  it("rolls the whole bundle back when a later effect rejects", () => {
    const damage = makeEffectFixture("damage", "damage", { amount: 1 });
    const heal = makeEffectFixture("heal", "heal", { amount: 1 });
    const unregisterDamage = registerEffectExecutor("damage", xpExecutor(1));
    const unregisterHeal = registerEffectExecutor(
      "heal",
      (state, effect, ctx) =>
        rejectEffect(state, effect, "bounds", "forced rejection", ctx)
    );

    try {
      const state = createInitialState("registry-atomic");
      const before = serialize(state);
      const result = executeBundle(
        state,
        bundle([damage, heal]),
        context("registry-atomic")
      );

      expect(serialize(result.state)).toBe(before);
      expect(result.events).toEqual([
        {
          turn: 0,
          type: "effect_rejected",
          data: {
            verb: "heal",
            effectIndex: 1,
            code: "bounds",
            message: "forced rejection",
            sourceId: "player",
            targetId: "player",
            origin: null
          }
        }
      ]);
    } finally {
      unregisterHeal();
      unregisterDamage();
    }
  });

  it("rejects malformed bundle sizes without changing state", () => {
    const state = createInitialState("registry-size");
    const before = serialize(state);
    const malformed = {
      ...bundle([]),
      effects: []
    } as unknown as EffectBundle;

    const result = executeBundle(state, malformed, context("registry-size"));

    expect(serialize(result.state)).toBe(before);
    expect(result.events[0]?.type).toBe("effect_rejected");
    expect(result.events[0]?.data).toMatchObject({
      verb: "bundle",
      effectIndex: null,
      code: "bundle_size"
    });
  });
});

const xpExecutor =
  (amount: number): EffectExecutor =>
  (state, effect, ctx) => ({
    state: {
      ...state,
      player: {
        ...state.player,
        xp: state.player.xp + amount
      }
    },
    events: [
      effectExecutedEvent(state, effect.kind, ctx, {
        xpBefore: state.player.xp,
        amount
      })
    ]
  });

const bundle = (effects: EffectBundle["effects"]): EffectBundle =>
  makeEffectBundleFixture(
    effects,
    validQuaffTriggerFixture,
    validSelfTargetingFixture
  );

const context = (seed: string): EffectExecutionContext => ({
  sourceId: "player",
  targetId: "player",
  origin: null,
  rng: createRng(seed)
});

const effectExecuted = (
  event: ReturnType<typeof executeBundle>["events"][number]
): Extract<
  ReturnType<typeof executeBundle>["events"][number],
  { readonly type: "effect_executed" }
> => {
  if (event.type !== "effect_executed") {
    throw new Error(`expected effect_executed, got ${event.type}`);
  }

  return event;
};
