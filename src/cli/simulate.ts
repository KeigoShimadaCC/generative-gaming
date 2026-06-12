import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import "../engine/items/triggers.js";
import "../engine/npc/dialogue.js";
import "../engine/systems/combat.js";
import "../engine/systems/inventory.js";
import "../engine/systems/movement.js";

import { createFallbackFloorContentProvider } from "../harness/fallback-provider.js";
import {
  botPolicies,
  formatBotOutcomeTable,
  runBot,
  runBotBatch,
  type BotBatchRow,
} from "../harness/bots/index.js";
import type { BotPolicy, BotPolicyName } from "../harness/bots/types.js";

const DEFAULT_MAX_TURNS = 900;

const policyByName = new Map<BotPolicyName, BotPolicy>(
  botPolicies.map((policy) => [policy.name, policy]),
);

export type ParsedSimulateArgs =
  | { readonly help: true }
  | {
      readonly help: false;
      readonly batch: false;
      readonly policy: BotPolicyName;
      readonly seed: string;
      readonly maxTurns: number;
      readonly outPath: string | null;
    }
  | {
      readonly help: false;
      readonly batch: true;
      readonly policies: readonly BotPolicyName[];
      readonly seeds: readonly string[];
      readonly maxTurns: number;
      readonly outPath: string | null;
    };

export type SimulateResult = {
  readonly rows: readonly BotBatchRow[];
  readonly table: string;
  readonly exitCode: number;
  readonly outPath: string | null;
};

export const SIMULATE_HELP_TEXT = `Generative Gaming — headless bot simulate

Usage:
  pnpm run simulate -- --policy <name> --seed <seed> [--max-turns <n>] [--out <path>]
  pnpm run simulate -- --batch --policies <a,b,c> --seeds <N|s1,s2,...> [--max-turns <n>] [--out <path>]

Policies: cautious, balanced, aggressive

Options:
  --policy <name>       Bot policy for a single run (required unless --batch)
  --seed <seed>         Seed for a single run (default: cli-simulate)
  --batch               Run a policies × seeds sweep
  --policies <list>     Comma-separated policy names (required with --batch)
  --seeds <N|list>      Seed count (simulate-1..N) or comma-separated seed list
  --max-turns <n>       Turn cap per run (default: ${DEFAULT_MAX_TURNS})
  --out <path>          Write JSON outcome rows to this path
  --help, -h            Show this help

Exit code is nonzero when any run is still ACTIVE or hits the turn cap.`;

const cliArgv = (argv: readonly string[] = process.argv.slice(2)): readonly string[] =>
  argv[0] === "--" ? argv.slice(1) : argv;

export const parseSimulateArgs = (
  argv: readonly string[] = cliArgv(),
): ParsedSimulateArgs => {
  let help = false;
  let batch = false;
  let policy: BotPolicyName | null = null;
  let seed = "cli-simulate";
  let policies: BotPolicyName[] = [];
  let seeds: string[] = [];
  let maxTurns = DEFAULT_MAX_TURNS;
  let outPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--batch") {
      batch = true;
      continue;
    }

    if (arg === "--policy") {
      policy = readPolicyName(argv, index, "--policy");
      index += 1;
      continue;
    }

    if (arg.startsWith("--policy=")) {
      policy = parsePolicyName(arg.slice("--policy=".length));
      continue;
    }

    if (arg === "--seed") {
      seed = readStringValue(argv, index, "--seed");
      index += 1;
      continue;
    }

    if (arg.startsWith("--seed=")) {
      seed = readInlineValue(arg, "--seed");
      continue;
    }

    if (arg === "--policies") {
      policies = readPolicyList(argv, index, "--policies");
      index += 1;
      continue;
    }

    if (arg.startsWith("--policies=")) {
      policies = parsePolicyList(arg.slice("--policies=".length));
      continue;
    }

    if (arg === "--seeds") {
      seeds = parseSeeds(readStringValue(argv, index, "--seeds"));
      index += 1;
      continue;
    }

    if (arg.startsWith("--seeds=")) {
      seeds = parseSeeds(readInlineValue(arg, "--seeds"));
      continue;
    }

    if (arg === "--max-turns") {
      maxTurns = readPositiveInt(argv, index, "--max-turns");
      index += 1;
      continue;
    }

    if (arg.startsWith("--max-turns=")) {
      maxTurns = parsePositiveInt(readInlineValue(arg, "--max-turns"), "--max-turns");
      continue;
    }

    if (arg === "--out") {
      outPath = readStringValue(argv, index, "--out");
      index += 1;
      continue;
    }

    if (arg.startsWith("--out=")) {
      outPath = readInlineValue(arg, "--out");
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (help) {
    return { help: true };
  }

  if (batch) {
    if (policies.length === 0) {
      throw new Error("--batch requires --policies");
    }
    if (seeds.length === 0) {
      throw new Error("--batch requires --seeds");
    }
    return {
      help: false,
      batch: true,
      policies,
      seeds,
      maxTurns,
      outPath,
    };
  }

  if (policy === null) {
    throw new Error("--policy is required unless --batch is set");
  }

  return {
    help: false,
    batch: false,
    policy,
    seed,
    maxTurns,
    outPath,
  };
};

export const runSimulate = (args: Exclude<ParsedSimulateArgs, { help: true }>): SimulateResult => {
  const providerFactory = () => createFallbackFloorContentProvider();

  const batchResult = args.batch
    ? runBotBatch(
        args.policies.map((name) => resolvePolicy(name)),
        args.seeds,
        providerFactory,
        args.maxTurns,
      )
    : {
        runs: [
          runBot(
            resolvePolicy(args.policy),
            args.seed,
            providerFactory(),
            args.maxTurns,
            { runId: `bot-${args.policy}-${args.seed}` },
          ),
        ],
        rows: [] as BotBatchRow[],
      };

  const rows: BotBatchRow[] =
    batchResult.rows.length > 0
      ? [...batchResult.rows]
      : batchResult.runs.map((run) => ({
          policy: run.policy,
          seed: run.seed,
          terminal: run.outcome.terminal,
          depth: run.outcome.depth,
          turns: run.outcome.turns,
          kills: run.outcome.kills,
          hpRetention: run.outcome.hpRetention,
          itemUses: run.outcome.itemUses,
          tracePath: run.trace.path,
        }));

  const table = formatBotOutcomeTable(rows);
  const exitCode = batchResult.runs.some(
    (run) => run.outcome.terminal === "ACTIVE" || run.outcome.maxTurnsHit,
  )
    ? 1
    : 0;

  if (args.outPath !== null) {
    writeSimulateJson(args.outPath, rows, exitCode !== 0);
  }

  return {
    rows,
    table,
    exitCode,
    outPath: args.outPath,
  };
};

const writeSimulateJson = (
  outPath: string,
  rows: readonly BotBatchRow[],
  hasFailures: boolean,
): void => {
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(
    outPath,
    `${JSON.stringify({ rows, hasFailures }, null, 2)}\n`,
    "utf8",
  );
};

const resolvePolicy = (name: BotPolicyName): BotPolicy => {
  const policy = policyByName.get(name);
  if (policy === undefined) {
    throw new Error(`unknown policy: ${name}`);
  }
  return policy;
};

const parsePolicyName = (value: string): BotPolicyName => {
  if (!policyByName.has(value as BotPolicyName)) {
    throw new Error(`unknown policy: ${value}`);
  }
  return value as BotPolicyName;
};

const readPolicyName = (
  argv: readonly string[],
  index: number,
  flag: string,
): BotPolicyName => parsePolicyName(readStringValue(argv, index, flag));

const parsePolicyList = (value: string): BotPolicyName[] => {
  const names = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (names.length === 0) {
    throw new Error("--policies requires at least one policy");
  }
  return names.map((name) => parsePolicyName(name));
};

const readPolicyList = (
  argv: readonly string[],
  index: number,
  flag: string,
): BotPolicyName[] => parsePolicyList(readStringValue(argv, index, flag));

export const parseSeeds = (value: string): string[] => {
  if (/^\d+$/.test(value)) {
    const count = Number.parseInt(value, 10);
    if (count <= 0) {
      throw new Error("--seeds count must be a positive integer");
    }
    return Array.from({ length: count }, (_, seedIndex) => `simulate-${seedIndex + 1}`);
  }

  const seeds = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (seeds.length === 0) {
    throw new Error("--seeds requires at least one seed");
  }
  return seeds;
};

const readStringValue = (argv: readonly string[], index: number, flag: string): string => {
  const next = argv[index + 1];
  if (next === undefined || next.startsWith("-")) {
    throw new Error(`${flag} requires a value`);
  }
  return next;
};

const readInlineValue = (arg: string, flag: string): string => {
  const value = arg.slice(flag.length + 1);
  if (value.length === 0) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
};

const readPositiveInt = (argv: readonly string[], index: number, flag: string): number =>
  parsePositiveInt(readStringValue(argv, index, flag), flag);

const parsePositiveInt = (value: string, flag: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
};

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }

  return import.meta.url === pathToFileURL(resolve(entry)).href;
};

const main = (): void => {
  let args: ParsedSimulateArgs;

  try {
    args = parseSimulateArgs();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    process.stdout.write(`${SIMULATE_HELP_TEXT}\n`);
    return;
  }

  try {
    const result = runSimulate(args);
    process.stdout.write(`${result.table}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
};

if (isMainModule()) {
  main();
}
