import { describe, expect, it } from "vitest";

import { config } from "../../config/index.js";
import type {
  DepthBand,
  EnemyDefinition
} from "../../schemas/entities/index.js";
import { EnemyDefinitionSchema } from "../../schemas/entities/index.js";
import { validEnemyDefinitionFixture } from "../../schemas/fixtures/entities.js";
import { floorParamsForBand, type LayoutFlavor } from "../floorgen/index.js";
import {
  depthBandForDepth,
  deserialize,
  serialize,
  type EntityId,
  type GameState,
  type Position
} from "../state/index.js";
import { summarizeRun, summarizeRunEvents } from "./endings.js";
import type { RunEvent } from "./events.js";
import {
  currentFloorRuntime,
  startRun,
  stepRun,
  type FloorContent,
  type FloorContentProvider
} from "./loop.js";

describe("run loop floor progression and Hoard ending", () => {
  it("scripts a full descent to floor 12 and wins by taking one thing from the Hoard", () => {
    let state = expectStartedRun("full-descent", minimalProvider());

    for (let depth = 1; depth < config.runStructure.depthFloors; depth += 1) {
      state = withPlayerPosition(state, requiredRuntime(state).stairsDown);
      const descended = stepRun(state, { kind: "descend" }, minimalProvider());
      expect(descended.ok).toBe(true);
      if (!descended.ok) {
        throw new Error(descended.error.message);
      }
      state = descended.state;
      expect(state.run.depth).toBe(depth + 1);
      expect(state.player.position).toEqual(requiredRuntime(state).entrance);
    }

    const hoard = requiredRuntime(state).hoard;
    expect(hoard).not.toBeNull();
    state = withPlayerPosition(state, hoard?.position ?? { x: -1, y: -1 });

    const won = stepRun(state, { kind: "take_hoard" }, minimalProvider());
    expect(won.ok).toBe(true);
    if (!won.ok) {
      throw new Error(won.error.message);
    }

    expect(won.state.run.terminalStatus).toBe(
      config.runStructure.terminalStates.win
    );
    expect(won.events.map((event) => event.type)).toContain("hoard_taken");
    expect(summarizeRun(won.state)).toMatchObject({
      terminalStatus: config.runStructure.terminalStates.win,
      depth: 12
    });
  });

  it("returns a typed provider error for malformed floor content", () => {
    const malformedProvider = {
      getFloor: () =>
        ({
          params: null,
          roster: [],
          items: [],
          traps: [],
          npcs: []
        }) as unknown as FloorContent
    } satisfies FloorContentProvider;

    const result = startRun("malformed-provider", malformedProvider);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      kind: "run-loop-error",
      code: "provider_result_malformed",
      depth: 1
    });
  });

  it("keeps generated run floors and run events serializable", () => {
    const state = expectStartedRun(
      "run-serialization",
      shallowProvider([enemy("serial-rat")])
    );
    const roundTrip = deserialize(serialize(state));

    expect(roundTrip.run.depth).toBe(1);
    expect(summarizeRun(roundTrip).discoveries).toContainEqual({
      kind: "floor",
      id: "floor#1",
      depth: 1,
      turn: 0
    });
  });

  it("runs gameplay enemy behavior by default with an explicit hook-free escape hatch", () => {
    const provider = shallowProvider([enemy("default-hooks-rat")]);
    const state = expectStartedRun("default-hooks-enemy", provider);
    const actorId = firstEnemyId(state);
    const adjacentState = withEntityPosition(state, actorId, {
      x: state.player.position.x + 1,
      y: state.player.position.y
    });
    const hpBefore = adjacentState.player.hp.current;

    const defaultStep = stepRun(adjacentState, { kind: "wait" }, provider);
    expect(defaultStep.ok).toBe(true);
    if (!defaultStep.ok) {
      throw new Error(defaultStep.error.message);
    }

    expect(eventsOfType(defaultStep.events, "attack_hit")).toHaveLength(1);
    expect(defaultStep.state.player.hp.current).toBeLessThan(hpBefore);

    const hookFreeStep = stepRun(adjacentState, { kind: "wait" }, provider, {
      hooks: "none"
    });
    expect(hookFreeStep.ok).toBe(true);
    if (!hookFreeStep.ok) {
      throw new Error(hookFreeStep.error.message);
    }

    expect(eventsOfType(hookFreeStep.events, "attack_hit")).toHaveLength(0);
    expect(hookFreeStep.state.player.hp.current).toBe(hpBefore);
  });
});

describe("run loop soft-cap reinforcements", () => {
  it("spawns boredom reinforcements on the configured schedule within budget", () => {
    const provider = shallowProvider([enemy("soft-rat")]);
    let state = expectStartedRun("soft-cap-schedule", provider);

    state = withFloorClock(
      state,
      config.runStructure.perFloorSoftCapTurns +
        config.runStructure.reinforcementIntervalTurns -
        2
    );
    const tooEarly = stepRun(state, { kind: "wait" }, provider);
    expect(tooEarly.ok).toBe(true);
    if (!tooEarly.ok) {
      throw new Error(tooEarly.error.message);
    }
    expect(
      eventsOfType(tooEarly.events, "run_reinforcement_spawned")
    ).toHaveLength(0);

    const onSchedule = stepRun(tooEarly.state, { kind: "wait" }, provider);
    expect(onSchedule.ok).toBe(true);
    if (!onSchedule.ok) {
      throw new Error(onSchedule.error.message);
    }

    const spawned = onlyEvent(onSchedule.events, "run_reinforcement_spawned");
    const runtime = requiredRuntime(onSchedule.state);
    expect(spawned.data.wave).toBe(1);
    expect(spawned.turn - runtime.enteredTurn).toBe(
      config.runStructure.perFloorSoftCapTurns +
        config.runStructure.reinforcementIntervalTurns
    );
    expect(
      runtime.initialSpawnBudgetSpent + runtime.reinforcementSpawnBudgetSpent
    ).toBeLessThanOrEqual(config.enemyDesign.spawnBudgetPoints.shallows);
    expect(
      Object.values(onSchedule.state.entities).filter(
        (entity) => entity.kind === "enemy"
      )
    ).toHaveLength(2);
  });

  it("emits boredom but stops spawning when the remaining budget is exhausted", () => {
    const provider = shallowProvider([enemy("budget-rat")]);
    let state = expectStartedRun("soft-cap-budget", provider);
    const runtime = requiredRuntime(state);
    const budget = config.enemyDesign.spawnBudgetPoints.shallows;

    state = withRuntimePatch(
      withFloorClock(
        state,
        config.runStructure.perFloorSoftCapTurns +
          config.runStructure.reinforcementIntervalTurns -
          1
      ),
      {
        reinforcementSpawnBudgetSpent: budget - runtime.initialSpawnBudgetSpent
      }
    );

    const result = stepRun(state, { kind: "wait" }, provider);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(
      eventsOfType(result.events, "run_reinforcement_spawned")
    ).toHaveLength(0);
    expect(onlyEvent(result.events, "run_boredom").data.reason).toBe(
      "budget_exhausted"
    );
    expect(
      Object.values(result.state.entities).filter(
        (entity) => entity.kind === "enemy"
      )
    ).toHaveLength(1);
  });
});

describe("run loop terminal states and summaries", () => {
  it("makes WIN, LOSS, and ABORTED reachable through run actions", () => {
    const provider = minimalProvider();

    const aborted = stepRun(
      expectStartedRun("ending-abort", provider),
      { kind: "abort" },
      provider
    );
    expect(aborted.ok && aborted.state.run.terminalStatus).toBe(
      config.runStructure.terminalStates.abort
    );

    const loss = stepRun(
      withPlayerHp(expectStartedRun("ending-loss", provider), 0),
      { kind: "wait" },
      provider
    );
    expect(loss.ok && loss.state.run.terminalStatus).toBe(
      config.runStructure.terminalStates.loss
    );

    const won = winResult("ending-win", provider);
    expect(won.run.terminalStatus).toBe(config.runStructure.terminalStates.win);
  });

  it("derives run summary from a known event sequence", () => {
    const summary = summarizeRunEvents([
      {
        turn: 0,
        type: "state_created",
        data: {
          runId: "run#summary",
          seed: "summary",
          depth: 1,
          band: "shallows"
        }
      } as RunEvent,
      {
        turn: 0,
        type: "run_floor_entered",
        data: {
          floorId: "floor#1",
          depth: 1,
          band: "shallows",
          seed: "summary-floor-1",
          rosterCost: 2,
          spawnBudget: 20,
          placementDeviationCount: 0,
          hoardFeatureId: null
        }
      },
      {
        turn: 3,
        type: "entity_died",
        data: {
          entityId: "enemy#1",
          kind: "enemy",
          position: { x: 1, y: 1 },
          xpYield: 2
        }
      } as RunEvent,
      {
        turn: 4,
        type: "quest_offered",
        data: {
          questId: "quest-a",
          npcId: "npc#1"
        }
      } as RunEvent,
      {
        turn: 5,
        type: "quest_accepted",
        data: {
          questId: "quest-a",
          npcId: "npc#1"
        }
      } as RunEvent,
      {
        turn: 9,
        type: "quest_completed",
        data: {
          questId: "quest-a",
          rewardCoin: 5
        }
      } as RunEvent,
      {
        turn: 12,
        type: "hoard_taken",
        data: {
          featureId: "hoard",
          name: "The Hoard",
          depth: 12,
          position: { x: 2, y: 2 }
        }
      },
      {
        turn: 12,
        type: "terminal_state",
        data: {
          status: "WIN",
          reason: "done"
        }
      } as RunEvent
    ]);

    expect(summary).toEqual({
      terminalStatus: "WIN",
      depth: 12,
      turns: 12,
      kills: 1,
      discoveries: [
        {
          kind: "floor",
          id: "floor#1",
          depth: 1,
          turn: 0
        },
        {
          kind: "hoard",
          id: "hoard",
          depth: 12,
          turn: 12
        }
      ],
      quests: {
        offered: ["quest-a"],
        accepted: ["quest-a"],
        refused: [],
        completed: ["quest-a"],
        failed: [],
        rewardsPaid: []
      }
    });
  });
});

const minimalProvider = (): FloorContentProvider => ({
  getFloor: (depth, seed) => {
    const band = depthBandForDepth(depth);
    return {
      params: {
        ...floorParamsForBand(band, flavorForBand(band), seed),
        ...(depth === config.runStructure.depthFloors
          ? {
              hoard: {
                id: "hoard",
                name: "The Hoard",
                hint: { distance: "far_from_entrance" }
              }
            }
          : {})
      },
      roster: [],
      items: [],
      traps: [],
      npcs: []
    };
  }
});

const shallowProvider = (
  roster: readonly EnemyDefinition[]
): FloorContentProvider => ({
  getFloor: (_depth, seed) => ({
    params: floorParamsForBand("shallows", "open", seed),
    roster,
    items: [],
    traps: [],
    npcs: []
  })
});

const expectStartedRun = (
  seed: string,
  provider: FloorContentProvider
): GameState => {
  const started = startRun(seed, provider);
  expect(started.ok).toBe(true);
  if (!started.ok) {
    throw new Error(started.error.message);
  }
  return started.state;
};

const winResult = (seed: string, provider: FloorContentProvider): GameState => {
  let state = expectStartedRun(seed, provider);

  for (let depth = 1; depth < config.runStructure.depthFloors; depth += 1) {
    const result = stepRun(
      withPlayerPosition(state, requiredRuntime(state).stairsDown),
      { kind: "descend" },
      provider
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    state = result.state;
  }

  const hoard = requiredRuntime(state).hoard;
  const won = stepRun(
    withPlayerPosition(state, hoard?.position ?? { x: -1, y: -1 }),
    { kind: "take_hoard" },
    provider
  );
  expect(won.ok).toBe(true);
  if (!won.ok) {
    throw new Error(won.error.message);
  }

  return won.state;
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
  position: Position
): GameState => ({
  ...state,
  player: {
    ...state.player,
    position
  }
});

const withEntityPosition = (
  state: GameState,
  entityId: EntityId,
  position: Position
): GameState => {
  const entity = state.entities[entityId];
  if (entity === undefined) {
    throw new Error(`missing entity ${entityId}`);
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [entityId]: {
        ...entity,
        position
      }
    }
  };
};

const withPlayerHp = (state: GameState, hp: number): GameState => ({
  ...state,
  player: {
    ...state.player,
    hp: {
      ...state.player.hp,
      current: hp
    }
  }
});

const withFloorClock = (state: GameState, turn: number): GameState => ({
  ...state,
  run: {
    ...state.run,
    turn
  }
});

const withRuntimePatch = (
  state: GameState,
  patch: Partial<ReturnType<typeof requiredRuntime>>
): GameState => {
  const opaque = state.floor.geometry.opaque as {
    readonly knowledge?: {
      readonly run?: ReturnType<typeof requiredRuntime>;
      readonly decorativeFeatures?: readonly Record<string, unknown>[];
    };
  };
  const runtime = requiredRuntime(state);

  return {
    ...state,
    floor: {
      ...state.floor,
      geometry: {
        ...state.floor.geometry,
        opaque: {
          ...opaque,
          knowledge: {
            ...(opaque.knowledge ?? {}),
            run: {
              ...runtime,
              ...patch
            }
          }
        } as unknown as GameState["floor"]["geometry"]["opaque"]
      }
    }
  };
};

const enemy = (id: string): EnemyDefinition =>
  EnemyDefinitionSchema.parse({
    ...validEnemyDefinitionFixture,
    id
  });

const firstEnemyId = (state: GameState): EntityId => {
  const entity = Object.values(state.entities).find(
    (candidate) => candidate.kind === "enemy"
  );
  if (entity === undefined) {
    throw new Error("expected an enemy");
  }

  return entity.id;
};

const flavorForBand = (band: DepthBand): LayoutFlavor => {
  switch (band) {
    case "shallows":
      return "open";
    case "middle":
      return "halls";
    case "lowest":
      return "sanctum";
  }
};

const eventsOfType = <Type extends RunEvent["type"]>(
  events: readonly RunEvent[],
  type: Type
): readonly Extract<RunEvent, { readonly type: Type }>[] =>
  events.filter(
    (event): event is Extract<RunEvent, { readonly type: Type }> =>
      event.type === type
  );

const onlyEvent = <Type extends RunEvent["type"]>(
  events: readonly RunEvent[],
  type: Type
): Extract<RunEvent, { readonly type: Type }> => {
  const matches = eventsOfType(events, type);
  expect(matches).toHaveLength(1);
  const event = matches[0];
  if (event === undefined) {
    throw new Error(`missing event ${type}`);
  }
  return event;
};
