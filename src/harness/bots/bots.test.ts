import { describe, expect, it } from "vitest";

import {
  createFloorGeometrySlot,
  createTileGrid
} from "../../engine/map/index.js";
import {
  createFogMemory,
  updateFogMemory,
  visibleCells
} from "../../engine/map/fov.js";
import {
  createInitialEntityCounters,
  createInitialState,
  type GameState,
  type SerializableRecord,
  type TrapEntityInstance
} from "../../engine/state/index.js";
import { verifyTraceContent } from "../replay/replay.js";
import { createFallbackFloorContentProvider } from "../fallback-provider.js";
import { validTrapDefinitionFixture } from "../../schemas/fixtures/entities.js";
import {
  aggressivePolicy,
  balancedPolicy,
  botPolicies,
  cautiousPolicy
} from "./policies/index.js";
import {
  resetKitUseMemoryForTests,
  standingOnKnownHoardTile,
  takeHoardIfAvailable,
  useEquipmentUpgrade,
} from "./policies/helpers.js";
import { config } from "../../config/index.js";
import { formatBotOutcomeTable } from "./batch.js";
import { runBot, type BotRunResult } from "./driver.js";
import { createBotStateView } from "./view.js";
import type {
  BotKnownItem,
  BotPolicy,
  BotPolicyName,
  BotStateView
} from "./types.js";
import type { TraceWriter } from "../trace/recorder.js";
import type { RunAction } from "../../engine/run/loop.js";

const FALLBACK_SEEDS = Array.from(
  { length: 10 },
  (_, index) => `phase24-bot-${index + 1}`
);
const MAX_TURNS = 900;

describe("bot policies", () => {
  it("runs 3 policies x 10 fallback seeds to terminal states with distinguishable aggregates", () => {
    resetKitUseMemoryForTests();
    const runs = botPolicies.flatMap((policy) =>
      FALLBACK_SEEDS.map((seed) =>
        runBot(policy, seed, createFallbackFloorContentProvider(), MAX_TURNS, {
          writer: memoryTraceWriter(`memory://${policy.name}/${seed}.ndjson`)
        })
      )
    );

    expect(runs).toHaveLength(30);
    expect(runs.every((run) => run.outcome.terminal !== "ACTIVE")).toBe(true);
    expect(
      runs.every((run) => !run.outcome.maxTurnsHit),
      maxTurnFailureReport(runs)
    ).toBe(true);
    expect(runs.every((run) => run.trace.turns.length <= MAX_TURNS)).toBe(true);

    const replaySpots = [
      runs.find((run) => run.policy === cautiousPolicy.name),
      runs.find((run) => run.policy === aggressivePolicy.name)
    ];

    for (const run of replaySpots) {
      expect(run).toBeDefined();
      if (run === undefined) {
        throw new Error("missing replay spot-check run");
      }
      const replay = verifyTraceContent(run.trace.content);
      expect(replay.status).not.toBe("invalid");
    }

    const aggregates = aggregateByPolicy(runs);
    const differingMetrics = (["kills", "turns", "itemUses"] as const).filter(
      (metric) =>
        new Set(
          botPolicies.map(
            (policy) => aggregates.get(policy.name)?.[metric].join(",") ?? ""
          )
        ).size >= 2
    );

    expect(differingMetrics.length).toBeGreaterThanOrEqual(2);

    const table = formatBotOutcomeTable(
      runs.map((run) => ({
        policy: run.policy,
        seed: run.seed,
        terminal: run.outcome.terminal,
        depth: run.outcome.depth,
        turns: run.outcome.turns,
        kills: run.outcome.kills,
        hpRetention: run.outcome.hpRetention,
        itemUses: run.outcome.itemUses,
        tracePath: run.trace.path
      }))
    );
    if (printBotTableRequested()) {
      console.log(`\n${table}`);
    }
    expect(table).toContain("policy");
    expect(table.split("\n")).toHaveLength(32);
  }, 600_000);

  it("does not expose out-of-sight hidden traps to policy decisions", () => {
    const withoutTrap = hiddenTrapFixture(false);
    const withTrap = hiddenTrapFixture(true);

    for (const policy of botPolicies) {
      const first = policy.decide(
        // No memory is supplied: this verifies only the public view helper.
        createViewForPolicy(withoutTrap, policy)
      );
      const second = policy.decide(createViewForPolicy(withTrap, policy));

      expect(actionFingerprint(second)).toBe(actionFingerprint(first));
    }
  });

  it("breaks repeated no-progress action loops", () => {
    const waitPolicy: BotPolicy = {
      name: balancedPolicy.name,
      description:
        "Always waits so the driver must force a productive alternative.",
      decide: () => ({ kind: "wait" })
    };
    const run = runBot(
      waitPolicy,
      "phase24-stall-breaker",
      createFallbackFloorContentProvider(),
      8,
      {
        stallLimit: 3,
        writer: memoryTraceWriter("memory://stall-breaker.ndjson")
      }
    );
    const actions = run.trace.turns.map((turn) => turn.action.kind);

    expect(actions.slice(0, 3)).toEqual(["wait", "wait", "move"]);
  });

  it("spends survival kit before default fighting or movement", () => {
    for (const policy of botPolicies) {
      expect(
        policy.decide(
          kitView(policy.name, {
            hpRatio: 0.49,
            inventory: [healingItem("heal#1")],
            availableActions: [{ kind: "use_item", itemId: "heal#1" }]
          })
        )
      ).toEqual({ kind: "use_item", itemId: "heal#1" });

      expect(
        policy.decide(
          kitView(policy.name, {
            inventory: [equipmentItem("weapon#1", "weapon", 2)],
            availableActions: [{ kind: "use_item", itemId: "weapon#1" }]
          })
        )
      ).toEqual({ kind: "use_item", itemId: "weapon#1" });

      expect(
        policy.decide(
          kitView(policy.name, {
            inventory: [throwableItem("throw#1")],
            availableActions: [
              { kind: "use_item", itemId: "throw#1" },
              { kind: "attack", targetId: "enemy#1" }
            ],
            enemies: [
              {
                id: "enemy#1",
                name: "target",
                glyph: "e",
                position: { x: 2, y: 1 },
                hp: { current: 4, max: 4, ratio: 1 },
                attack: 2,
                defense: 0,
                statuses: []
              }
            ]
          })
        )
      ).toEqual({
        kind: "use_item",
        itemId: "throw#1",
        direction: "east"
      });
    }
  });

  it("blocks repeated no-progress equipment item uses", () => {
    resetKitUseMemoryForTests();
    const view = kitView(balancedPolicy.name, {
      inventory: [equipmentItem("weapon#2", "weapon", 5)],
      equipment: {
        weapon: equipmentItem("weapon#1", "weapon", 2),
        armor: null,
        charms: []
      },
      availableActions: [{ kind: "use_item", itemId: "weapon#2" }]
    });

    expect(useEquipmentUpgrade(view)).toEqual({
      kind: "use_item",
      itemId: "weapon#2"
    });
    expect(useEquipmentUpgrade(view)).toBeNull();
  });

  it("never decides take_hoard while off the hoard tile", () => {
    const hoardPosition = { x: 5, y: 5 };
    const offTileView = kitView(balancedPolicy.name, {
      depth: config.runStructure.depthFloors,
      position: { x: 1, y: 1 },
      features: [
        {
          id: "hoard",
          kind: "hoard",
          name: "The Hoard",
          position: hoardPosition,
          depth: config.runStructure.depthFloors,
        },
      ],
      availableActions: [
        { kind: "take_hoard" },
        { kind: "move", direction: "east" },
      ],
    });

    for (const policy of botPolicies) {
      expect(policy.decide(offTileView).kind).not.toBe("take_hoard");
      expect(takeHoardIfAvailable(offTileView)).toBeNull();
      expect(standingOnKnownHoardTile(offTileView)).toBe(false);
    }
  });

  it("wins depth-12 fallback runs across simulate seeds", () => {
    resetKitUseMemoryForTests();
    const provider = createFallbackFloorContentProvider();
    const wins = botPolicies.flatMap((policy) =>
      Array.from({ length: 15 }, (_, index) => {
        const seed = `simulate-${index + 1}`;
        const run = runBot(policy, seed, provider, 8000, {
          writer: memoryTraceWriter(`memory://depth-12/${policy.name}/${seed}.ndjson`),
        });
        return run.outcome.terminal === "WIN" ? [{ policy: policy.name, seed }] : [];
      }),
    );

    expect(wins.length).toBeGreaterThan(0);
  }, 300_000);

  it("does not oscillate item uses on simulate-11 and simulate-15", () => {
    resetKitUseMemoryForTests();

    for (const seed of ["simulate-11", "simulate-15"]) {
      const run = runBot(
        balancedPolicy,
        seed,
        createFallbackFloorContentProvider(),
        8000,
        {
          writer: memoryTraceWriter(`memory://oscillation/${seed}.ndjson`)
        }
      );

      expect(
        run.outcome.itemUses,
        `${seed} itemUses=${run.outcome.itemUses}`
      ).toBeLessThan(100);
      expect(
        run.outcome.maxTurnsHit,
        `${seed} terminal=${run.outcome.terminal} turns=${run.outcome.turns}`
      ).toBe(false);
    }
  }, 120_000);
});

const createViewForPolicy = (state: GameState, policy: BotPolicy) => {
  return createBotStateView(state, { policyName: policy.name });
};

const hiddenTrapFixture = (includeTrap: boolean): GameState => {
  const grid = createTileGrid({ width: 6, height: 6 });
  const player = { x: 1, y: 1 };
  const fog = updateFogMemory(
    createFogMemory(grid),
    grid,
    visibleCells(grid, player, 1)
  );
  const state = createInitialState("fog-honesty");
  const trap: TrapEntityInstance = {
    id: "trap#1",
    kind: "trap",
    definition: validTrapDefinitionFixture,
    position: { x: 5, y: 5 },
    currentHP: null,
    statuses: [],
    behaviorRuntime: {},
    armed: true
  };

  return {
    ...state,
    floor: {
      ...state.floor,
      geometry: {
        ...createFloorGeometrySlot(state.floor.geometry.refId, grid),
        opaque: {
          ...grid,
          fog
        } as unknown as SerializableRecord
      }
    },
    player: {
      ...state.player,
      position: player
    },
    entities: includeTrap ? { [trap.id]: trap } : {},
    ids: {
      ...state.ids,
      entityCounters: includeTrap
        ? { ...createInitialEntityCounters(), trap: 1 }
        : createInitialEntityCounters()
    }
  };
};

type PolicyAggregates = {
  readonly kills: readonly number[];
  readonly turns: readonly number[];
  readonly itemUses: readonly number[];
};

const aggregateByPolicy = (
  runs: readonly BotRunResult[]
): ReadonlyMap<BotPolicy["name"], PolicyAggregates> => {
  const entries = botPolicies.map((policy) => {
    const policyRuns = runs.filter((run) => run.policy === policy.name);
    return [
      policy.name,
      {
        kills: policyRuns.map((run) => run.outcome.kills),
        turns: policyRuns.map((run) => run.outcome.turns),
        itemUses: policyRuns.map((run) => run.outcome.itemUses)
      }
    ] as const;
  });

  return new Map(entries);
};

const maxTurnFailureReport = (runs: readonly BotRunResult[]): string =>
  runs
    .filter((run) => run.outcome.maxTurnsHit)
    .map(
      (run) =>
        `${run.policy}/${run.seed} ${run.outcome.terminal} d${run.outcome.depth} t${run.outcome.turns} kills=${run.outcome.kills} items=${run.outcome.itemUses}`
    )
    .join("\n");

const printBotTableRequested = (): boolean => {
  const host = globalThis as {
    readonly process?: {
      readonly env?: {
        readonly PRINT_BOT_TABLE?: string;
      };
    };
  };

  return host.process?.env?.PRINT_BOT_TABLE === "1";
};

const actionFingerprint = (action: RunAction): string =>
  JSON.stringify(action, Object.keys(action).sort());

const kitView = (
  policyName: BotPolicyName,
  options: {
    readonly hpRatio?: number;
    readonly depth?: number;
    readonly position?: BotStateView["player"]["position"];
    readonly inventory?: readonly BotKnownItem[];
    readonly equipment?: BotStateView["player"]["equipment"];
    readonly availableActions?: readonly RunAction[];
    readonly enemies?: BotStateView["visible"]["enemies"];
    readonly features?: BotStateView["visible"]["features"];
    readonly seed?: string;
  }
): BotStateView => {
  const hpRatio = options.hpRatio ?? 0.9;
  const hpMax = 20;
  const depth = options.depth ?? 1;

  return {
    policyName,
    availableActions: options.availableActions ?? [],
    rendered: "",
    run: {
      seed: options.seed ?? "kit-view",
      turn: 0,
      depth,
      terminalStatus: "ACTIVE"
    },
    floor: {
      width: 5,
      height: 5,
      turn: 0
    },
    player: {
      position: options.position ?? { x: 1, y: 1 },
      hp: {
        current: Math.floor(hpMax * hpRatio),
        max: hpMax,
        ratio: hpRatio
      },
      fullness: {
        current: 100,
        max: 100,
        ratio: 1
      },
      level: 1,
      statuses: [],
      inventory: options.inventory ?? [],
      equipment: options.equipment ?? {
        weapon: null,
        armor: null,
        charms: []
      }
    },
    map: {
      cells: [],
      visited: []
    },
    visible: {
      enemies: options.enemies ?? [],
      npcs: [],
      groundItems: [],
      traps: [],
      features: options.features ?? []
    },
    chooseIndex: () => 0
  };
};

const healingItem = (itemInstanceId: string): BotKnownItem =>
  knownItem(itemInstanceId, "draught", {
    effectsKnown: true,
    effects: [
      {
        kind: "heal",
        damage: null,
        heal: { amount: 6 },
        applyStatus: null,
        cureStatus: null,
        buffStat: null,
        nutrition: null,
        teleportSelf: null,
        teleportTarget: null,
        blink: null,
        knockback: null,
        reveal: null,
        identify: null,
        enchant: null,
        summon: null,
        transform: null,
        dig: null
      }
    ]
  });

const equipmentItem = (
  itemInstanceId: string,
  category: "weapon" | "armor",
  bonus: number
): BotKnownItem =>
  knownItem(itemInstanceId, category, {
    bonusKnown: true,
    bonus
  });

const throwableItem = (itemInstanceId: string): BotKnownItem =>
  knownItem(itemInstanceId, "throwable");

const knownItem = (
  itemInstanceId: string,
  category: BotKnownItem["category"],
  overrides: Partial<BotKnownItem> = {}
): BotKnownItem => ({
  itemInstanceId,
  entityId: null,
  definitionId: itemInstanceId,
  category,
  displayName: itemInstanceId,
  position: null,
  quantity: 1,
  identified: true,
  effectsKnown: false,
  effects: [],
  bonusKnown: true,
  bonus: null,
  equipped: false,
  ...overrides
});

const memoryTraceWriter = (path: string): TraceWriter => {
  return {
    path,
    writeHeader: () => {},
    appendTurn: () => {}
  };
};
