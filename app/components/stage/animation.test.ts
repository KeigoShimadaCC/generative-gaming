import { describe, expect, it } from "vitest";

import {
  createGridViewModel,
} from "@/components/grid/model";
import {
  createMidActionGridFixtureState,
  withMovedPlayer,
} from "@/components/grid/fixtures";
import type { GameState } from "@engine/state";

import {
  createStageAnimationPlan,
  type StageAnimationEvent,
} from "./animation";
import { createStageDrawList, type StageDrawList } from "./draw-list";

describe("PixiStage animation planning", () => {
  it("maps consecutive state position deltas to movement tweens", () => {
    const previous = createMidActionGridFixtureState();
    const next = withMovedPlayer(previous, { x: 2, y: 1 }, previous.run.turn + 1);
    const plan = animationPlan(previous, next);
    const move = eventOfKind(plan.events, "move");

    expect(move).toMatchObject({
      actorId: "player",
      from: { x: 1, y: 1 },
      to: { x: 2, y: 1 },
      fromCellKey: "1:1",
      toCellKey: "2:1",
      durationMs: 100,
    });
  });

  it("maps attack logs and hp deltas to lunge, hit flash, shake, damage number, and death dissolve", () => {
    const previous = createMidActionGridFixtureState();
    const next = withEnemyDamage(previous, 0, [
      {
        turn: previous.run.turn + 1,
        type: "attack_intent",
        data: {
          actorId: "player",
          targetId: "enemy#1",
          direction: "east",
        },
      },
      {
        turn: previous.run.turn + 1,
        type: "attack_hit",
        data: {
          actorId: "player",
          defenderId: "enemy#1",
          attackerAttack: 5,
          defenderDefense: 1,
          baseDamage: 4,
          damage: 6,
          hitRoll: 8,
          hitChancePercent: 95,
          varianceMultiplier: 1,
          defenderHpBefore: 6,
          defenderHpAfter: 0,
        },
      },
      {
        turn: previous.run.turn + 1,
        type: "entity_died",
        data: {
          entityId: "enemy#1",
          kind: "enemy",
          position: { x: 3, y: 1 },
          xpYield: 1,
        },
      },
    ]);
    const plan = animationPlan(previous, next);

    expect(eventOfKind(plan.events, "attack")).toMatchObject({
      actorId: "player",
      targetId: "enemy#1",
      sourceCellKey: "1:1",
      targetCellKey: "3:1",
      durationMs: 110,
    });
    expect(eventOfKind(plan.events, "hit")).toMatchObject({
      targetId: "enemy#1",
      damage: 6,
      cellKey: "3:1",
      flashMs: 48,
    });
    expect(eventOfKind(plan.events, "hit").shakePx).toBeGreaterThan(0);
    expect(eventOfKind(plan.events, "float_number")).toMatchObject({
      targetId: "enemy#1",
      amount: 6,
      text: "-6",
      tone: "damage",
      cellKey: "3:1",
    });
    expect(eventOfKind(plan.events, "death")).toMatchObject({
      actorId: "enemy#1",
      cellKey: "3:1",
      durationMs: 360,
    });
  });

  it("maps pickup, equip, quaff/throw, and door-open logs to interaction effects", () => {
    const previous = createMidActionGridFixtureState();
    const next = withInteractionLogs(previous);
    const plan = animationPlan(previous, next);

    expect(eventOfKind(plan.events, "pickup")).toMatchObject({
      itemId: "item#1",
      cellKey: "2:1",
    });
    expect(eventOfKind(plan.events, "equip")).toMatchObject({
      itemInstanceId: "gear#1",
      cellKey: "1:1",
    });
    expect(
      plan.events.filter((event) => event.kind === "item_trigger"),
    ).toEqual([
      expect.objectContaining({
        trigger: "quaff",
        cellKeys: ["1:1"],
      }),
      expect.objectContaining({
        trigger: "throw_hit",
        cellKeys: ["2:1", "3:1"],
      }),
    ]);
    expect(eventOfKind(plan.events, "door_open")).toMatchObject({
      cellKey: "2:1",
    });
  });

  it("maps current statuses to auras and status logs to bursts", () => {
    const previous = createMidActionGridFixtureState();
    const enemy = previous.entities["enemy#1"];

    if (enemy === undefined) {
      throw new Error("fixture missing enemy#1");
    }

    const next: GameState = {
      ...previous,
      run: {
        ...previous.run,
        turn: previous.run.turn + 1,
      },
      player: {
        ...previous.player,
        statuses: [
          { status: "burn", duration: 2 },
          { status: "poison", duration: 3 },
        ],
      },
      entities: {
        ...previous.entities,
        "enemy#1": {
          ...enemy,
          statuses: [{ status: "slow", duration: 3 }],
        },
      },
      log: [
        ...previous.log,
        {
          turn: previous.run.turn + 1,
          type: "status_applied",
          data: {
            entityId: "enemy#1",
            status: "slow",
            duration: 3,
          },
        } as GameState["log"][number],
      ],
    };
    const plan = animationPlan(previous, next);

    expect(plan.statusAuras).toEqual([
      expect.objectContaining({
        targetId: "enemy#1",
        statuses: ["slow"],
        cellKey: "3:1",
      }),
      expect.objectContaining({
        targetId: "player",
        statuses: ["burn", "poison"],
        cellKey: "1:1",
      }),
    ]);
    expect(eventOfKind(plan.events, "status_burst")).toMatchObject({
      targetId: "enemy#1",
      status: "slow",
      cellKey: "3:1",
    });
  });

  it("keeps cosmetic events but snaps heavy motion under reduced motion", () => {
    const previous = createMidActionGridFixtureState();
    const next = withEnemyDamage(
      withMovedPlayer(previous, { x: 2, y: 1 }, previous.run.turn + 1),
      3,
      [
        {
          turn: previous.run.turn + 2,
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
        },
      ],
    );
    const previousDrawList = drawListFor(previous);
    const nextDrawList = drawListFor(next);
    const plan = createStageAnimationPlan({
      previousState: previous,
      previousDrawList,
      state: next,
      drawList: nextDrawList,
      motionPreference: "reduced",
    });

    expect(eventOfKind(plan.events, "move").durationMs).toBe(0);
    expect(eventOfKind(plan.events, "hit").shakePx).toBe(0);
    expect(eventOfKind(plan.events, "float_number").text).toBe("-3");
    expect(plan.timings.idleBobPx).toBe(0);
  });
});

const animationPlan = (
  previous: GameState,
  next: GameState,
): ReturnType<typeof createStageAnimationPlan> =>
  createStageAnimationPlan({
    previousState: previous,
    previousDrawList: drawListFor(previous),
    state: next,
    drawList: drawListFor(next),
  });

const drawListFor = (state: GameState): StageDrawList =>
  createStageDrawList(createGridViewModel(state), {
    state,
    cameraLerp: 1,
  });

const eventOfKind = <Kind extends StageAnimationEvent["kind"]>(
  events: readonly StageAnimationEvent[],
  kind: Kind,
): Extract<StageAnimationEvent, { readonly kind: Kind }> => {
  const event = events.find(
    (candidate): candidate is Extract<StageAnimationEvent, { readonly kind: Kind }> =>
      candidate.kind === kind,
  );

  if (event === undefined) {
    throw new Error(`missing event kind ${kind}`);
  }

  return event;
};

const withEnemyDamage = (
  state: GameState,
  enemyHp: number,
  events: readonly RuntimeFixtureEvent[],
): GameState => {
  const enemy = state.entities["enemy#1"];

  if (enemy?.kind !== "enemy") {
    throw new Error("fixture missing enemy#1");
  }

  const entities: GameState["entities"] = enemyHp <= 0
    ? (Object.fromEntries(
        Object.entries(state.entities).filter(([id]) => id !== "enemy#1"),
      ) as GameState["entities"])
    : {
        ...state.entities,
        "enemy#1": {
          ...enemy,
          currentHP: enemyHp,
        },
      };

  return {
    ...state,
    run: {
      ...state.run,
      turn: state.run.turn + 1,
    },
    entities,
    log: [
      ...state.log,
      ...events.map((event) => event as GameState["log"][number]),
    ],
  };
};

const withInteractionLogs = (state: GameState): GameState => {
  const entities = Object.fromEntries(
    Object.entries(state.entities).filter(([id]) => id !== "item#1"),
  ) as GameState["entities"];

  return {
    ...state,
    run: {
      ...state.run,
      turn: state.run.turn + 1,
    },
    entities,
    log: [
      ...state.log,
      {
        turn: state.run.turn + 1,
        type: "item_picked_up",
        data: {
          itemInstanceId: "item#1",
          entityId: "item#1",
          definitionId: "grid-fixture-draught",
          quantity: 1,
          stacked: false,
        },
      },
      {
        turn: state.run.turn + 1,
        type: "item_equipped",
        data: {
          itemInstanceId: "gear#1",
          definitionId: "test-gear",
          slot: { kind: "weapon" },
          swappedItemInstanceId: null,
        },
      },
      {
        turn: state.run.turn + 1,
        type: "item_triggered",
        data: {
          itemInstanceId: "draught#1",
          definitionId: "test-draught",
          trigger: "quaff",
          targetIds: ["player"],
          cells: [],
          whiffed: false,
        },
      },
      {
        turn: state.run.turn + 1,
        type: "item_triggered",
        data: {
          itemInstanceId: "throwable#1",
          definitionId: "test-throwable",
          trigger: "throw_hit",
          targetIds: ["enemy#1"],
          cells: [{ x: 2, y: 1 }, { x: 3, y: 1 }],
          whiffed: false,
        },
      },
      {
        turn: state.run.turn + 1,
        type: "door_opened",
        data: {
          actorId: "player",
          at: { x: 2, y: 1 },
          direction: "east",
        },
      },
    ].map((event) => event as GameState["log"][number]),
  };
};

type RuntimeFixtureEvent = {
  readonly turn: number;
  readonly type: string;
  readonly data: Record<string, unknown>;
};
