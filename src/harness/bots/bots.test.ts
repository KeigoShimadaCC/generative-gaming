import { describe, expect, it } from "vitest";

import { createFloorGeometrySlot, createTileGrid } from "../../engine/map/index.js";
import {
  createFogMemory,
  updateFogMemory,
  visibleCells,
} from "../../engine/map/fov.js";
import {
  createInitialEntityCounters,
  createInitialState,
  type GameState,
  type SerializableRecord,
  type TrapEntityInstance,
} from "../../engine/state/index.js";
import { verifyTraceContent } from "../replay/replay.js";
import { createFallbackFloorContentProvider } from "../fallback-provider.js";
import { validTrapDefinitionFixture } from "../../schemas/fixtures/entities.js";
import {
  aggressivePolicy,
  balancedPolicy,
  botPolicies,
  cautiousPolicy,
} from "./policies/index.js";
import { formatBotOutcomeTable } from "./batch.js";
import { runBot, type BotRunResult } from "./driver.js";
import { createBotStateView } from "./view.js";
import type { BotPolicy } from "./types.js";
import type { TraceWriter } from "../trace/recorder.js";
import type { RunAction } from "../../engine/run/loop.js";

const FALLBACK_SEEDS = Array.from(
  { length: 10 },
  (_, index) => `phase24-bot-${index + 1}`,
);
const MAX_TURNS = 900;

describe("bot policies", () => {
  it("runs 3 policies x 10 fallback seeds to terminal states with distinguishable aggregates", () => {
    const runs = botPolicies.flatMap((policy) =>
      FALLBACK_SEEDS.map((seed) =>
        runBot(policy, seed, createFallbackFloorContentProvider(), MAX_TURNS, {
          writer: memoryTraceWriter(`memory://${policy.name}/${seed}.ndjson`),
        }),
      ),
    );

    expect(runs).toHaveLength(30);
    expect(runs.every((run) => run.outcome.terminal !== "ACTIVE")).toBe(true);
    expect(
      runs.every((run) => !run.outcome.maxTurnsHit),
      maxTurnFailureReport(runs),
    ).toBe(true);
    expect(runs.every((run) => run.trace.turns.length <= MAX_TURNS)).toBe(true);

    const replaySpots = [
      runs.find((run) => run.policy === cautiousPolicy.name),
      runs.find((run) => run.policy === aggressivePolicy.name),
    ];

    for (const run of replaySpots) {
      expect(run).toBeDefined();
      if (run === undefined) {
        throw new Error("missing replay spot-check run");
      }
      expect(verifyTraceContent(run.trace.content)).toEqual({ status: "identical" });
    }

    const aggregates = aggregateByPolicy(runs);
    const differingMetrics = (["kills", "turns", "itemUses"] as const).filter(
      (metric) =>
        new Set(
          botPolicies.map((policy) =>
            aggregates.get(policy.name)?.[metric].join(",") ?? "",
          ),
        ).size >= 2,
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
        tracePath: run.trace.path,
      })),
    );
    if (printBotTableRequested()) {
      console.log(`\n${table}`);
    }
    expect(table).toContain("policy");
    expect(table.split("\n")).toHaveLength(32);
  }, 120_000);

  it("does not expose out-of-sight hidden traps to policy decisions", () => {
    const withoutTrap = hiddenTrapFixture(false);
    const withTrap = hiddenTrapFixture(true);

    for (const policy of botPolicies) {
      const first = policy.decide(
        // No memory is supplied: this verifies only the public view helper.
        createViewForPolicy(withoutTrap, policy),
      );
      const second = policy.decide(createViewForPolicy(withTrap, policy));

      expect(actionFingerprint(second)).toBe(actionFingerprint(first));
    }
  });

  it("breaks repeated no-progress action loops", () => {
    const waitPolicy: BotPolicy = {
      name: balancedPolicy.name,
      description: "Always waits so the driver must force a productive alternative.",
      decide: () => ({ kind: "wait" }),
    };
    const run = runBot(
      waitPolicy,
      "phase24-stall-breaker",
      createFallbackFloorContentProvider(),
      8,
      {
        stallLimit: 3,
        writer: memoryTraceWriter("memory://stall-breaker.ndjson"),
      },
    );
    const actions = run.trace.turns.map((turn) => turn.action.kind);

    expect(actions.slice(0, 3)).toEqual(["wait", "wait", "move"]);
  });
});

const createViewForPolicy = (state: GameState, policy: BotPolicy) => {
  return createBotStateView(state, { policyName: policy.name });
};

const hiddenTrapFixture = (includeTrap: boolean): GameState => {
  const grid = createTileGrid({ width: 6, height: 6 });
  const player = { x: 1, y: 1 };
  const fog = updateFogMemory(createFogMemory(grid), grid, visibleCells(grid, player, 1));
  const state = createInitialState("fog-honesty");
  const trap: TrapEntityInstance = {
    id: "trap#1",
    kind: "trap",
    definition: validTrapDefinitionFixture,
    position: { x: 5, y: 5 },
    currentHP: null,
    statuses: [],
    behaviorRuntime: {},
    armed: true,
  };

  return {
    ...state,
    floor: {
      ...state.floor,
      geometry: {
        ...createFloorGeometrySlot(state.floor.geometry.refId, grid),
        opaque: {
          ...grid,
          fog,
        } as unknown as SerializableRecord,
      },
    },
    player: {
      ...state.player,
      position: player,
    },
    entities: includeTrap ? { [trap.id]: trap } : {},
    ids: {
      ...state.ids,
      entityCounters: includeTrap
        ? { ...createInitialEntityCounters(), trap: 1 }
        : createInitialEntityCounters(),
    },
  };
};

type PolicyAggregates = {
  readonly kills: readonly number[];
  readonly turns: readonly number[];
  readonly itemUses: readonly number[];
};

const aggregateByPolicy = (
  runs: readonly BotRunResult[],
): ReadonlyMap<BotPolicy["name"], PolicyAggregates> => {
  const entries = botPolicies.map((policy) => {
    const policyRuns = runs.filter((run) => run.policy === policy.name);
    return [
      policy.name,
      {
        kills: policyRuns.map((run) => run.outcome.kills),
        turns: policyRuns.map((run) => run.outcome.turns),
        itemUses: policyRuns.map((run) => run.outcome.itemUses),
      },
    ] as const;
  });

  return new Map(entries);
};

const maxTurnFailureReport = (runs: readonly BotRunResult[]): string =>
  runs
    .filter((run) => run.outcome.maxTurnsHit)
    .map(
      (run) =>
        `${run.policy}/${run.seed} ${run.outcome.terminal} d${run.outcome.depth} t${run.outcome.turns} kills=${run.outcome.kills} items=${run.outcome.itemUses}`,
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

const memoryTraceWriter = (path: string): TraceWriter => {
  return {
    path,
    writeHeader: () => {},
    appendTurn: () => {},
  };
};
