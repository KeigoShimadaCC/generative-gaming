import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { config } from "../../src/config/index.js";
import { createFallbackFloorContentProvider } from "../../src/harness/fallback-provider.js";
import {
  botPolicies,
  runBot,
  type BotRunResult,
} from "../../src/harness/bots/index.js";
import { verifyTraceContent } from "../../src/harness/replay/index.js";
import type { TraceContentRef, TraceWriter } from "../../src/harness/trace/recorder.js";
import {
  currentFloorRuntime,
  startRun,
  stepRun,
  type FloorContentProvider,
  type RunAction,
} from "../../src/engine/run/loop.js";
import type { GameState, Position } from "../../src/engine/state/index.js";
import { PROTOCOL_VERSION } from "../../src/schemas/protocol.js";

const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));
const MILESTONE_DIR = join(ROOT_DIR, "runs", "milestones", "m0");
const TRACE_DIR = join(MILESTONE_DIR, "traces");
const REPORT_PATH = join(MILESTONE_DIR, "report.md");
const CREATED_AT = "2026-06-12T00:00:00.000Z";
const CONTENT_REF = {
  providerId: "fallback:old-stock",
  packVersion: "0.0.0",
} as const satisfies TraceContentRef;
const M0_SEEDS = Array.from({ length: 5 }, (_, index) => `phase24-bot-${index + 1}`);
const MAX_TURNS = 900;
const WRITE_M0_EVIDENCE = process.env.UPDATE_M0_EVIDENCE === "1";
const M0_SENTENCE =
  "**M0 — Playable skeleton.** The engine runs a complete, finite, seeded run with fallback content, headless and in the UI, fully offline. Bots can play it end to end.";

describe("M0 integration milestone", () => {
  it("runs policy x seed fallback bots to terminal states with replay-identical traces", () => {
    const runs = runM0BotMatrix();

    expect(runs).toHaveLength(botPolicies.length * M0_SEEDS.length);
    expect(
      runs.every((run) => run.outcome.terminal !== "ACTIVE" && !run.outcome.maxTurnsHit),
      maxTurnFailureReport(runs),
    ).toBe(true);

    for (const run of runs) {
      expect(verifyTraceContent(run.trace.content), `${run.policy}/${run.seed}`).toEqual({
        status: "identical",
      });
    }

    if (WRITE_M0_EVIDENCE) {
      for (const run of runs) {
        writeTraceFile(run);
      }
      writeMilestoneReport(runs);
    }
  }, 600_000);

  it("records byte-identical traces when the same policy and seed are run twice", () => {
    const first = runBot(
      botPolicies[1],
      "m0-determinism",
      createFallbackFloorContentProvider(),
      MAX_TURNS,
      {
        createdAt: CREATED_AT,
        contentRef: CONTENT_REF,
        writer: memoryTraceWriter("memory://m0-determinism.ndjson"),
      },
    );
    const second = runBot(
      botPolicies[1],
      "m0-determinism",
      createFallbackFloorContentProvider(),
      MAX_TURNS,
      {
        createdAt: CREATED_AT,
        contentRef: CONTENT_REF,
        writer: memoryTraceWriter("memory://m0-determinism.ndjson"),
      },
    );

    expect(second.trace.content).toBe(first.trace.content);
    expect(verifyTraceContent(first.trace.content)).toEqual({ status: "identical" });
  }, 30_000);

  it("imports no network modules along the gameplay path", () => {
    const findings = scanGameplayImportGraphForNetwork();

    expect(findings, findings.join("\n")).toEqual([]);
  });

  it("keeps the full fallback WIN smoke green", () => {
    const state = scriptFullFallbackWin("m0-full-win-smoke", createFallbackFloorContentProvider());

    expect(state.run.depth).toBe(config.runStructure.depthFloors);
    expect(state.run.terminalStatus).toBe(config.runStructure.terminalStates.win);
  });
});

const runM0BotMatrix = (): readonly BotRunResult[] =>
  botPolicies.flatMap((policy) =>
    M0_SEEDS.map((seed) => {
      const tracePath = join(TRACE_DIR, `${policy.name}-${seed}.ndjson`);

      return runBot(policy, seed, createFallbackFloorContentProvider(), MAX_TURNS, {
        createdAt: CREATED_AT,
        contentRef: CONTENT_REF,
        runId: `m0-${policy.name}-${seed}`,
        writer: memoryTraceWriter(tracePath),
      });
    }),
  );

const writeTraceFile = (run: BotRunResult): void => {
  mkdirSync(dirname(run.trace.path), { recursive: true });
  writeFileSync(run.trace.path, run.trace.content, "utf8");
};

const writeMilestoneReport = (runs: readonly BotRunResult[]): void => {
  mkdirSync(MILESTONE_DIR, { recursive: true });
  const tableRows = runs.map((run) => [
    run.policy,
    run.seed,
    run.outcome.terminal,
    run.outcome.depth.toString(),
    run.outcome.turns.toString(),
    run.outcome.kills.toString(),
    Math.round(run.outcome.hpRetention * 100).toString(),
    run.outcome.itemUses.toString(),
    linkPath(run.trace.path),
  ]);
  const report = [
    "# M0 Milestone Evidence",
    "",
    `> ${M0_SENTENCE}`,
    "",
    "## Clause Evidence",
    "",
    "| M0 clause | Evidence |",
    "|---|---|",
    "| complete, finite, seeded run | `tests/integration/m0.test.ts > keeps the full fallback WIN smoke green`; determinism: `records byte-identical traces when the same policy and seed are run twice` |",
    `| with fallback content | all 15 bot traces use content ref \`${CONTENT_REF.providerId}\` / pack \`${CONTENT_REF.packVersion}\` at protocol \`${PROTOCOL_VERSION}\` |`,
    "| headless | `runs policy x seed fallback bots to terminal states with replay-identical traces`; 15-run table below |",
    "| in the UI | human CLI acceptance is explicitly deferred; see final pending line |",
    "| fully offline | `imports no network modules along the gameplay path` scans `src/cli/play.ts` plus the transitive import graph from `src/engine/**` for `node:http`, `node:https`, `http`, `https`, `undici`, and `fetch(` |",
    "| Bots can play it end to end | all rows below terminate outside `ACTIVE` and each trace replays with `{ status: \"identical\" }` |",
    "",
    "## 15-Run Outcome Table",
    "",
    "| policy | seed | terminal | depth | turns | kills | hp% | itemUses | trace |",
    "|---|---|---:|---:|---:|---:|---:|---:|---|",
    ...tableRows.map((row) => `| ${row.join(" | ")} |`),
    "",
    "## Golden Refresh",
    "",
    `- Canonical golden: [tests/golden/replay-mini-wait.ndjson](${linkPath(join(ROOT_DIR, "tests", "golden", "replay-mini-wait.ndjson"))})`,
    `- Current protocol: \`${PROTOCOL_VERSION}\``,
    "- Replay evidence: `src/harness/replay/replay.test.ts > replays the committed golden fixture minted by the canonical recorder` run twice during M0 verification.",
    "",
    "HUMAN RATIFICATION PENDING: pnpm run play",
  ].join("\n");

  writeFileSync(REPORT_PATH, `${report}\n`, "utf8");
};

const memoryTraceWriter = (path: string): TraceWriter => ({
  path,
  writeHeader: () => {},
  appendTurn: () => {},
});

const maxTurnFailureReport = (runs: readonly BotRunResult[]): string =>
  runs
    .filter((run) => run.outcome.terminal === "ACTIVE" || run.outcome.maxTurnsHit)
    .map(
      (run) =>
        `${run.policy}/${run.seed} ${run.outcome.terminal} d${run.outcome.depth} t${run.outcome.turns}`,
    )
    .join("\n");

const scriptFullFallbackWin = (
  seed: string,
  provider: FloorContentProvider,
): GameState => {
  const started = startRun(seed, provider);
  expect(started.ok, started.ok ? "" : started.error.message).toBe(true);
  if (!started.ok) {
    throw new Error(started.error.message);
  }

  let state = started.state;

  for (let depth = 1; depth < config.runStructure.depthFloors; depth += 1) {
    state = withPlayerPosition(state, requiredRuntime(state).stairsDown);
    state = expectStepped(state, { kind: "descend" }, provider);
    expect(state.run.depth).toBe(depth + 1);
  }

  const hoard = requiredRuntime(state).hoard;
  expect(hoard).not.toBeNull();
  state = withPlayerPosition(state, hoard?.position ?? { x: -1, y: -1 });

  return expectStepped(state, { kind: "take_hoard" }, provider);
};

const expectStepped = (
  state: GameState,
  action: RunAction,
  provider: FloorContentProvider,
): GameState => {
  const result = stepRun(state, action, provider);
  expect(result.ok, result.ok ? "" : result.error.message).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.state;
};

const requiredRuntime = (state: GameState) => {
  const runtime = currentFloorRuntime(state);
  if (runtime === null) {
    throw new Error("missing floor runtime");
  }

  return runtime;
};

const withPlayerPosition = (state: GameState, position: Position): GameState => ({
  ...state,
  player: {
    ...state.player,
    position,
  },
});

type ImportFinding = {
  readonly file: string;
  readonly line: number;
  readonly detail: string;
};

const scanGameplayImportGraphForNetwork = (): readonly string[] => {
  const roots = [
    join(ROOT_DIR, "src", "cli", "play.ts"),
    ...listProductionTsFiles(join(ROOT_DIR, "src", "engine")),
  ];
  const queue = [...roots];
  const visited = new Set<string>();
  const findings: ImportFinding[] = [];

  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined) {
      continue;
    }
    const normalized = resolve(file);
    if (visited.has(normalized) || !isProductionTsFile(normalized)) {
      continue;
    }
    visited.add(normalized);

    const source = readFileSync(normalized, "utf8");
    findings.push(...networkFindings(normalized, source));

    for (const specifier of importSpecifiers(source)) {
      const resolved = resolveLocalImport(normalized, specifier);
      if (resolved !== null) {
        queue.push(resolved);
      }
    }
  }

  return findings.map(
    (finding) => `${relative(ROOT_DIR, finding.file)}:${finding.line} ${finding.detail}`,
  );
};

const listProductionTsFiles = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listProductionTsFiles(path);
    }
    return isProductionTsFile(path) ? [path] : [];
  });

const isProductionTsFile = (path: string): boolean =>
  path.endsWith(".ts") &&
  !path.endsWith(".test.ts") &&
  !path.endsWith(".d.ts") &&
  !path.includes(`${join("__fixtures__", "")}`) &&
  !path.includes(".golden.");

const importSpecifiers = (source: string): readonly string[] => {
  const specifiers: string[] = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[^'"]+\s+from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }

  return specifiers;
};

const networkFindings = (file: string, source: string): readonly ImportFinding[] => {
  const findings: ImportFinding[] = [];
  const specifierPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(specifierPattern)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined && isNetworkSpecifier(specifier)) {
      findings.push({
        file,
        line: lineNumber(source, match.index ?? 0),
        detail: `forbidden network import ${specifier}`,
      });
    }
  }

  const fetchPattern = /\bfetch\s*\(/g;
  for (const match of source.matchAll(fetchPattern)) {
    findings.push({
      file,
      line: lineNumber(source, match.index ?? 0),
      detail: "forbidden fetch call",
    });
  }

  return findings;
};

const isNetworkSpecifier = (specifier: string): boolean =>
  specifier === "node:http" ||
  specifier === "node:https" ||
  specifier === "http" ||
  specifier === "https" ||
  specifier === "undici";

const resolveLocalImport = (fromFile: string, specifier: string): string | null => {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/u, ".ts"));
  const candidates = [base, `${base}.ts`, join(base, "index.ts")];

  for (const candidate of candidates) {
    if (fileExists(candidate) && isProductionTsFile(candidate)) {
      return candidate;
    }
  }

  return null;
};

const fileExists = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

const lineNumber = (source: string, index: number): number =>
  source.slice(0, index).split("\n").length;

const linkPath = (path: string): string => relative(ROOT_DIR, path);
