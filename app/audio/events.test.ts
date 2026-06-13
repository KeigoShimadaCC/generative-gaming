import { describe, expect, it } from "vitest";

import {
  createMidActionGridFixtureState,
  withMovedPlayer,
} from "@/components/grid/fixtures";
import type { GameState } from "@engine/state";

import { deriveGameAudioEvents } from "./events";

describe("deriveGameAudioEvents", () => {
  it("maps player movement to move sfx", () => {
    const previous = createMidActionGridFixtureState();
    const next = withMovedPlayer(previous, { x: 2, y: 1 }, previous.run.turn + 1);
    const events = deriveGameAudioEvents(previous, next);

    expect(events).toContainEqual({
      kind: "move",
      id: "move:player:1:1->2:1",
    });
  });

  it("maps combat logs to attack and hit sfx", () => {
    const previous = createMidActionGridFixtureState();
    const next = withEnemyDamage(previous, 3, [
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
          damage: 3,
        },
      },
    ]);

    expect(deriveGameAudioEvents(previous, next)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "attack" }),
        expect.objectContaining({ kind: "hit" }),
      ]),
    );
  });

  it("maps pickup logs and removed floor items to pickup sfx", () => {
    const previous = createMidActionGridFixtureState();
    const entities = Object.fromEntries(
      Object.entries(previous.entities).filter(([id]) => id !== "item#1"),
    ) as GameState["entities"];
    const next: GameState = {
      ...previous,
      run: { ...previous.run, turn: previous.run.turn + 1 },
      entities,
      log: [
        ...previous.log,
        {
          turn: previous.run.turn + 1,
          type: "item_picked_up",
          data: {
            itemInstanceId: "item#1",
            entityId: "item#1",
            definitionId: "grid-fixture-draught",
            quantity: 1,
            stacked: false,
          },
        } as GameState["log"][number],
      ],
    };

    const events = deriveGameAudioEvents(previous, next);
    expect(events.filter((event) => event.kind === "pickup").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("maps depth increases to descend sfx", () => {
    const previous = createMidActionGridFixtureState();
    const next: GameState = {
      ...previous,
      run: {
        ...previous.run,
        depth: previous.run.depth + 1,
        turn: previous.run.turn + 1,
      },
      floor: {
        ...previous.floor,
        depth: previous.floor.depth + 1,
      },
    };

    expect(deriveGameAudioEvents(previous, next)).toContainEqual({
      kind: "descend",
      id: `descend:${previous.run.depth}->${next.run.depth}`,
    });
  });

  it("maps terminal transitions to win and lose sfx", () => {
    const previous = createMidActionGridFixtureState();
    const win: GameState = {
      ...previous,
      run: {
        ...previous.run,
        terminalStatus: "WIN",
        turn: previous.run.turn + 1,
      },
    };
    const loss: GameState = {
      ...previous,
      run: {
        ...previous.run,
        terminalStatus: "LOSS",
        turn: previous.run.turn + 1,
      },
    };

    expect(deriveGameAudioEvents(previous, win)).toContainEqual(
      expect.objectContaining({ kind: "win" }),
    );
    expect(deriveGameAudioEvents(previous, loss)).toContainEqual(
      expect.objectContaining({ kind: "lose" }),
    );
  });

  it("returns no events when states cannot be diffed", () => {
    const previous = createMidActionGridFixtureState();
    const unrelated = {
      ...previous,
      run: { ...previous.run, runId: "other-run" },
    };

    expect(deriveGameAudioEvents(previous, unrelated)).toEqual([]);
    expect(deriveGameAudioEvents(null, previous)).toEqual([]);
  });
});

type RuntimeFixtureEvent = {
  readonly turn: number;
  readonly type: string;
  readonly data: Record<string, unknown>;
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

  return {
    ...state,
    run: {
      ...state.run,
      turn: state.run.turn + 1,
    },
    entities: {
      ...state.entities,
      "enemy#1": {
        ...enemy,
        currentHP: enemyHp,
      },
    },
    log: [
      ...state.log,
      ...events.map((event) => event as GameState["log"][number]),
    ],
  };
};
