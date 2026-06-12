import { mkdirSync, writeFileSync } from "node:fs";

import { createFallbackFloorContentProvider } from "../../../src/harness/fallback-provider.js";
import {
  botPolicies,
  runBot,
  type BotRunResult,
} from "../../../src/harness/bots/index.js";
import type { BotPolicyName } from "../../../src/harness/bots/types.js";
import type {
  TraceHeader,
  TraceTurnLine,
  TraceWriter,
} from "../../../src/harness/trace/recorder.js";
import type { RunAction, RunEvent } from "../../../src/engine/run/loop.js";

type PolicySummary = {
  readonly policy: string;
  readonly runs: number;
  readonly wins: number;
  readonly aborts: number;
  readonly losses: number;
  readonly maxTurnsHit: number;
  readonly medianHpRetentionPercent: number;
  readonly averageTurns: number;
  readonly averageKills: number;
  readonly averageItemUses: number;
  readonly playerDamageEvents: number;
  readonly playerDamageTaken: number;
  readonly enemyActorTurns: number;
  readonly enemyMovementEvents: number;
  readonly enemyWaitEvents: number;
  readonly enemyAbilityEvents: number;
  readonly abortActions: number;
  readonly floorBudgetAbortActions: number;
};

type DepthSummary = {
  readonly depth: number;
  readonly reached: number;
  readonly terminalHere: number;
  readonly averageTurnsOnDepth: number;
  readonly playerDamageTaken: number;
};

type RunSummary = {
  readonly policy: BotPolicyName;
  readonly seed: string;
  readonly terminal: string;
  readonly depth: number;
  readonly turns: number;
  readonly kills: number;
  readonly hpRetentionPercent: number;
  readonly itemUses: number;
  readonly maxTurnsHit: boolean;
  readonly playerDamageEvents: number;
  readonly playerDamageTaken: number;
  readonly playerAttackHits: number;
  readonly enemyAttackHits: number;
  readonly enemyAttackMisses: number;
  readonly enemyActorTurns: number;
  readonly enemyMovementEvents: number;
  readonly enemyWaitEvents: number;
  readonly enemyAbilityEvents: number;
  readonly abortActions: number;
  readonly floorBudgetAbortActions: number;
  readonly turnsByDepth: Record<string, number>;
};

type BatchReport = {
  readonly label: string;
  readonly policies: readonly string[];
  readonly seeds: readonly string[];
  readonly maxTurns: number;
  readonly generatedAt: string;
  readonly overall: {
    readonly runs: number;
    readonly wins: number;
    readonly aborts: number;
    readonly losses: number;
    readonly balancedWinRatePercent: number;
    readonly medianShallowsHpRetentionPercent: number;
    readonly shallowDeathsThroughFloor2: number;
    readonly playerDamageEvents: number;
    readonly playerDamageTaken: number;
    readonly enemyActorTurns: number;
    readonly enemyMovementEvents: number;
    readonly enemyWaitEvents: number;
    readonly enemyAbilityEvents: number;
  };
  readonly byPolicy: readonly PolicySummary[];
  readonly survivalByDepth: readonly DepthSummary[];
  readonly runs: readonly RunSummary[];
};

const OUT_DIR = "runs/milestones/balance-01";
const MAX_TURNS = 8000;
const SEEDS = Array.from({ length: 15 }, (_, index) => `simulate-${index + 1}`);

const labelArg = process.argv.find((arg) => arg.startsWith("--label="));
const label = labelArg?.slice("--label=".length) ?? "baseline";

const main = (): void => {
  mkdirSync(OUT_DIR, { recursive: true });
  const providerFactory = () => createFallbackFloorContentProvider();
  const runs = botPolicies.flatMap((policy) =>
    SEEDS.map((seed) =>
      runBot(policy, seed, providerFactory(), MAX_TURNS, {
        runId: `${label}-${policy.name}-${seed}`,
        writer: memoryTraceWriter(`${label}-${policy.name}-${seed}`),
      }),
    ),
  );
  const report = summarizeBatch(label, runs);
  const jsonPath = `${OUT_DIR}/${label}.json`;
  const mdPath = `${OUT_DIR}/${label}.md`;

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, renderMarkdown(report), "utf8");

  process.stdout.write(`${renderMarkdown(report)}\n`);
  process.stdout.write(`Wrote ${jsonPath} and ${mdPath}\n`);
};

const summarizeBatch = (
  reportLabel: string,
  runs: readonly BotRunResult[],
): BatchReport => {
  const summaries = runs.map(summarizeRun);
  const byPolicy = botPolicies.map((policy) =>
    summarizePolicy(policy.name, summaries.filter((run) => run.policy === policy.name)),
  );
  const shallowRuns = summaries.filter((run) => run.depth >= 1);
  const balancedRuns = summaries.filter((run) => run.policy === "balanced");
  const shallowDeathsThroughFloor2 = summaries.filter(
    (run) => run.terminal === "LOSS" && run.depth <= 2,
  ).length;

  return {
    label: reportLabel,
    policies: botPolicies.map((policy) => policy.name),
    seeds: SEEDS,
    maxTurns: MAX_TURNS,
    generatedAt: new Date().toISOString(),
    overall: {
      runs: summaries.length,
      wins: summaries.filter((run) => run.terminal === "WIN").length,
      aborts: summaries.filter((run) => run.terminal === "ABORTED").length,
      losses: summaries.filter((run) => run.terminal === "LOSS").length,
      balancedWinRatePercent: percentage(
        balancedRuns.filter((run) => run.terminal === "WIN").length,
        balancedRuns.length,
      ),
      medianShallowsHpRetentionPercent: median(
        shallowRuns.map((run) => run.hpRetentionPercent),
      ),
      shallowDeathsThroughFloor2,
      playerDamageEvents: sum(summaries, (run) => run.playerDamageEvents),
      playerDamageTaken: sum(summaries, (run) => run.playerDamageTaken),
      enemyActorTurns: sum(summaries, (run) => run.enemyActorTurns),
      enemyMovementEvents: sum(summaries, (run) => run.enemyMovementEvents),
      enemyWaitEvents: sum(summaries, (run) => run.enemyWaitEvents),
      enemyAbilityEvents: sum(summaries, (run) => run.enemyAbilityEvents),
    },
    byPolicy,
    survivalByDepth: Array.from({ length: 12 }, (_, index) =>
      summarizeDepth(index + 1, summaries),
    ),
    runs: summaries,
  };
};

const summarizeRun = (run: BotRunResult): RunSummary => {
  const eventMetrics = summarizeTrace(run.trace.turns);

  return {
    policy: run.policy,
    seed: run.seed,
    terminal: run.outcome.terminal,
    depth: run.outcome.depth,
    turns: run.outcome.turns,
    kills: run.outcome.kills,
    hpRetentionPercent: Math.round(run.outcome.hpRetention * 100),
    itemUses: run.outcome.itemUses,
    maxTurnsHit: run.outcome.maxTurnsHit,
    ...eventMetrics,
  };
};

const summarizeTrace = (
  turns: readonly TraceTurnLine<RunAction, RunEvent>[],
): Omit<
  RunSummary,
  | "policy"
  | "seed"
  | "terminal"
  | "depth"
  | "turns"
  | "kills"
  | "hpRetentionPercent"
  | "itemUses"
  | "maxTurnsHit"
> => {
  let playerDamageEvents = 0;
  let playerDamageTaken = 0;
  let playerAttackHits = 0;
  let enemyAttackHits = 0;
  let enemyAttackMisses = 0;
  let enemyActorTurns = 0;
  let enemyMovementEvents = 0;
  let enemyWaitEvents = 0;
  let enemyAbilityEvents = 0;
  let abortActions = 0;
  let floorBudgetAbortActions = 0;
  let depth = 1;
  const turnsByDepth: Record<string, number> = {};

  for (const turn of turns) {
    turnsByDepth[String(depth)] = (turnsByDepth[String(depth)] ?? 0) + 1;
    if (turn.action.kind === "abort") {
      abortActions += 1;
      floorBudgetAbortActions += 1;
    }

    for (const event of turn.events) {
      if (event.type === "attack_hit") {
        if (event.data.actorId === "player") {
          playerAttackHits += 1;
        }
        if (event.data.defenderId === "player") {
          enemyAttackHits += 1;
          playerDamageEvents += 1;
          playerDamageTaken += event.data.damage;
        }
      }
      if (event.type === "attack_missed" && event.data.actorId !== "player") {
        enemyAttackMisses += 1;
      }
      if (event.type === "actor_turn" && event.data.actorId.startsWith("enemy#")) {
        enemyActorTurns += 1;
      }
      if (event.type === "enemy_moved") {
        enemyMovementEvents += 1;
      }
      if (event.type === "enemy_waited") {
        enemyWaitEvents += 1;
      }
      if (event.type === "enemy_ability_used") {
        enemyAbilityEvents += 1;
      }
      if (event.type === "run_floor_entered") {
        depth = event.data.depth;
      }
    }
  }

  return {
    playerDamageEvents,
    playerDamageTaken,
    playerAttackHits,
    enemyAttackHits,
    enemyAttackMisses,
    enemyActorTurns,
    enemyMovementEvents,
    enemyWaitEvents,
    enemyAbilityEvents,
    abortActions,
    floorBudgetAbortActions,
    turnsByDepth,
  };
};

const summarizePolicy = (
  policy: BotPolicyName,
  runs: readonly RunSummary[],
): PolicySummary => ({
  policy,
  runs: runs.length,
  wins: runs.filter((run) => run.terminal === "WIN").length,
  aborts: runs.filter((run) => run.terminal === "ABORTED").length,
  losses: runs.filter((run) => run.terminal === "LOSS").length,
  maxTurnsHit: runs.filter((run) => run.maxTurnsHit).length,
  medianHpRetentionPercent: median(runs.map((run) => run.hpRetentionPercent)),
  averageTurns: average(runs.map((run) => run.turns)),
  averageKills: average(runs.map((run) => run.kills)),
  averageItemUses: average(runs.map((run) => run.itemUses)),
  playerDamageEvents: sum(runs, (run) => run.playerDamageEvents),
  playerDamageTaken: sum(runs, (run) => run.playerDamageTaken),
  enemyActorTurns: sum(runs, (run) => run.enemyActorTurns),
  enemyMovementEvents: sum(runs, (run) => run.enemyMovementEvents),
  enemyWaitEvents: sum(runs, (run) => run.enemyWaitEvents),
  enemyAbilityEvents: sum(runs, (run) => run.enemyAbilityEvents),
  abortActions: sum(runs, (run) => run.abortActions),
  floorBudgetAbortActions: sum(runs, (run) => run.floorBudgetAbortActions),
});

const summarizeDepth = (
  depth: number,
  runs: readonly RunSummary[],
): DepthSummary => {
  const reached = runs.filter((run) => run.depth >= depth);
  const terminalHere = runs.filter((run) => run.depth === depth).length;
  const turnsOnDepth = reached.map((run) => run.turnsByDepth[String(depth)] ?? 0);

  return {
    depth,
    reached: reached.length,
    terminalHere,
    averageTurnsOnDepth: average(turnsOnDepth),
    playerDamageTaken: sum(reached, (run) => {
      if ((run.turnsByDepth[String(depth)] ?? 0) === 0) {
        return 0;
      }
      return depth <= 4 ? run.playerDamageTaken : 0;
    }),
  };
};

const renderMarkdown = (report: BatchReport): string => [
  `# ${report.label} batch`,
  "",
  `Generated: ${report.generatedAt}`,
  `Policies x seeds: ${report.policies.join(", ")} x ${report.seeds.length}`,
  `Max turns per run: ${report.maxTurns}`,
  "",
  "## Overall",
  "",
  "| runs | WIN | ABORT | LOSS | balanced WIN% | Shallows HP retention median | shallow deaths f1-2 | player damage | enemy actor turns | enemy behavior events |",
  "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  `| ${report.overall.runs} | ${report.overall.wins} | ${report.overall.aborts} | ${report.overall.losses} | ${report.overall.balancedWinRatePercent} | ${report.overall.medianShallowsHpRetentionPercent} | ${report.overall.shallowDeathsThroughFloor2} | ${report.overall.playerDamageTaken} (${report.overall.playerDamageEvents} events) | ${report.overall.enemyActorTurns} | ${report.overall.enemyMovementEvents + report.overall.enemyWaitEvents + report.overall.enemyAbilityEvents} |`,
  "",
  "## By policy",
  "",
  "| policy | runs | WIN | ABORT | LOSS | max-turn hits | median hp% | avg turns | avg kills | avg item uses | player damage | enemy actor turns | enemy behavior events | abort actions |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...report.byPolicy.map((row) =>
    `| ${row.policy} | ${row.runs} | ${row.wins} | ${row.aborts} | ${row.losses} | ${row.maxTurnsHit} | ${row.medianHpRetentionPercent} | ${row.averageTurns} | ${row.averageKills} | ${row.averageItemUses} | ${row.playerDamageTaken} (${row.playerDamageEvents}) | ${row.enemyActorTurns} | ${row.enemyMovementEvents + row.enemyWaitEvents + row.enemyAbilityEvents} | ${row.abortActions} |`,
  ),
  "",
  "## Survival by depth",
  "",
  "| depth | reached | terminal here | avg turns on depth | player damage on Shallows depths |",
  "|---:|---:|---:|---:|---:|",
  ...report.survivalByDepth.map((row) =>
    `| ${row.depth} | ${row.reached} | ${row.terminalHere} | ${row.averageTurnsOnDepth} | ${row.playerDamageTaken} |`,
  ),
  "",
].join("\n");

const memoryTraceWriter = (runId: string): TraceWriter => {
  const lines: string[] = [];

  return {
    path: `memory://${runId}/trace.ndjson`,
    writeHeader: (header: TraceHeader) => {
      lines.length = 0;
      lines.push(JSON.stringify(header));
    },
    appendTurn: <Action, Event>(line: TraceTurnLine<Action, Event>) => {
      lines.push(JSON.stringify(line));
    },
  };
};

const median = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
};

const average = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) /
      10;

const percentage = (value: number, total: number): number =>
  total === 0 ? 0 : Math.round((value / total) * 1000) / 10;

const sum = <T>(
  values: readonly T[],
  selector: (value: T) => number,
): number => values.reduce((total, value) => total + selector(value), 0);

main();
