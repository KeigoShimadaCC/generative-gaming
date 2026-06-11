import { describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import type { EnemyDefinition } from "../../schemas/entities/index.js";
import { validEnemyDefinitionFixture } from "../../schemas/fixtures/entities.js";
import {
  createFloorGeometrySlot,
  createTile,
  createTileGrid,
  Terrain,
  withTile,
} from "../map/index.js";
import {
  ACTIVE_TERMINAL_STATUS,
  depthBandForDepth,
  serialize,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type Position,
} from "../state/index.js";
import {
  TICK_HOOK_ORDER,
  getAvailableActions,
  isTerminal,
  registerActionResolver,
  render,
  start,
  step,
  type PlayerAction,
  type TickHookName,
  type TurnEvent,
} from "./loop.js";

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly resolver_probe: {
      readonly actionKind: PlayerAction["kind"];
      readonly label: string;
    };
  }
}

describe("turn loop public contract", () => {
  it("starts seeded runs by delegating to state initialization", () => {
    const state = start("turn-contract");

    expect(state.run.seed).toBe("turn-contract");
    expect(state.run.turn).toBe(0);
    expect(state.run.terminalStatus).toBe(ACTIVE_TERMINAL_STATUS);
  });

  it("exposes available actions through the stable loop API", () => {
    const actions = getAvailableActions(start("available-contract"));

    expect(actions).toEqual([{ kind: "wait" }, { kind: "abort" }]);
  });

  it("steps valid actions through player, actor, and tick phases", () => {
    const result = step(start("step-contract"), { kind: "wait" });

    expect(result.state.run.turn).toBe(1);
    expect(result.events.map((event) => event.type)).toEqual([
      "action_resolved",
      "tick_hook",
      "tick_hook",
      "tick_hook",
      "tick_hook",
    ]);
  });

  it("renders a minimal deterministic debug string", () => {
    expect(render(start("render-contract"))).toBe(
      "run=run#render-contract turn=0 depth=1 status=ACTIVE player=(0,0) hp=20/20",
    );
  });

  it("reports terminal state from explicit run status", () => {
    const active = start("terminal-contract");
    const won = {
      ...active,
      run: {
        ...active.run,
        terminalStatus: config.runStructure.terminalStates.win,
      },
    };

    expect(isTerminal(active)).toBe(false);
    expect(isTerminal(won)).toBe(true);
  });
});

describe("invalid and terminal action handling", () => {
  it("returns typed errors and zero state change for invalid actions", () => {
    const state = start("invalid-noop");
    const before = serialize(state);
    const result = step(state, { kind: "move", direction: "north" });

    expect(serialize(result.state)).toBe(before);
    expect(result.state.run.turn).toBe(0);
    expect(result.events).toEqual([
      {
        turn: 0,
        type: "action_illegal",
        data: {
          actionKind: "move",
          reason: "floor geometry is not loaded",
        },
      },
    ]);
  });

  it("leaves terminal states unchanged and returns an illegal-action event", () => {
    const terminal = {
      ...start("terminal-noop"),
      run: {
        ...start("terminal-noop").run,
        terminalStatus: config.runStructure.terminalStates.win,
      },
    };
    const before = serialize(terminal);
    const result = step(terminal, { kind: "wait" });

    expect(serialize(result.state)).toBe(before);
    expect(result.events).toEqual([
      {
        turn: 0,
        type: "action_illegal",
        data: {
          actionKind: "wait",
          reason: "run is terminal (WIN)",
        },
      },
    ]);
  });

  it("forces loss at the configured hard cap", () => {
    const state = {
      ...start("hard-cap"),
      run: {
        ...start("hard-cap").run,
        turn: bounds.runStructure.perRunHardCapTurns - 1,
      },
    };

    const result = step(state, { kind: "wait" });

    expect(result.state.run.turn).toBe(bounds.runStructure.perRunHardCapTurns);
    expect(result.state.run.terminalStatus).toBe(
      config.runStructure.terminalStates.loss,
    );
    expect(result.events.at(-1)).toEqual({
      turn: bounds.runStructure.perRunHardCapTurns,
      type: "terminal_state",
      data: {
        status: "LOSS",
        reason: `run hard cap reached at ${bounds.runStructure.perRunHardCapTurns} turns`,
      },
    });
  });

  it("makes win, loss, and aborted terminal states reachable", () => {
    const aborted = step(start("aborted-terminal"), { kind: "abort" }).state;
    const loss = step(withPlayerHp(start("loss-terminal"), 0), {
      kind: "wait",
    }).state;
    const win = step(finalFloorStairsState("win-terminal"), {
      kind: "descend",
    }).state;

    expect(aborted.run.terminalStatus).toBe(
      config.runStructure.terminalStates.abort,
    );
    expect(loss.run.terminalStatus).toBe(config.runStructure.terminalStates.loss);
    expect(win.run.terminalStatus).toBe(config.runStructure.terminalStates.win);
  });
});

describe("turn ordering hooks", () => {
  it("runs actor no-op hooks in stable actor-id order over 100 turns", () => {
    let state = withEntities(start("actor-order"), [
      enemy("enemy#3", { x: 3, y: 0 }),
      enemy("enemy#1", { x: 1, y: 0 }),
      enemy("enemy#2", { x: 2, y: 0 }),
    ]);
    const seen: EntityId[] = [];

    for (let index = 0; index < 100; index += 1) {
      const result = step(state, { kind: "wait" }, {
        hooks: {
          actorTurn: ({ actor, state: hookState }) => {
            seen.push(actor.id);
            return hookState;
          },
        },
      });
      state = result.state;
    }

    expect(seen).toHaveLength(300);
    for (let index = 0; index < seen.length; index += 3) {
      expect(seen.slice(index, index + 3)).toEqual([
        "enemy#1",
        "enemy#2",
        "enemy#3",
      ]);
    }
  });

  it("runs tick hooks in fixed GAME_DESIGN order", () => {
    const seen: TickHookName[] = [];
    const result = step(start("tick-order"), { kind: "wait" }, {
      hooks: {
        ticks: {
          damageOverTime: ({ hook, state }) => {
            seen.push(hook);
            return state;
          },
          durations: ({ hook, state }) => {
            seen.push(hook);
            return state;
          },
          hunger: ({ hook, state }) => {
            seen.push(hook);
            return state;
          },
          regen: ({ hook, state }) => {
            seen.push(hook);
            return state;
          },
        },
      },
    });

    expect(seen).toEqual(TICK_HOOK_ORDER);
    expect(result.events.filter(isTickHookEvent).map((event) => event.data.hook)).toEqual(
      TICK_HOOK_ORDER,
    );
  });
});

describe("action resolver registry", () => {
  it("dispatches registered resolvers and flows returned state/events into the step result", () => {
    const state = withGrid(
      start("resolver-dispatch"),
      createTileGrid({ width: 3, height: 3 }),
      { x: 1, y: 1 },
    );
    const resolverEvent: TurnEvent = {
      turn: 0,
      type: "resolver_probe",
      data: {
        actionKind: "move",
        label: "resolver returned event",
      },
    };
    let receivedState: GameState | null = null;
    let receivedAction: PlayerAction | null = null;
    let result: ReturnType<typeof step>;

    const unregister = registerActionResolver("move", (resolverState, action) => {
      receivedState = resolverState;
      receivedAction = action;

      return {
        state: {
          ...resolverState,
          player: {
            ...resolverState.player,
            position: { x: 2, y: 1 },
          },
        },
        events: [resolverEvent],
      };
    });

    try {
      result = step(state, { kind: "move", direction: "east" });
    } finally {
      unregister();
    }

    expect(receivedState).toBe(state);
    expect(receivedAction).toEqual({ kind: "move", direction: "east" });
    expect(result.state.player.position).toEqual({ x: 2, y: 1 });
    expect(result.events.slice(0, 2)).toEqual([
      {
        turn: 0,
        type: "action_resolved",
        data: {
          actionKind: "move",
        },
      },
      resolverEvent,
    ]);
    expect(result.state.log).toContainEqual(resolverEvent);
  });

  it("returns a typed illegal event and leaves serialized state unchanged for unregistered action types", () => {
    const state = withGrid(
      start("resolver-missing"),
      createTileGrid({ width: 3, height: 3 }),
      { x: 1, y: 1 },
    );
    const before = serialize(state);

    const result = step(state, { kind: "move", direction: "north" });

    expect(serialize(result.state)).toBe(before);
    expect(result.events).toEqual([
      {
        turn: 0,
        type: "action_illegal",
        data: {
          actionKind: "move",
          reason: "no handler registered",
        },
      },
    ]);
  });

  it("runs registered resolvers before actor turns and fixed-order ticks", () => {
    const seen: string[] = [];
    const state = withEntities(
      withGrid(
        start("resolver-order"),
        createTileGrid({ width: 3, height: 3 }),
        { x: 1, y: 1 },
      ),
      [enemy("enemy#1", { x: 0, y: 0 })],
    );

    const unregister = registerActionResolver("move", (resolverState) => {
      seen.push("resolver");

      return {
        state: resolverState,
        events: [],
      };
    });

    try {
      step(state, { kind: "move", direction: "east" }, {
        hooks: {
          actorTurn: ({ actor, state: hookState }) => {
            seen.push(`actor:${actor.id}`);
            return hookState;
          },
          ticks: {
            damageOverTime: ({ hook, state: hookState }) => {
              seen.push(`tick:${hook}`);
              return hookState;
            },
            durations: ({ hook, state: hookState }) => {
              seen.push(`tick:${hook}`);
              return hookState;
            },
            hunger: ({ hook, state: hookState }) => {
              seen.push(`tick:${hook}`);
              return hookState;
            },
            regen: ({ hook, state: hookState }) => {
              seen.push(`tick:${hook}`);
              return hookState;
            },
          },
        },
      });
    } finally {
      unregister();
    }

    expect(seen).toEqual([
      "resolver",
      "actor:enemy#1",
      "tick:damageOverTime",
      "tick:durations",
      "tick:hunger",
      "tick:regen",
    ]);
  });
});

const withGrid = (
  state: GameState,
  grid: Parameters<typeof createFloorGeometrySlot>[1],
  position: Position,
): GameState => ({
  ...state,
  floor: {
    ...state.floor,
    geometry: createFloorGeometrySlot(state.floor.geometry.refId, grid),
  },
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

const withEntities = (
  state: GameState,
  entities: readonly EnemyEntityInstance[],
): GameState => ({
  ...state,
  entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
});

const finalFloorStairsState = (seed: string): GameState => {
  const depth = config.runStructure.depthFloors;
  const band = depthBandForDepth(depth);
  const grid = withTile(
    createTileGrid({ width: 1, height: 1 }),
    { x: 0, y: 0 },
    createTile(Terrain.StairsDown),
  );
  const state = start(seed);

  return {
    ...state,
    run: {
      ...state.run,
      depth,
      band,
    },
    floor: {
      ...state.floor,
      floorId: `floor#${depth}`,
      depth,
      band,
      geometry: createFloorGeometrySlot(`floor-geometry#${depth}`, grid),
    },
    player: {
      ...state.player,
      position: { x: 0, y: 0 },
    },
  };
};

const enemy = (id: EntityId, position: Position): EnemyEntityInstance => ({
  id,
  kind: "enemy",
  definition: validEnemyDefinitionFixture as unknown as EnemyDefinition,
  position,
  currentHP: validEnemyDefinitionFixture.stats.hp,
  statuses: [],
  behaviorRuntime: {},
});

const isTickHookEvent = (
  event: TurnEvent,
): event is Extract<TurnEvent, { readonly type: "tick_hook" }> =>
  event.type === "tick_hook";
