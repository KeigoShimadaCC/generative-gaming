import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createInitialState, type GameState } from "@engine/state";

import { HudFrame } from "./Hud";
import { createHudViewModel, type HudViewModel } from "./model";

describe("Hud", () => {
  it("renders depth, turn, HP number plus bar, fullness, level XP, and shaped status chips", () => {
    const model = createHudViewModel(createHudFixtureState());
    const markup = renderHud(model);

    expect(model.depth.value).toBe(3);
    expect(model.turn.value).toBe(17);
    expect(model.hp).toMatchObject({
      current: 11,
      max: 24,
    });
    expect(model.fullness).toMatchObject({
      current: 64,
      max: 100,
    });
    expect(model.levelXp).toMatchObject({
      level: 2,
      xp: 5,
    });
    expect(model.statuses).toEqual([
      {
        status: "poison",
        label: "Poison",
        duration: 3,
        shape: "diamond",
      },
      {
        status: "shield",
        label: "Shield",
        duration: 4,
        shape: "square",
      },
    ]);
    expect(markup).toContain('role="meter"');
    expect(markup).toContain('data-status="poison"');
    expect(markup).toContain('data-status-shape="diamond"');
    expect(markup).toContain('data-status="shield"');
    expect(markup).toContain('data-status-shape="square"');
  });

  it("pulses HUD fields only when player event metadata marks them changed since the previous render", () => {
    const base = createHudFixtureState();
    const before = createHudViewModel(base);
    const levelUp = createHudViewModel(withLevelUpPulse(base), before.cursor);
    const noHudChange = createHudViewModel(
      withNonHudEvent(base),
      before.cursor,
    );
    const firstRender = createHudViewModel(withLevelUpPulse(base));

    expect(levelUp.hp.pulse).toBe(true);
    expect(levelUp.levelXp.pulse).toBe(true);
    expect(levelUp.fullness.pulse).toBe(false);
    expect(levelUp.depth.pulse).toBe(false);
    expect(levelUp.turn.pulse).toBe(false);

    expect(noHudChange.hp.pulse).toBe(false);
    expect(noHudChange.levelXp.pulse).toBe(false);
    expect(firstRender.hp.pulse).toBe(false);
    expect(renderHud(levelUp)).toContain('data-pulse="true"');
  });
});

const renderHud = (model: HudViewModel): string =>
  renderToStaticMarkup(createElement(HudFrame, { model }));

const createHudFixtureState = (): GameState => ({
  ...createInitialState("hud-fixture"),
  run: {
    ...createInitialState("hud-fixture").run,
    depth: 3,
    turn: 17,
  },
  floor: {
    ...createInitialState("hud-fixture").floor,
    depth: 3,
  },
  player: {
    ...createInitialState("hud-fixture").player,
    hp: {
      current: 11,
      max: 24,
    },
    fullness: {
      current: 64,
      max: 100,
    },
    level: 2,
    xp: 5,
    statuses: [
      { status: "poison", duration: 3 },
      { status: "shield", duration: 4 },
    ],
  },
});

const withLevelUpPulse = (state: GameState): GameState => ({
  ...state,
  player: {
    ...state.player,
    hp: {
      current: 15,
      max: 28,
    },
    level: 3,
    xp: 1,
  },
  log: [
    ...state.log,
    {
      turn: state.run.turn,
      type: "level_up",
      data: {
        actorId: "player",
        levelBefore: 2,
        levelAfter: 3,
        xpBefore: 13,
        xpAfter: 1,
        xpToNextLevel: 24,
        maxHpBefore: 24,
        maxHpAfter: 28,
        currentHpBefore: 11,
        currentHpAfter: 15,
        hud: {
          pulse: true,
          fields: ["level", "xp", "hp", "maxHp", "attack", "defense"],
        },
      },
    } as GameState["log"][number],
  ],
});

const withNonHudEvent = (state: GameState): GameState => ({
  ...state,
  log: [
    ...state.log,
    {
      turn: state.run.turn,
      type: "moved",
      data: {
        actorId: "player",
        direction: "east",
        from: { x: 1, y: 1 },
        to: { x: 2, y: 1 },
      },
    } as GameState["log"][number],
  ],
});
