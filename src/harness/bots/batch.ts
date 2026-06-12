import type { FloorContentProvider } from "../../engine/run/loop.js";
import type { BotPolicy } from "./types.js";
import { runBot, type BotRunResult, type RunBotOptions } from "./driver.js";

export type BotBatchRow = {
  readonly policy: BotPolicy["name"];
  readonly seed: string;
  readonly terminal: string;
  readonly depth: number;
  readonly turns: number;
  readonly kills: number;
  readonly hpRetention: number;
  readonly itemUses: number;
  readonly tracePath: string;
};

export type BotBatchResult = {
  readonly rows: readonly BotBatchRow[];
  readonly runs: readonly BotRunResult[];
};

export const runBotBatch = (
  policies: readonly BotPolicy[],
  seeds: readonly string[],
  providerFactory: () => FloorContentProvider,
  maxTurns: number,
  options: RunBotOptions = {},
): BotBatchResult => {
  const runs = policies.flatMap((policy) =>
    seeds.map((seed) =>
      runBot(policy, seed, providerFactory(), maxTurns, {
        ...options,
        runId: `bot-${policy.name}-${seed}`,
      }),
    ),
  );

  return {
    runs,
    rows: runs.map((run) => ({
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
  };
};

export const formatBotOutcomeTable = (
  rows: readonly BotBatchRow[],
): string => {
  const headers = [
    "policy",
    "seed",
    "terminal",
    "depth",
    "turns",
    "kills",
    "hp%",
    "itemUses",
  ] as const;
  const body = rows.map((row) => [
    row.policy,
    row.seed,
    row.terminal,
    row.depth.toString(),
    row.turns.toString(),
    row.kills.toString(),
    Math.round(row.hpRetention * 100).toString(),
    row.itemUses.toString(),
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...body.map((row) => row[index]?.length ?? 0)),
  );
  const line = (cells: readonly string[]) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
      .join(" | ");

  return [
    line(headers),
    widths.map((width) => "-".repeat(width)).join("-|-"),
    ...body.map(line),
  ].join("\n");
};
