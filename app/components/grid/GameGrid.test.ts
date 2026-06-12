import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GridFrame } from "./GameGrid";
import {
  createFogMixGridFixtureState,
  createLargestBandFixtureState,
  createMidActionGridFixtureState,
  createPrecedenceFixtureState,
  withMovedPlayer,
} from "./fixtures";
import {
  createGridViewModel,
  type GridCellView,
  type GridViewModel,
} from "./model";
import type { GameState } from "@engine/state";

describe("GameGrid", () => {
  it("renders one cell per tile with visible, remembered, and unseen fog states", () => {
    const model = createGridViewModel(createFogMixGridFixtureState());
    const markup = renderGrid(model);

    expect(model.width).toBe(5);
    expect(model.height).toBe(3);
    expect(gridCellCount(markup)).toBe(15);
    expect(cellAt(model, 1, 1)).toMatchObject({
      glyph: "@",
      fog: "visible",
      layer: "player",
      badge: "YOU",
      shape: "circle",
    });
    expect(cellAt(model, 0, 0)).toMatchObject({
      glyph: ":",
      fog: "remembered",
      layer: "terrain",
    });
    expect(cellAt(model, 2, 1)).toMatchObject({
      glyph: ",",
      fog: "remembered",
      layer: "terrain",
    });
    expect(cellAt(model, 4, 0)).toMatchObject({
      glyph: " ",
      fog: "unseen",
      layer: "empty",
    });
    expect(markup).toContain('data-fog="remembered"');
    expect(markup).toContain('data-fog="unseen"');
  });

  it("matches engine layering precedence for player, enemy, npc, item, and revealed trap cells", () => {
    const model = createGridViewModel(createPrecedenceFixtureState());

    expect(rowGlyphs(model)).toBe("@eN?^");
    expect(cellAt(model, 0, 0)).toMatchObject({
      layer: "player",
      badge: "YOU",
      shape: "circle",
    });
    expect(cellAt(model, 1, 0)).toMatchObject({
      layer: "enemy",
      badge: "FOE",
      shape: "diamond",
    });
    expect(cellAt(model, 2, 0)).toMatchObject({
      layer: "npc",
      badge: "NPC",
      shape: "square",
    });
    expect(cellAt(model, 3, 0)).toMatchObject({
      layer: "item",
      badge: "ITM",
      shape: "dot",
    });
    expect(cellAt(model, 4, 0)).toMatchObject({
      layer: "trap",
      badge: "TRP",
      shape: "triangle",
    });
  });

  it("renders damage and heal pulses only for log events since the previous render", () => {
    const base = createMidActionGridFixtureState();
    const before = createGridViewModel(base);
    const after = createGridViewModel(withPulseEvents(base), before.cursor);
    const enemyCell = cellAt(after, 3, 1);
    const playerCell = cellAt(after, 1, 1);
    const markup = renderGrid(after);

    expect(enemyCell.hitFlash).toBe(true);
    expect(enemyCell.pulses).toEqual([
      expect.objectContaining({
        kind: "damage",
        text: "-3",
      }),
    ]);
    expect(playerCell.hitFlash).toBe(false);
    expect(playerCell.pulses).toEqual([
      expect.objectContaining({
        kind: "heal",
        text: "+2",
      }),
    ]);
    expect(markup).toContain('data-hit-flash="true"');
    expect(markup).toContain('data-pulse-kind="damage"');
    expect(markup).toContain('data-pulse-kind="heal"');
  });

  it("keeps largest-band Node static render work inside the per-update budget", () => {
    /*
     * This measures view-model construction plus React static markup rendering in
     * Vitest's Node process for 40x24 over 100 updates. It does not include browser
     * style, layout, paint, or input dispatch; the true UX <16ms claim still needs
     * a browser verifier pass.
     */
    const updateCount = 100;
    const strictBudgetMsPerUpdate = 16;
    // perf budgets are meaningful on dev hardware; CI runners are shared/variable -- local + e2e cover this.
    const budgetMsPerUpdate = process.env.CI
      ? strictBudgetMsPerUpdate * 4
      : strictBudgetMsPerUpdate;
    let state = createLargestBandFixtureState();
    let cursor = createGridViewModel(state).cursor;
    const startedAt = performance.now();

    for (let index = 0; index < updateCount; index += 1) {
      state = withMovedPlayer(
        state,
        {
          x: 1 + (index % 38),
          y: 1 + (Math.floor(index / 38) % 22),
        },
        index + 1,
      );
      const model = createGridViewModel(state, cursor);
      renderGrid(model);
      cursor = model.cursor;
    }

    const elapsedMs = performance.now() - startedAt;
    const averageMs = elapsedMs / updateCount;

    console.info(
      `largest-band static render: ${averageMs.toFixed(2)}ms/update (${elapsedMs.toFixed(1)}ms/${updateCount})`,
    );
    expect(averageMs).toBeLessThan(budgetMsPerUpdate);
  });
});

const renderGrid = (model: GridViewModel): string =>
  renderToStaticMarkup(createElement(GridFrame, { model }));

const gridCellCount = (markup: string): number =>
  markup.match(/role="gridcell"/g)?.length ?? 0;

const cellAt = (
  model: GridViewModel,
  x: number,
  y: number,
): GridCellView => {
  const cell = model.cells.find((entry) => entry.x === x && entry.y === y);

  if (cell === undefined) {
    throw new Error(`missing cell ${x},${y}`);
  }

  return cell;
};

const rowGlyphs = (model: GridViewModel): string =>
  model.rows[0]?.map((cell) => cell.glyph).join("") ?? "";

const withPulseEvents = (state: GameState): GameState => ({
  ...state,
  player: {
    ...state.player,
    hp: {
      ...state.player.hp,
      current: state.player.hp.current + 2,
    },
  },
  entities: {
    ...state.entities,
    "enemy#1": {
      ...state.entities["enemy#1"],
      currentHP: 3,
    } as NonNullable<typeof state.entities["enemy#1"]>,
  },
  log: [
    ...state.log,
    {
      turn: state.run.turn + 1,
      type: "attack_hit",
      data: {
        actorId: "player",
        defenderId: "enemy#1",
        attackerAttack: 5,
        defenderDefense: 1,
        baseDamage: 4,
        damage: 3,
        hitRoll: 8,
        hitChancePercent: 95,
        varianceMultiplier: 1,
        defenderHpBefore: 6,
        defenderHpAfter: 3,
      },
    } as GameState["log"][number],
    {
      turn: state.run.turn + 1,
      type: "status_tick",
      data: {
        entityId: "player",
        status: "regen",
        hpDelta: 2,
      },
    } as GameState["log"][number],
  ],
});
