import { afterAll, describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import {
  ACTIVE_TERMINAL_STATUS,
  createInitialState,
  type GameState
} from "../state/index.js";
import { step, type TurnEvent, type TurnHookResult } from "../turn/index.js";
import {
  applyNutrition,
  applyXp,
  derivePlayerBaseStats,
  playerTickHooks,
  unregisterPlayerTickHooks,
  xpToNextLevel
} from "./player.js";

afterAll(() => {
  unregisterPlayerTickHooks();
});

describe("XP and level growth", () => {
  it("uses the configured level curve for spot cases", () => {
    expect(xpToNextLevel(1)).toBe(config.playerCharacter.xpToNextLevelFactor);
    expect(xpToNextLevel(7)).toBe(
      config.playerCharacter.xpToNextLevelFactor * 7
    );

    const almost = applyXp(
      createInitialState("xp-almost"),
      xpToNextLevel(1) - 1
    );
    expect(almost.state.player.level).toBe(
      config.playerCharacter.stats.level.start
    );
    expect(almost.state.player.xp).toBe(xpToNextLevel(1) - 1);
    expect(almost.events).toEqual([]);

    const exact = applyXp(almost.state, 1);
    expect(exact.state.player.level).toBe(2);
    expect(exact.state.player.xp).toBe(0);
    expect(eventOfType(exact.events, "level_up").data).toMatchObject({
      levelBefore: 1,
      levelAfter: 2,
      xpBefore: xpToNextLevel(1),
      xpAfter: 0
    });
  });

  it("supports multi-level gains and stops at the configured level cap", () => {
    const multiLevelXp = xpToNextLevel(1) + xpToNextLevel(2) + 1;
    const multi = applyXp(createInitialState("xp-multi"), multiLevelXp);

    expect(multi.state.player.level).toBe(3);
    expect(multi.state.player.xp).toBe(1);
    const levelUps = multi.events.filter(
      (event): event is Extract<TurnEvent, { readonly type: "level_up" }> =>
        event.type === "level_up"
    );
    expect(levelUps).toHaveLength(2);
    expect(levelUps[0]?.data).toMatchObject({
      levelBefore: 1,
      levelAfter: 2,
      maxHpBefore: derivePlayerBaseStats(1).maxHp,
      maxHpAfter: derivePlayerBaseStats(2).maxHp,
      currentHpBefore: derivePlayerBaseStats(1).maxHp,
      currentHpAfter: derivePlayerBaseStats(2).maxHp
    });
    expect(levelUps[1]?.data).toMatchObject({
      levelBefore: 2,
      levelAfter: 3,
      maxHpBefore: derivePlayerBaseStats(2).maxHp,
      maxHpAfter: derivePlayerBaseStats(3).maxHp,
      currentHpBefore: derivePlayerBaseStats(2).maxHp,
      currentHpAfter: derivePlayerBaseStats(3).maxHp
    });

    const xpToCap = sumThresholdsThroughLevel(
      bounds.playerCharacter.levelCap - 1
    );
    const capped = applyXp(createInitialState("xp-cap"), xpToCap + 1000);

    expect(capped.state.player.level).toBe(bounds.playerCharacter.levelCap);
    expect(capped.state.player.xp).toBe(1000);
    expect(capped.state.player.hp.max).toBe(
      derivePlayerBaseStats(bounds.playerCharacter.levelCap).maxHp
    );
    expect(
      capped.events.filter((event) => event.type === "level_up")
    ).toHaveLength(
      bounds.playerCharacter.levelCap - config.playerCharacter.stats.level.start
    );
  });

  it("derives base HP, ATK, and DEF growth from config", () => {
    expect(derivePlayerBaseStats(1)).toEqual({
      maxHp: config.playerCharacter.stats.hp.start,
      attack: config.playerCharacter.stats.baseAttack.start,
      defense: config.playerCharacter.stats.baseDefense.start
    });
    expect(derivePlayerBaseStats(3)).toEqual({
      maxHp:
        config.playerCharacter.stats.hp.start +
        2 * config.playerCharacter.stats.hp.growthPerLevel,
      attack:
        config.playerCharacter.stats.baseAttack.start +
        2 * config.playerCharacter.stats.baseAttack.growthAmount,
      defense: config.playerCharacter.stats.baseDefense.start
    });
    expect(derivePlayerBaseStats(4)).toEqual({
      maxHp:
        config.playerCharacter.stats.hp.start +
        3 * config.playerCharacter.stats.hp.growthPerLevel,
      attack:
        config.playerCharacter.stats.baseAttack.start +
        3 * config.playerCharacter.stats.baseAttack.growthAmount,
      defense:
        config.playerCharacter.stats.baseDefense.start +
        config.playerCharacter.stats.baseDefense.growthAmount
    });
  });

  it("increases current HP by the max-HP delta on level-up", () => {
    const maxHpBefore = config.playerCharacter.stats.hp.start;
    const damaged = withPlayerHp(
      createInitialState("xp-hp-delta"),
      5,
      maxHpBefore
    );
    const result = applyXp(damaged, xpToNextLevel(1));

    expect(result.state.player.hp).toEqual({
      current: 5 + config.playerCharacter.stats.hp.growthPerLevel,
      max: maxHpBefore + config.playerCharacter.stats.hp.growthPerLevel
    });
    expect(eventOfType(result.events, "level_up").data).toMatchObject({
      currentHpBefore: 5,
      currentHpAfter: 5 + config.playerCharacter.stats.hp.growthPerLevel,
      maxHpBefore,
      maxHpAfter: maxHpBefore + config.playerCharacter.stats.hp.growthPerLevel,
      hud: {
        pulse: true
      }
    });
  });

  it("self-registers level-up processing in the hunger tick slot", () => {
    const state = withPlayerXp(
      createInitialState("xp-registered"),
      xpToNextLevel(1)
    );
    const result = step(state, { kind: "wait" });

    expect(result.state.player.level).toBe(2);
    expect(eventOfType(result.events, "level_up").data.levelAfter).toBe(2);
  });
});

describe("fullness, starvation, and regeneration", () => {
  it("kills an idle full player on the exact closed-form starvation turn", () => {
    const start = createInitialState("closed-form-starvation");
    const expectedDeathTurn = expectedIdleStarvationDeathTurn(start);
    let state = start;

    for (let turn = 0; turn < expectedDeathTurn - 1; turn += 1) {
      state = step(state, { kind: "wait" }).state;
      expect(state.run.terminalStatus).toBe(ACTIVE_TERMINAL_STATUS);
      expect(state.player.hp.current).toBeGreaterThan(0);
    }

    const death = step(state, { kind: "wait" });

    expect(death.state.run.turn).toBe(expectedDeathTurn);
    expect(death.state.player.hp.current).toBe(0);
    expect(death.state.run.terminalStatus).toBe(
      config.runStructure.terminalStates.loss
    );
    expect(eventOfType(death.events, "starvation").data).toMatchObject({
      actorId: "player",
      hpAfter: 0,
      fullness: 0,
      hud: {
        pulse: true
      }
    });
  });

  it("gates natural regen on fullness and missing HP", () => {
    const regenTurn = config.playerCharacter.naturalRegen.everyTurns - 1;
    const starving = withTurn(
      withPlayerFullness(
        withPlayerHp(createInitialState("regen-starving"), 10, 20),
        0,
        100
      ),
      regenTurn
    );
    const fullHp = withTurn(createInitialState("regen-full-hp"), regenTurn);
    const wounded = withTurn(
      withPlayerHp(createInitialState("regen-positive"), 10, 20),
      regenTurn
    );

    const starvingRegen = playerTickHooks.regen({
      state: starving,
      hook: "regen",
      action: { kind: "wait" }
    });
    const fullHpRegen = playerTickHooks.regen({
      state: fullHp,
      hook: "regen",
      action: { kind: "wait" }
    });
    const woundedRegen = playerTickHooks.regen({
      state: wounded,
      hook: "regen",
      action: { kind: "wait" }
    });

    expect(hookState(starvingRegen).player.hp.current).toBe(10);
    expect(hookEvents(starvingRegen)).toEqual([]);
    expect(hookState(fullHpRegen).player.hp.current).toBe(fullHp.player.hp.max);
    expect(hookEvents(fullHpRegen)).toEqual([]);
    expect(hookState(woundedRegen).player.hp.current).toBe(
      10 + config.playerCharacter.naturalRegen.hpGain
    );
    expect(hookEvents(woundedRegen)).toEqual([]);
  });

  it("decays overfed fullness back to the normal cap before normal hunger", () => {
    const overfed = applyNutrition(
      createInitialState("overfeed-decay"),
      bounds.playerCharacter.overfedFullnessCap
    ).state;
    let state = overfed;

    expect(state.player.fullness).toEqual({
      current: bounds.playerCharacter.overfedFullnessCap,
      max: bounds.playerCharacter.overfedFullnessCap
    });

    const overfedTurns =
      (bounds.playerCharacter.overfedFullnessCap -
        bounds.playerCharacter.fullnessCap) *
      config.playerCharacter.stats.fullness.decay.everyTurns;

    for (let turn = 0; turn < overfedTurns; turn += 1) {
      state = step(state, { kind: "wait" }).state;
    }

    expect(state.player.fullness).toEqual({
      current: bounds.playerCharacter.fullnessCap,
      max: bounds.playerCharacter.fullnessCap
    });

    for (
      let turn = 0;
      turn < config.playerCharacter.stats.fullness.decay.everyTurns;
      turn += 1
    ) {
      state = step(state, { kind: "wait" }).state;
    }

    expect(state.player.fullness.current).toBe(
      bounds.playerCharacter.fullnessCap -
        config.playerCharacter.stats.fullness.decay.amount
    );
  });
});

const expectedIdleStarvationDeathTurn = (state: GameState): number => {
  const decay = config.playerCharacter.stats.fullness.decay;
  const starvation = config.playerCharacter.stats.fullness.starvationDamage;
  const turnsUntilEmpty =
    Math.ceil(state.player.fullness.current / decay.amount) * decay.everyTurns;
  const starvationTicksToDie = Math.ceil(
    state.player.hp.current / starvation.hpLoss
  );

  return turnsUntilEmpty + starvationTicksToDie * starvation.everyTurns;
};

const sumThresholdsThroughLevel = (level: number): number => {
  let total = 0;

  for (
    let currentLevel = config.playerCharacter.stats.level.start;
    currentLevel <= level;
    currentLevel += 1
  ) {
    total += xpToNextLevel(currentLevel);
  }

  return total;
};

const withPlayerHp = (
  state: GameState,
  current: number,
  max: number
): GameState => ({
  ...state,
  player: {
    ...state.player,
    hp: {
      current,
      max
    }
  }
});

const withPlayerXp = (state: GameState, xp: number): GameState => ({
  ...state,
  player: {
    ...state.player,
    xp
  }
});

const withPlayerFullness = (
  state: GameState,
  current: number,
  max: number
): GameState => ({
  ...state,
  player: {
    ...state.player,
    fullness: {
      current,
      max
    }
  }
});

const withTurn = (state: GameState, turn: number): GameState => ({
  ...state,
  run: {
    ...state.run,
    turn
  }
});

const hookState = (result: TurnHookResult): GameState =>
  "state" in result ? result.state : result;

const hookEvents = (result: TurnHookResult): readonly TurnEvent[] =>
  "state" in result ? (result.events ?? []) : [];

const eventOfType = <Type extends TurnEvent["type"]>(
  events: readonly TurnEvent[],
  type: Type
): Extract<TurnEvent, { readonly type: Type }> => {
  const event = events.find(
    (candidate): candidate is Extract<TurnEvent, { readonly type: Type }> =>
      candidate.type === type
  );

  if (event === undefined) {
    throw new Error(`missing event ${type}`);
  }

  return event;
};
