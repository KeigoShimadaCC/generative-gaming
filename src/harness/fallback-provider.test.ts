import { describe, expect, it } from "vitest";

import { config } from "../config/index.js";
import {
  currentFloorRuntime,
  startRun,
  stepRun,
  type FloorContentProvider,
} from "../engine/run/loop.js";
import type { GameState, Position } from "../engine/state/index.js";
import {
  FallbackFloorContentProvider,
  FallbackProviderError,
} from "./fallback-provider.js";

describe("FallbackFloorContentProvider", () => {
  it("scripts a bot-free full run through all 12 real fallback floors to a Hoard WIN", () => {
    const provider = new FallbackFloorContentProvider();
    const visitedDepths: number[] = [];
    let state = expectStartedRun("old-stock-full-run", provider);

    assertAssembledFallbackFloor(state, provider);
    visitedDepths.push(state.run.depth);

    for (let depth = 1; depth < config.runStructure.depthFloors; depth += 1) {
      const runtime = requiredRuntime(state);
      const result = stepRun(
        withPlayerPosition(state, runtime.stairsDown),
        { kind: "descend" },
        provider,
      );

      expect(result.ok, result.ok ? "" : result.error.message).toBe(true);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      state = result.state;
      expect(state.run.depth).toBe(depth + 1);
      assertAssembledFallbackFloor(state, provider);
      visitedDepths.push(state.run.depth);
    }

    const hoard = requiredRuntime(state).hoard;
    expect(hoard).not.toBeNull();

    const won = stepRun(
      withPlayerPosition(state, hoard?.position ?? { x: -1, y: -1 }),
      { kind: "take_hoard" },
      provider,
    );

    expect(won.ok, won.ok ? "" : won.error.message).toBe(true);
    if (!won.ok) {
      throw new Error(won.error.message);
    }

    expect(visitedDepths).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(won.state.run.terminalStatus).toBe(
      config.runStructure.terminalStates.win,
    );
    expect(won.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["hoard_taken", "terminal_state"]),
    );
  });

  it("reaches LOSS on real fallback content", () => {
    const provider = new FallbackFloorContentProvider();
    const result = stepRun(
      withPlayerHp(expectStartedRun("old-stock-loss", provider), 0),
      { kind: "wait" },
      provider,
    );

    expect(result.ok, result.ok ? "" : result.error.message).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.state.run.terminalStatus).toBe(
      config.runStructure.terminalStates.loss,
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: "terminal_state",
        data: expect.objectContaining({
          status: config.runStructure.terminalStates.loss,
        }),
      }),
    );
  });

  it("surfaces construction validation as a typed provider error", () => {
    try {
      new FallbackFloorContentProvider({
        root: new URL("../../content/missing-fallback/", import.meta.url),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(FallbackProviderError);
      expect(error).toMatchObject({
        kind: "fallback-provider-error",
        code: "fallback_content_invalid",
        depth: null,
      });
      return;
    }

    throw new Error("expected provider construction to fail");
  });
});

const expectStartedRun = (
  seed: string,
  provider: FloorContentProvider,
): GameState => {
  const started = startRun(seed, provider);
  expect(started.ok, started.ok ? "" : started.error.message).toBe(true);
  if (!started.ok) {
    throw new Error(started.error.message);
  }
  return started.state;
};

const assertAssembledFallbackFloor = (
  state: GameState,
  provider: FloorContentProvider,
): void => {
  const runtime = requiredRuntime(state);
  const floor = provider.getFloor(state.run.depth, runtime.seed);
  const entities = Object.values(state.entities);

  expect(runtime.depth).toBe(state.run.depth);
  expect(state.floor.depth).toBe(state.run.depth);
  expect(entities.filter((entity) => entity.kind === "enemy")).toHaveLength(
    floor.roster.length,
  );
  expect(entities.filter((entity) => entity.kind === "item")).toHaveLength(
    floor.items.length,
  );
  expect(entities.filter((entity) => entity.kind === "trap")).toHaveLength(
    floor.traps.length,
  );
  expect(entities.filter((entity) => entity.kind === "npc")).toHaveLength(
    floor.npcs.length,
  );

  if (floor.quest !== undefined) {
    expect(state.quests.quests[floor.quest.id]?.definition.id).toBe(
      floor.quest.id,
    );
  }
};

const requiredRuntime = (state: GameState) => {
  const runtime = currentFloorRuntime(state);
  expect(runtime).not.toBeNull();
  if (runtime === null) {
    throw new Error("missing run floor runtime");
  }
  return runtime;
};

const withPlayerPosition = (
  state: GameState,
  position: Position,
): GameState => ({
  ...state,
  player: {
    ...state.player,
    position,
  },
});

const withPlayerHp = (state: GameState, hp: number): GameState => ({
  ...state,
  player: {
    ...state.player,
    hp: {
      ...state.player.hp,
      current: hp,
    },
  },
});
