import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import "../engine/systems/movement.js";

import { render } from "../engine/render/index.js";
import { startRun, stepRun } from "../engine/run/loop.js";
import { parseTraceNdjson } from "../harness/replay/parse.js";
import { resolveContentProvider } from "../harness/replay/provider.js";
import { verify, verifyTraceContent } from "../harness/replay/replay.js";
import type { ParsedTrace, VerifyResult } from "../harness/replay/types.js";

export type ParsedReplayArgs =
  | { readonly help: true }
  | {
      readonly help: false;
      readonly tracePath: string;
      readonly watch: boolean;
      readonly delayMs: number;
    };

export type ReplayWatchResult = {
  readonly frames: readonly string[];
};

export const REPLAY_HELP_TEXT = `Generative Gaming — trace replay

Usage:
  pnpm run replay -- <trace.ndjson>
  pnpm run replay -- <trace.ndjson> --watch [--delay <ms>]

Modes:
  verify (default)  Recompute state hashes and print identical or diverged+turn
  --watch           Re-render the game after each recorded turn

Options:
  --delay <ms>      Pause between watch frames (default: 0)
  --help, -h        Show this help

Exit code is 0 only when verification reports identical.`;

const cliArgv = (argv: readonly string[] = process.argv.slice(2)): readonly string[] =>
  argv[0] === "--" ? argv.slice(1) : argv;

export const parseReplayArgs = (
  argv: readonly string[] = cliArgv(),
): ParsedReplayArgs => {
  let help = false;
  let watch = false;
  let delayMs = 0;
  let tracePath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--watch") {
      watch = true;
      continue;
    }

    if (arg === "--delay") {
      delayMs = readNonNegativeInt(argv, index, "--delay");
      index += 1;
      continue;
    }

    if (arg.startsWith("--delay=")) {
      delayMs = parseNonNegativeInt(readInlineValue(arg, "--delay"), "--delay");
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`unknown argument: ${arg}`);
    }

    if (tracePath !== null) {
      throw new Error(`unexpected extra argument: ${arg}`);
    }

    tracePath = arg;
  }

  if (help) {
    return { help: true };
  }

  if (tracePath === null) {
    throw new Error("trace path is required");
  }

  return {
    help: false,
    tracePath,
    watch,
    delayMs,
  };
};

export const formatVerifyResult = (result: VerifyResult): string => {
  switch (result.status) {
    case "identical":
      return "identical";
    case "diverged":
      return `diverged at turn ${result.report.firstDivergentTurn}`;
    case "unreadable":
      return result.error;
  }
};

export const verifyExitCode = (result: VerifyResult): number =>
  result.status === "identical" ? 0 : 1;

export const replayWatchTrace = (trace: ParsedTrace): ReplayWatchResult => {
  const provider = resolveContentProvider(trace.header.contentRef);
  const started = startRun(trace.header.seed, provider);
  if (!started.ok) {
    throw new Error(`failed to start run: ${started.error.message}`);
  }

  const frames: string[] = [render(started.state)];
  let state = started.state;

  for (const record of trace.turns) {
    const stepped = stepRun(state, record.action, provider);
    if (!stepped.ok) {
      throw new Error(`step failed at turn ${record.turn}: ${stepped.error.message}`);
    }

    state = stepped.state;
    frames.push(render(state));
  }

  return { frames };
};

export const formatWatchOutput = (result: ReplayWatchResult): string =>
  result.frames
    .map((frame, index) => {
      const turnLabel = index === 0 ? "turn 0" : `turn ${index}`;
      return [`--- ${turnLabel} ---`, frame].join("\n");
    })
    .join("\n\n");

export type RunReplayResult = {
  readonly output: string;
  readonly exitCode: number;
};

export const runReplay = (args: Exclude<ParsedReplayArgs, { help: true }>): RunReplayResult => {
  if (args.watch) {
    const content = readTraceFile(args.tracePath);
    const trace = parseTraceNdjson(content);
    const watched = replayWatchTrace(trace);
    return {
      output: formatWatchOutput(watched),
      exitCode: verifyExitCode(verifyTraceContent(content)),
    };
  }

  const result = verify(args.tracePath);
  return {
    output: formatVerifyResult(result),
    exitCode: verifyExitCode(result),
  };
};

const readTraceFile = (tracePath: string): string => readFileSync(tracePath, "utf8");

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

const readNonNegativeInt = (argv: readonly string[], index: number, flag: string): number =>
  parseNonNegativeInt(readStringValue(argv, index, flag), flag);

const parseNonNegativeInt = (value: string, flag: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
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

const main = async (): Promise<void> => {
  let args: ParsedReplayArgs;

  try {
    args = parseReplayArgs();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    process.stdout.write(`${REPLAY_HELP_TEXT}\n`);
    return;
  }

  try {
    const result = runReplay(args);

    if (args.watch && args.delayMs > 0) {
      const frames = result.output.split("\n\n");
      for (const frame of frames) {
        process.stdout.write(`${frame}\n\n`);
        await sleep(args.delayMs);
      }
    } else {
      process.stdout.write(`${result.output}\n`);
    }

    process.exitCode = result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
};

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolveSleep) => {
    setTimeout(resolveSleep, delayMs);
  });

if (isMainModule()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
