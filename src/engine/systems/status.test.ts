import { afterAll, describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import type { StatusId } from "../../schemas/vocab/index.js";
import {
  validCoinItemFixture,
  validEnemyDefinitionFixture,
} from "../../schemas/fixtures/entities.js";
import { createRng } from "../rng/index.js";
import type { EnemyDefinition, ItemDefinition } from "../../schemas/entities/index.js";
import {
  createInitialState,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type GroundItemEntityInstance,
  type Position,
} from "../state/index.js";
import {
  TICK_HOOK_ORDER,
  step,
  type MoveDirection,
  type TurnEvent,
} from "../turn/index.js";
import {
  applyStatus,
  blindFovRadius,
  confusionRedirect,
  hasteExtraAction,
  isStunned,
  slowActsThisTurn,
  statusTickHooks,
  unregisterStatusTickHooks,
} from "./status.js";
import { registerLootDropHook } from "./combat.js";

afterAll(() => {
  unregisterStatusTickHooks();
});

type StatusSpecRow = {
  readonly status: StatusId;
  readonly duration: number;
  readonly entityId?: EntityId | "player";
  readonly setup?: (state: GameState) => GameState;
  readonly assert: (context: {
    readonly state: GameState;
    readonly afterApply: GameState;
    readonly afterDot: GameState;
    readonly afterDurations: GameState;
    readonly applyEvents: readonly TurnEvent[];
    readonly dotEvents: readonly TurnEvent[];
    readonly durationEvents: readonly TurnEvent[];
  }) => void;
};

const statusTable: readonly StatusSpecRow[] = [
  {
    status: "poison",
    duration: bounds.statusVocabulary.durationTurns.poison.min,
    setup: (state) => withPlayerHp(state, 5),
    assert: ({ afterDot }) => {
      expect(afterDot.player.hp.current).toBe(4);
    },
  },
  {
    status: "burn",
    duration: bounds.statusVocabulary.durationTurns.burn.min,
    entityId: "enemy#1",
    setup: (state) => withEnemy(state, "enemy#1", 2),
    assert: ({ afterDot }) => {
      expect(afterDot.entities["enemy#1"]).toBeUndefined();
    },
  },
  {
    status: "regen",
    duration: bounds.statusVocabulary.durationTurns.regen.min,
    setup: (state) => withPlayerHp(state, 10),
    assert: ({ afterDot }) => {
      expect(afterDot.player.hp.current).toBe(12);
    },
  },
  {
    status: "stun",
    duration: bounds.statusVocabulary.durationTurns.stun.min,
    assert: ({ afterApply }) => {
      expect(isStunned(afterApply.player.statuses)).toBe(true);
    },
  },
  {
    status: "confusion",
    duration: bounds.statusVocabulary.durationTurns.confusion.min,
    assert: () => {
      const rng = createRng("confusion-table");
      const redirected = confusionRedirect(rng, "north");
      expect(MOVE_DIRECTIONS).toContain(redirected);
    },
  },
  {
    status: "slow",
    duration: bounds.statusVocabulary.durationTurns.slow.min,
    assert: () => {
      expect(slowActsThisTurn(0)).toBe(true);
      expect(slowActsThisTurn(1)).toBe(false);
      expect(slowActsThisTurn(2)).toBe(true);
    },
  },
  {
    status: "haste",
    duration: bounds.statusVocabulary.durationTurns.haste.min,
    assert: () => {
      expect(hasteExtraAction(1)).toBe(true);
      expect(hasteExtraAction(0)).toBe(false);
      expect(hasteExtraAction(3)).toBe(true);
    },
  },
  {
    status: "blind",
    duration: bounds.statusVocabulary.durationTurns.blind.min,
    assert: ({ afterApply }) => {
      expect(blindFovRadius(afterApply.player.statuses)).toBe(1);
    },
  },
  {
    status: "shield",
    duration: bounds.statusVocabulary.durationTurns.shield.min,
    assert: ({ afterApply, afterDot }) => {
      expect(afterApply.player.statuses).toEqual([
        { status: "shield", duration: afterApply.player.statuses[0]?.duration },
      ]);
      expect(afterDot.player.hp.current).toBe(afterApply.player.hp.current);
    },
  },
  {
    status: "weaken",
    duration: bounds.statusVocabulary.durationTurns.weaken.min,
    assert: ({ afterApply, afterDot }) => {
      expect(afterApply.player.statuses[0]?.status).toBe("weaken");
      expect(afterDot.player.hp.current).toBe(afterApply.player.hp.current);
    },
  },
];

const MOVE_DIRECTIONS: readonly MoveDirection[] = [
  "northwest",
  "north",
  "northeast",
  "west",
  "east",
  "southwest",
  "south",
  "southeast",
];

describe("GAME_DESIGN §6 status table", () => {
  it.each(statusTable.map((row) => [row.status, row] as const))(
    "implements %s per spec row",
    (_status, row) => {
      let state = createInitialState(`status-row-${row.status}`);
      if (row.setup !== undefined) {
        state = row.setup(state);
      }

      const applied = applyStatus(
        state,
        row.entityId ?? "player",
        row.status,
        row.duration,
      );
      const afterDot = statusTickHooks.damageOverTime({
        state: applied.state,
        hook: "damageOverTime",
        action: { kind: "wait" },
      });
      const afterDurations = statusTickHooks.durations({
        state: normalizeHookState(afterDot),
        hook: "durations",
        action: { kind: "wait" },
      });

      row.assert({
        state,
        afterApply: applied.state,
        afterDot: normalizeHookState(afterDot),
        afterDurations: normalizeHookState(afterDurations),
        applyEvents: applied.events,
        dotEvents: hookEvents(afterDot),
        durationEvents: hookEvents(afterDurations),
      });
    },
  );
});

describe("applyStatus stacking and cap rules", () => {
  it("refreshes duration instead of stacking magnitude", () => {
    const state = createInitialState("status-refresh");
    const first = applyStatus(state, "player", "poison", 3);
    const second = applyStatus(first.state, "player", "poison", 8);

    expect(second.state.player.statuses).toEqual([{ status: "poison", duration: 8 }]);
    expect(first.events.map((event) => event.type)).toEqual(["status_applied"]);
    expect(second.events.map((event) => event.type)).toEqual(["status_refreshed"]);
  });

  it("cancels haste and slow when applying the opposite", () => {
    const state = createInitialState("status-cancel");
    const slowed = applyStatus(state, "player", "slow", 5);
    const hastened = applyStatus(slowed.state, "player", "haste", 6);

    expect(hastened.state.player.statuses).toEqual([{ status: "haste", duration: 6 }]);

    const slowedAgain = applyStatus(hastened.state, "player", "slow", 4);
    expect(slowedAgain.state.player.statuses).toEqual([{ status: "slow", duration: 4 }]);
  });

  it("drops the oldest status when a fifth concurrent status is applied", () => {
    let state = createInitialState("status-cap");
    const statuses: StatusId[] = ["poison", "burn", "regen", "stun"];

    for (const status of statuses) {
      state = applyStatus(
        state,
        "player",
        status,
        bounds.statusVocabulary.durationTurns[status].min,
      ).state;
    }

    const capped = applyStatus(
      state,
      "player",
      "blind",
      bounds.statusVocabulary.durationTurns.blind.min,
    );

    expect(capped.state.player.statuses.map((entry) => entry.status)).toEqual([
      "burn",
      "regen",
      "stun",
      "blind",
    ]);
    expect(capped.events).toContainEqual({
      turn: 0,
      type: "status_dropped_oldest",
      data: {
        entityId: "player",
        status: "poison",
      },
    });
  });

  it("rejects out-of-bounds durations", () => {
    const state = createInitialState("status-bounds");
    const result = applyStatus(state, "player", "poison", 1);

    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });
});

describe("damage-over-time fairness rules", () => {
  it("never lets poison reduce HP below 1", () => {
    let state = withPlayerHp(createInitialState("poison-floor"), 1);
    state = applyStatus(
      state,
      "player",
      "poison",
      bounds.statusVocabulary.durationTurns.poison.max,
    ).state;

    for (let index = 0; index < 5; index += 1) {
      const ticked = statusTickHooks.damageOverTime({
        state,
        hook: "damageOverTime",
        action: { kind: "wait" },
      });
      state = normalizeHookState(ticked);
      expect(state.player.hp.current).toBe(1);
    }
  });

  it("lets burn kill an enemy and emits entity_died", () => {
    let state = withEnemy(createInitialState("burn-kill"), "enemy#1", 2);
    state = applyStatus(
      state,
      "enemy#1",
      "burn",
      bounds.statusVocabulary.durationTurns.burn.min,
    ).state;

    const ticked = statusTickHooks.damageOverTime({
      state,
      hook: "damageOverTime",
      action: { kind: "wait" },
    });
    const tickEvents = hookEvents(ticked);

    expect(tickEvents).toContainEqual({
      turn: 0,
      type: "entity_died",
      data: {
        entityId: "enemy#1",
        kind: "enemy",
        position: { x: 1, y: 0 },
        xpYield: validEnemyDefinitionFixture.stats.xpYield,
      },
    });
    expect(normalizeHookState(ticked).entities["enemy#1"]).toBeUndefined();
  });

  it("lets burn kill an enemy through the loot hook without granting XP", () => {
    let lootHookCalls = 0;
    const unregisterLoot = registerLootDropHook(
      ({ state: hookState, victim, attribution, killerId }) => {
        lootHookCalls += 1;
        expect(victim.id).toBe("enemy#1");
        expect(attribution).toEqual({ kind: "none" });
        expect(killerId).toBeNull();

        return {
          state: {
            ...hookState,
            entities: {
              ...hookState.entities,
              "item#1": groundItem("item#1", victim.position),
            },
          },
        };
      },
    );

    try {
      let state = withEnemy(createInitialState("burn-loot-no-xp"), "enemy#1", 2);
      state = applyStatus(
        state,
        "enemy#1",
        "burn",
        bounds.statusVocabulary.durationTurns.burn.min,
      ).state;

      const ticked = statusTickHooks.damageOverTime({
        state,
        hook: "damageOverTime",
        action: { kind: "wait" },
      });
      const nextState = normalizeHookState(ticked);

      expect(lootHookCalls).toBe(1);
      expect(nextState.entities["enemy#1"]).toBeUndefined();
      expect(nextState.entities["item#1"]?.kind).toBe("item");
      expect(nextState.player.xp).toBe(0);
      expect(hookEvents(ticked).some((event) => event.type === "xp_gained")).toBe(
        false,
      );
    } finally {
      unregisterLoot();
    }
  });

  it("lets burn kill the player by setting HP to 0", () => {
    let state = withPlayerHp(createInitialState("burn-player-kill"), 2);
    state = applyStatus(
      state,
      "player",
      "burn",
      bounds.statusVocabulary.durationTurns.burn.min,
    ).state;

    const ticked = statusTickHooks.damageOverTime({
      state,
      hook: "damageOverTime",
      action: { kind: "wait" },
    });
    const tickEvents = hookEvents(ticked);

    expect(tickEvents).toContainEqual({
      turn: 0,
      type: "entity_died",
      data: {
        entityId: "player",
        kind: "player",
        position: { x: 0, y: 0 },
        xpYield: 0,
      },
    });
    expect(normalizeHookState(ticked).player.hp.current).toBe(0);
    expect(normalizeHookState(ticked).run.terminalStatus).toBe(
      config.runStructure.terminalStates.loss,
    );
  });
});

describe("turn-loop registration", () => {
  it("self-registers DoT and duration hooks with step", () => {
    let state = withPlayerHp(createInitialState("status-self-register"), 10);
    state = applyStatus(
      state,
      "player",
      "poison",
      bounds.statusVocabulary.durationTurns.poison.min,
    ).state;

    const result = step(state, { kind: "wait" });

    expect(result.state.player.hp.current).toBe(9);
    expect(result.state.player.statuses).toEqual([
      {
        status: "poison",
        duration: bounds.statusVocabulary.durationTurns.poison.min - 1,
      },
    ]);
    expect(result.events.map((event) => event.type)).toContain("status_tick");
  });
});

describe("duration expiry", () => {
  it("decrements durations and emits status_expired when reaching zero", () => {
    let state = applyStatus(createInitialState("status-expiry"), "player", "stun", 1).state;
    const ticked = statusTickHooks.durations({
      state,
      hook: "durations",
      action: { kind: "wait" },
    });

    expect(normalizeHookState(ticked).player.statuses).toEqual([]);
    expect(hookEvents(ticked)).toContainEqual({
      turn: 0,
      type: "status_expired",
      data: {
        entityId: "player",
        status: "stun",
      },
    });
  });
});

describe("action-gating queries", () => {
  it("redirects confusion through the status rng substream deterministically", () => {
    const rng = createRng("status-confusion");
    const first = confusionRedirect(rng, "east");
    const second = confusionRedirect(createRng("status-confusion"), "east");

    expect(first).toBe(second);
    expect(MOVE_DIRECTIONS).toContain(first);
  });

  it("returns null FOV radius override when blind is absent", () => {
    expect(blindFovRadius([])).toBeNull();
  });
});

describe("tick order", () => {
  it("runs DoT before duration decrements via the turn hook recording pattern", () => {
    const seen: string[] = [];
    const state = applyStatus(
      withPlayerHp(createInitialState("status-tick-order"), 10),
      "player",
      "poison",
      bounds.statusVocabulary.durationTurns.poison.min,
    ).state;

    step(state, { kind: "wait" }, {
      hooks: {
        ticks: {
          damageOverTime: ({ hook, state: hookState }) => {
            seen.push(`dot:${hookState.player.hp.current}`);
            const result = statusTickHooks.damageOverTime({
              state: hookState,
              hook,
              action: { kind: "wait" },
            });
            return result;
          },
          durations: ({ hook, state: hookState }) => {
            seen.push(`dur:${hookState.player.statuses[0]?.duration ?? "none"}`);
            const result = statusTickHooks.durations({
              state: hookState,
              hook,
              action: { kind: "wait" },
            });
            return result;
          },
          hunger: ({ hook, state: hookState }) => {
            seen.push(`hook:${hook}`);
            return hookState;
          },
          regen: ({ hook, state: hookState }) => {
            seen.push(`hook:${hook}`);
            return hookState;
          },
        },
      },
    });

    expect(seen[0]).toBe("dot:10");
    expect(seen[1]).toBe(`dur:${bounds.statusVocabulary.durationTurns.poison.min}`);
    expect(seen.slice(2)).toEqual(TICK_HOOK_ORDER.slice(2).map((hook) => `hook:${hook}`));
  });
});

const withPlayerHp = (state: GameState, current: number): GameState => ({
  ...state,
  player: {
    ...state.player,
    hp: {
      ...state.player.hp,
      current,
    },
  },
});

const withEnemy = (
  state: GameState,
  id: EntityId,
  currentHP: number,
): GameState => ({
  ...state,
  entities: {
    ...state.entities,
    [id]: enemy(id, currentHP),
  },
});

const enemy = (id: EntityId, currentHP: number): EnemyEntityInstance => ({
  id,
  kind: "enemy",
  definition: validEnemyDefinitionFixture as unknown as EnemyDefinition,
  position: { x: 1, y: 0 },
  currentHP,
  statuses: [],
  behaviorRuntime: {},
});

const groundItem = (
  id: EntityId,
  position: Position,
): GroundItemEntityInstance => ({
  id,
  kind: "item",
  definition: validCoinItemFixture as unknown as ItemDefinition,
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime: {},
  quantity: 1,
  identified: true,
});

const normalizeHookState = (
  result: GameState | { readonly state: GameState; readonly events?: readonly TurnEvent[] },
): GameState => ("state" in result ? result.state : result);

const hookEvents = (
  result: GameState | { readonly state: GameState; readonly events?: readonly TurnEvent[] },
): readonly TurnEvent[] => ("events" in result ? (result.events ?? []) : []);
