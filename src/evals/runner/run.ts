import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { bounds, config } from "../../config/index.js";
import { assemblePrompt } from "../../director/prompt/assemble.js";
import { summarizeTrace } from "../../director/prompt/summarize.js";
import {
  createAmbientDirectorProvider,
  createMockDirectorProvider,
  type DirectorProvider,
  type ProviderTokenUsage,
} from "../../director/provider/index.js";
import { generateFloor } from "../../gauntlet/repair.js";
import {
  loadGenerationChain,
  type ArtifactReadOptions,
  type GenerationRecord,
} from "../../harness/artifacts/index.js";
import { hashPrompt } from "../../harness/artifacts/hash.js";
import { nodeArtifactFsAdapter } from "../../harness/artifacts/fs.js";
import { parseTraceNdjson } from "../../harness/replay/parse.js";
import type { DepthBand } from "../../schemas/entities/index.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import {
  validLowestManifestFixture,
  validMiddleManifestFixture,
  validShallowsManifestFixture,
} from "../../schemas/fixtures/manifest.js";
import {
  personaBankFixturePath,
  personaPolicies,
  readPersonaBankFixture,
} from "../personas/index.js";
import {
  PERSONA_BANK_SEEDS,
  type PersonaBankSeed,
  type PersonaName,
} from "../personas/types.js";
import {
  composeEvalReport,
  manifestFromGenerationRecord,
  writeEvalReport,
  type EvalBankSnapshot,
  type EvalCellConfigSnapshot,
  type EvalCellRun,
  type EvalConfigSnapshot,
  type EvalMetricInput,
  type EvalProviderMode,
  type EvalReport,
  type EvalRunStatus,
} from "./report.js";

export type EvalRunnerConfig = {
  readonly evalId: string;
  readonly rootDir: string;
  readonly mode: EvalProviderMode;
  readonly n: number;
  readonly maxCalls: number;
  readonly cells: readonly EvalCellConfigSnapshot[];
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly gitRev?: string;
  readonly providerFactory?: EvalProviderFactory;
  readonly fs?: ArtifactReadOptions["fs"];
};

export type EvalProviderFactory = (input: {
  readonly mode: EvalProviderMode;
  readonly persona: PersonaName;
  readonly band: DepthBand;
  readonly depth: number;
  readonly seed: string;
  readonly generationIndex: number;
}) => DirectorProvider;

export type EvalRunnerResult = {
  readonly report: EvalReport;
  readonly reportJsonPath: string;
  readonly reportMarkdownPath: string;
};

export type ParsedEvalCliArgs =
  | { readonly help: true }
  | {
      readonly help: false;
      readonly mode: EvalProviderMode;
      readonly cells?: readonly EvalCellConfigSnapshot[];
      readonly n?: number;
      readonly maxCalls?: number;
      readonly evalId?: string;
    };

const DEFAULT_ROOT_DIR = "runs/evals";
const DEFAULT_N = 1;
const DEFAULT_MAX_CALLS = 15;
const DEPTH_BY_BAND: Readonly<Record<DepthBand, number>> = {
  shallows: 3,
  middle: 6,
  lowest: 11,
};
const DEPTH_BANDS: readonly DepthBand[] = ["shallows", "middle", "lowest"];
const EVAL_HELP_TEXT = `Generative Gaming — eval runner

Usage:
  pnpm run evals -- --mode mock|ambient [--cells shallows:hoarder,...] [--n 2] [--max-calls 15] [--eval-id id]

Options:
  --mode <kind>       Provider mode: mock or ambient
  --cells <list>      Comma-separated band:persona cells
  --n <count>         Generations per cell (default ${DEFAULT_N})
  --max-calls <n>     Hard total generation call cap (default ${DEFAULT_MAX_CALLS})
  --eval-id <id>      Output id under ${DEFAULT_ROOT_DIR}
  --help, -h          Show this help`;

export const defaultEvalRunnerConfig = (
  input: {
    readonly mode: EvalProviderMode;
    readonly cells?: readonly EvalCellConfigSnapshot[];
    readonly n?: number;
    readonly maxCalls?: number;
    readonly evalId?: string;
  },
): EvalRunnerConfig => ({
  evalId: input.evalId ?? defaultEvalId(),
  rootDir: DEFAULT_ROOT_DIR,
  mode: input.mode,
  n: input.n ?? DEFAULT_N,
  maxCalls: input.maxCalls ?? DEFAULT_MAX_CALLS,
  cells: input.cells ?? defaultCells(),
});

export const runEvalSuite = async (
  configInput: EvalRunnerConfig,
): Promise<EvalRunnerResult> => {
  validateRunnerConfig(configInput);

  const fs = configInput.fs ?? nodeArtifactFsAdapter;
  const startedAt = configInput.startedAt ?? new Date().toISOString();
  const evalDir = `${trimTrailingSlash(configInput.rootDir)}/${configInput.evalId}`;
  const providerModelId = modelIdForMode(configInput.mode);
  const cells: EvalCellRun[] = [];
  let attemptedCalls = 0;
  let completedCalls = 0;
  let status: EvalRunStatus = "complete";
  let partialReason: string | undefined;

  for (const cell of configInput.cells) {
    const records: GenerationRecord[] = [];
    const generationRunIds: string[] = [];
    const bankSeeds: PersonaBankSeed[] = [];
    const metricInputs: EvalMetricInput[] = [];
    const cellId = cellIdFor(cell.band, cell.persona);

    for (let generationIndex = 0; generationIndex < configInput.n; generationIndex += 1) {
      if (attemptedCalls >= configInput.maxCalls) {
        status = "partial";
        partialReason = `call cap ${configInput.maxCalls} reached before ${cellId} generation ${generationIndex + 1}`;
        break;
      }

      attemptedCalls += 1;

      const bankSeed = bankSeedForIndex(generationIndex);
      const generationRunId = generationRunIdFor({
        evalId: configInput.evalId,
        persona: cell.persona,
        band: cell.band,
        generationIndex,
      });
      const seed = `${generationRunId}:seed`;
      const trace = parseTraceNdjson(
        readPersonaBankFixture(cell.persona, bankSeed),
      );
      const traceFacts = summarizeTrace(trace, { band: cell.band });
      const prompt = assemblePrompt({
        band: cell.band,
        depth: cell.depth,
        config,
        bounds,
        traceFacts,
        runContext: { seed, runId: generationRunId },
      });
      const provider = (
        configInput.providerFactory ?? defaultProviderFactory
      )({
        mode: configInput.mode,
        persona: cell.persona,
        band: cell.band,
        depth: cell.depth,
        seed,
        generationIndex,
      });

      await generateFloor({
        prompt,
        provider,
        runId: generationRunId,
        depth: cell.depth,
        seed,
        modelId: providerModelId,
        artifacts: { rootDir: evalDir, fs },
        repairCap: 0,
      });

      const record = loadGenerationChain(generationRunId, cell.depth, {
        rootDir: evalDir,
        fs,
      });
      records.push(record);
      metricInputs.push({
        manifest: manifestFromGenerationRecord(record, {
          rootDir: evalDir,
          fs,
        }),
        traceFacts: traceFacts.facts,
      });
      generationRunIds.push(generationRunId);
      bankSeeds.push(bankSeed);
      completedCalls += 1;
    }

    cells.push({
      ...cell,
      cellId,
      generationRunIds,
      bankSeeds,
      records,
      metricInputs,
    });

    if (status === "partial") {
      break;
    }
  }

  const completedAt = configInput.completedAt ?? new Date().toISOString();
  const report = composeEvalReport({
    evalId: configInput.evalId,
    status,
    ...(partialReason === undefined ? {} : { partialReason }),
    startedAt,
    completedAt,
    config: configSnapshot(configInput),
    provider: {
      mode: configInput.mode,
      modelId: providerModelId,
    },
    bank: bankSnapshot(configInput.cells),
    gitRev: configInput.gitRev ?? readGitRev(),
    calls: {
      attempted: attemptedCalls,
      completed: completedCalls,
      cap: configInput.maxCalls,
    },
    cells,
  });
  const paths = writeEvalReport(report, {
    rootDir: configInput.rootDir,
    fs,
  });

  return {
    report,
    reportJsonPath: paths.jsonPath,
    reportMarkdownPath: paths.markdownPath,
  };
};

export const parseEvalCliArgs = (
  argv: readonly string[] = cliArgv(),
): ParsedEvalCliArgs => {
  let mode: EvalProviderMode | null = null;
  let cells: readonly EvalCellConfigSnapshot[] | undefined;
  let n: number | undefined;
  let maxCalls: number | undefined;
  let evalId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }

    if (arg === "--mode") {
      mode = readMode(argv, index, "--mode");
      index += 1;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      mode = parseMode(readInlineValue(arg, "--mode"));
      continue;
    }

    if (arg === "--cells") {
      cells = parseCells(readStringValue(argv, index, "--cells"));
      index += 1;
      continue;
    }

    if (arg.startsWith("--cells=")) {
      cells = parseCells(readInlineValue(arg, "--cells"));
      continue;
    }

    if (arg === "--n") {
      n = readPositiveInt(argv, index, "--n");
      index += 1;
      continue;
    }

    if (arg.startsWith("--n=")) {
      n = parsePositiveInt(readInlineValue(arg, "--n"), "--n");
      continue;
    }

    if (arg === "--max-calls") {
      maxCalls = readPositiveInt(argv, index, "--max-calls");
      index += 1;
      continue;
    }

    if (arg.startsWith("--max-calls=")) {
      maxCalls = parsePositiveInt(readInlineValue(arg, "--max-calls"), "--max-calls");
      continue;
    }

    if (arg === "--eval-id") {
      evalId = readStringValue(argv, index, "--eval-id");
      index += 1;
      continue;
    }

    if (arg.startsWith("--eval-id=")) {
      evalId = readInlineValue(arg, "--eval-id");
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (mode === null) {
    throw new Error("--mode is required");
  }

  return {
    help: false,
    mode,
    ...(cells === undefined ? {} : { cells }),
    ...(n === undefined ? {} : { n }),
    ...(maxCalls === undefined ? {} : { maxCalls }),
    ...(evalId === undefined ? {} : { evalId }),
  };
};

export const formatEvalSmokeOutput = (result: EvalRunnerResult): string => [
  `Eval ${result.report.evalId}: ${result.report.status}`,
  `Report: ${result.reportJsonPath}`,
  `Markdown: ${result.reportMarkdownPath}`,
  `Records: ${result.report.overall.recordCount}`,
  `Validity: ${formatPercent(result.report.overall.summary.rates.validity.percent)}`,
  `Solvability: ${formatPercent(result.report.overall.summary.rates.solvability.percent)}`,
  `Fallback: ${formatPercent(result.report.overall.summary.rates.fallback.percent)}`,
].join("\n");

const defaultProviderFactory: EvalProviderFactory = ({
  mode,
  band,
  depth,
  seed,
  generationIndex,
}) => {
  if (mode === "ambient") {
    return createAmbientDirectorProvider();
  }

  const manifest = manifestForBand(band, depth, seed);

  return createMockDirectorProvider({
    manifest,
    raw: JSON.stringify(manifest),
    latencyMs: 10 + generationIndex,
    tokens: mockTokensFor(generationIndex),
  });
};

const mockTokensFor = (generationIndex: number): ProviderTokenUsage => ({
  inputTokens: 100 + generationIndex,
  outputTokens: 50 + generationIndex,
  totalTokens: 150 + (generationIndex * 2),
});

const manifestForBand = (
  band: DepthBand,
  depth: number,
  seed: string,
): FloorManifest => {
  const fixture = fixtureForBand(band);

  return {
    ...fixture,
    depth,
    params: {
      ...fixture.params,
      seed,
    },
  };
};

const fixtureForBand = (band: DepthBand): FloorManifest => {
  switch (band) {
    case "shallows":
      return validShallowsManifestFixture;
    case "middle":
      return validMiddleManifestFixture;
    case "lowest":
      return validLowestManifestFixture;
  }
};

const configSnapshot = (
  runnerConfig: EvalRunnerConfig,
): EvalConfigSnapshot => ({
  evalId: runnerConfig.evalId,
  rootDir: runnerConfig.rootDir,
  n: runnerConfig.n,
  maxCalls: runnerConfig.maxCalls,
  cells: runnerConfig.cells,
});

const bankSnapshot = (
  cells: readonly EvalCellConfigSnapshot[],
): EvalBankSnapshot => {
  const fixtures = uniqueFixturesFor(cells);
  const fingerprintInput = fixtures
    .map((fixture) => {
      const content = readFileSync(personaBankFixturePath(fixture.persona, fixture.seed), "utf8");
      return `${fixture.relativePath}\n${content}`;
    })
    .join("\n---fixture---\n");
  const fingerprint = hashPrompt(fingerprintInput).slice(0, 12);

  return {
    version: `persona-bank:${fingerprint}`,
    fixtures,
  };
};

const uniqueFixturesFor = (
  cells: readonly EvalCellConfigSnapshot[],
): readonly {
  readonly persona: PersonaName;
  readonly seed: PersonaBankSeed;
  readonly relativePath: string;
}[] => {
  const personas = [...new Set(cells.map((cell) => cell.persona))].sort();
  const fixtures: Array<{
    readonly persona: PersonaName;
    readonly seed: PersonaBankSeed;
    readonly relativePath: string;
  }> = [];

  for (const persona of personas) {
    for (const seed of PERSONA_BANK_SEEDS) {
      fixtures.push({
        persona,
        seed,
        relativePath: `tests/eval-bank/${persona}-${seed}.ndjson`,
      });
    }
  }

  return fixtures;
};

const defaultCells = (): readonly EvalCellConfigSnapshot[] =>
  personaPolicies.flatMap((persona) =>
    DEPTH_BANDS.map((band) => ({
      persona: persona.name,
      band,
      depth: DEPTH_BY_BAND[band],
    })),
  );

const parseCells = (value: string): readonly EvalCellConfigSnapshot[] => {
  const rawCells = value
    .split(",")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);

  if (rawCells.length === 0) {
    throw new Error("--cells requires at least one band:persona cell");
  }

  return rawCells.map(parseCell);
};

const parseCell = (value: string): EvalCellConfigSnapshot => {
  const [rawBand, rawPersona, extra] = value.split(":");

  if (rawBand === undefined || rawPersona === undefined || extra !== undefined) {
    throw new Error(`invalid cell "${value}"; expected band:persona`);
  }

  const band = parseBand(rawBand);
  const persona = parsePersona(rawPersona);

  return {
    persona,
    band,
    depth: DEPTH_BY_BAND[band],
  };
};

const parseBand = (value: string): DepthBand => {
  if (DEPTH_BANDS.includes(value as DepthBand)) {
    return value as DepthBand;
  }

  throw new Error(`unknown band: ${value}`);
};

const parsePersona = (value: string): PersonaName => {
  const names = personaPolicies.map((persona) => persona.name);

  if (names.includes(value as PersonaName)) {
    return value as PersonaName;
  }

  throw new Error(`unknown persona: ${value}`);
};

const readMode = (
  argv: readonly string[],
  index: number,
  flag: string,
): EvalProviderMode => parseMode(readStringValue(argv, index, flag));

const parseMode = (value: string): EvalProviderMode => {
  if (value === "mock" || value === "ambient") {
    return value;
  }

  throw new Error(`unknown mode: ${value}`);
};

const readStringValue = (
  argv: readonly string[],
  index: number,
  flag: string,
): string => {
  const value = argv[index + 1];

  if (value === undefined || value.startsWith("-")) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
};

const readInlineValue = (arg: string, flag: string): string => {
  const value = arg.slice(`${flag}=`.length);

  if (value.length === 0) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
};

const readPositiveInt = (
  argv: readonly string[],
  index: number,
  flag: string,
): number => parsePositiveInt(readStringValue(argv, index, flag), flag);

const parsePositiveInt = (value: string, flag: string): number => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed < 1 || String(parsed) !== value) {
    throw new Error(`${flag} must be a positive integer`);
  }

  return parsed;
};

const validateRunnerConfig = (runnerConfig: EvalRunnerConfig): void => {
  if (runnerConfig.evalId.length === 0) {
    throw new Error("evalId must be non-empty");
  }

  if (runnerConfig.n < 1) {
    throw new Error("n must be at least 1");
  }

  if (runnerConfig.maxCalls < 1) {
    throw new Error("maxCalls must be at least 1");
  }

  if (runnerConfig.cells.length === 0) {
    throw new Error("at least one cell is required");
  }
};

const generationRunIdFor = (input: {
  readonly evalId: string;
  readonly persona: PersonaName;
  readonly band: DepthBand;
  readonly generationIndex: number;
}): string =>
  `${input.evalId}-${input.band}-${input.persona}-${input.generationIndex + 1}`;

const bankSeedForIndex = (index: number): PersonaBankSeed =>
  PERSONA_BANK_SEEDS[index % PERSONA_BANK_SEEDS.length]!;

const cellIdFor = (band: DepthBand, persona: PersonaName): string =>
  `${band}:${persona}`;

const modelIdForMode = (mode: EvalProviderMode): string => {
  if (mode === "mock") {
    return "director:mock";
  }

  return `ambient:${config.director.ambient.manifestCommand}`;
};

const defaultEvalId = (): string =>
  `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`;

const readGitRev = (): string => {
  const fs = nodeArtifactFsAdapter;

  try {
    const head = fs.readFile(".git/HEAD").trim();
    if (!head.startsWith("ref: ")) {
      return head;
    }

    const refPath = `.git/${head.slice("ref: ".length)}`;
    if (!fs.fileExists(refPath)) {
      return "unknown";
    }

    return fs.readFile(refPath).trim();
  } catch {
    return "unknown";
  }
};

const cliArgv = (
  argv: readonly string[] = process.argv.slice(2),
): readonly string[] => (argv[0] === "--" ? argv.slice(1) : argv);

const formatPercent = (value: number): string => {
  if (Number.isInteger(value)) {
    return `${value}%`;
  }

  return `${value.toFixed(2)}%`;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/g, "");

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }

  return import.meta.url === pathToFileURL(resolve(entry)).href;
};

const main = async (): Promise<void> => {
  let args: ParsedEvalCliArgs;

  try {
    args = parseEvalCliArgs();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    process.stdout.write(`${EVAL_HELP_TEXT}\n`);
    return;
  }

  try {
    const result = await runEvalSuite(defaultEvalRunnerConfig(args));
    process.stdout.write(`${formatEvalSmokeOutput(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
};

if (isMainModule()) {
  void main();
}
