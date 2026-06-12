import { bounds, config as defaultConfig } from "../config/index.js";
import { materialize, type MaterializedFloor } from "../director/apply/index.js";
import {
  type DirectorProvider,
  type GenerateManifestOptions,
  type ProviderFailureCode,
  type ProviderResult,
  failure,
} from "../director/provider/index.js";
import type { FloorContent, FloorContentProvider } from "../engine/run/index.js";
import {
  createFallbackFloorContentProvider,
} from "../harness/fallback-provider.js";
import {
  writeGenerationRecord,
  type GenerationAttemptInput,
  type GenerationRecord,
  type WriteGenerationRecordOptions,
} from "../harness/artifacts/index.js";
import type { FloorManifest } from "../schemas/manifest.js";
import type { Gate2Check, Gate2Report } from "./gate2/judge.js";
import { defaultGate2Config, runGate2, type Gate2RunOptions } from "./gate2/run.js";
import {
  failedChecks,
  runGate0,
  runGate1,
  type GateCheck,
  type GateReport,
  type Gate1Context,
} from "./gates01/index.js";

export type RepairClock = () => string;

export type GenerateFloorContext = {
  readonly prompt: string;
  readonly provider: DirectorProvider;
  readonly runId: string;
  readonly depth: number;
  readonly seed: string;
  readonly modelId: string;
  readonly createdAt?: string;
  readonly recordedAt?: string;
  readonly now?: RepairClock;
  readonly gate1?: Gate1Context;
  readonly gate2?: Gate2RunOptions;
  readonly fallbackProvider?: FloorContentProvider;
  readonly artifacts?: WriteGenerationRecordOptions;
  readonly repairCap?: number;
  readonly providerOptions?: GenerateManifestOptions;
};

export type GenerateFloorResult = {
  readonly floor: MaterializedFloor | FloorContent;
  readonly record: GenerationRecord;
};

type EvaluatedAttempt =
  | {
      readonly kind: "manifest";
      readonly floor: MaterializedFloor;
      readonly gateReports: Required<GenerationAttemptInput["gateReports"]>;
    }
  | {
      readonly kind: "repairable";
      readonly gateReports: GenerationAttemptInput["gateReports"];
      readonly manifest?: FloorManifest;
    }
  | {
      readonly kind: "fallback";
      readonly gateReports?: GenerationAttemptInput["gateReports"];
    };

type RepairPromptInput = {
  readonly originalPrompt: string;
  readonly providerResult: ProviderResult;
  readonly gateReports: NonNullable<GenerationAttemptInput["gateReports"]>;
  readonly manifest?: FloorManifest;
};

type Gate2EvaluationResult =
  | {
      readonly kind: "pass";
      readonly floor: MaterializedFloor;
      readonly report: Gate2Report;
    }
  | {
      readonly kind: "fail";
      readonly report: Gate2Report;
    };

const IMMEDIATE_FALLBACK_PROVIDER_CODES = new Set<ProviderFailureCode>([
  "timeout",
  "process_error",
]);
const DEFAULT_ROOT_DIR = "runs";
const FRAGMENT_MAX_CHARS = 4_000;

export const generateFloor = async (
  ctx: GenerateFloorContext,
): Promise<GenerateFloorResult> => {
  const repairCap = ctx.repairCap ?? bounds.gauntlet.repairRetriesMax;
  const attempts: GenerationAttemptInput[] = [];
  let prompt = ctx.prompt;
  let repairsUsed = 0;

  while (true) {
    const providerResult = await generateManifest(ctx.provider, prompt, {
      timeoutMs: ctx.providerOptions?.timeoutMs ?? defaultConfig.director.manifestTimeoutMs,
    });
    const evaluation = evaluateProviderResult(providerResult, ctx);
    attempts.push({
      prompt,
      providerResult,
      ...(evaluation.gateReports === undefined
        ? {}
        : { gateReports: evaluation.gateReports }),
    });

    if (evaluation.kind === "manifest") {
      const record = writeRecord(ctx, attempts, {
        kind: "manifest",
        manifestPath: servedManifestPath(ctx, attempts.length - 1),
      });

      return {
        floor: evaluation.floor,
        record,
      };
    }

    if (
      evaluation.kind === "fallback" ||
      repairsUsed >= repairCap ||
      evaluation.gateReports === undefined
    ) {
      return serveFallback(ctx, attempts);
    }

    prompt = buildRepairPrompt({
      originalPrompt: ctx.prompt,
      providerResult,
      gateReports: evaluation.gateReports,
      manifest: evaluation.manifest,
    });
    repairsUsed += 1;
  }
};

export const buildRepairPrompt = ({
  originalPrompt,
  providerResult,
  gateReports,
  manifest,
}: RepairPromptInput): string => {
  const failed = collectFailedChecks(gateReports);
  const checks = failed
    .map(
      (check) =>
        `- Gate ${check.gate} ${check.code}: ${check.detail}`,
    )
    .join("\n");
  const fragments = offendingFragments(providerResult, manifest)
    .map((fragment) => `\`\`\`json\n${fragment}\n\`\`\``)
    .join("\n\n");

  return [
    originalPrompt,
    "",
    "Your previous output failed these checks:",
    checks.length === 0 ? "- No failed gate checks were recorded." : checks,
    "",
    "Fix only these checks; preserve valid content when possible.",
    "",
    "Offending JSON fragment(s):",
    fragments.length === 0 ? "```json\n<empty provider output>\n```" : fragments,
    "",
    "Return the corrected complete JSON manifest only.",
  ].join("\n");
};

const generateManifest = async (
  provider: DirectorProvider,
  prompt: string,
  options: GenerateManifestOptions,
): Promise<ProviderResult> => {
  try {
    return await provider.generateManifest(prompt, options);
  } catch (error) {
    return failure(
      "process_error",
      error instanceof Error ? error.message : String(error),
      { latencyMs: 0, tokens: null },
    );
  }
};

const evaluateProviderResult = (
  providerResult: ProviderResult,
  ctx: GenerateFloorContext,
): EvaluatedAttempt => {
  if (
    !providerResult.ok &&
    IMMEDIATE_FALLBACK_PROVIDER_CODES.has(providerResult.error.code)
  ) {
    return { kind: "fallback" };
  }

  const raw = providerResult.ok ? providerResult.raw : (providerResult.raw ?? "");
  const gate0 = runGate0(raw);
  if (!gate0.pass) {
    return {
      kind: "repairable",
      gateReports: { gate0 },
    };
  }

  if (!providerResult.ok) {
    return {
      kind: "fallback",
      gateReports: { gate0 },
    };
  }

  const gate1 = runGate1(providerResult.manifest, ctx.gate1);
  if (!gate1.pass) {
    return {
      kind: "repairable",
      gateReports: { gate0, gate1 },
      manifest: providerResult.manifest,
    };
  }

  const gate2Evaluation = evaluateGate2(providerResult.manifest, ctx.gate2);
  const gateReports = {
    gate0,
    gate1,
    gate2: gate2Evaluation.report,
  };

  if (gate2Evaluation.kind === "fail") {
    return {
      kind: "repairable",
      gateReports,
      manifest: providerResult.manifest,
    };
  }

  return {
    kind: "manifest",
    floor: gate2Evaluation.floor,
    gateReports,
  };
};

const evaluateGate2 = (
  manifest: FloorManifest,
  options: Gate2RunOptions = {},
): Gate2EvaluationResult => {
  let floor: MaterializedFloor;

  try {
    floor = materialize(manifest, manifest.params.seed, {
      ...(options.transformFloor === undefined
        ? {}
        : { transformFloor: options.transformFloor }),
    }).floor;
  } catch (error) {
    return {
      kind: "fail",
      report: materializationFailureReport(manifest, options, error),
    };
  }

  try {
    return {
      kind: "pass",
      floor,
      report: runGate2(manifest, options),
    };
  } catch (error) {
    return {
      kind: "fail",
      report: materializationFailureReport(manifest, options, error),
    };
  }
};

const materializationFailureReport = (
  manifest: FloorManifest,
  options: Gate2RunOptions,
  source: unknown,
): Gate2Report => {
  const gateConfig = options.config ?? defaultGate2Config(manifest);
  const detail =
    source instanceof Error
      ? `candidate floor could not be materialized: ${source.message}`
      : `candidate floor could not be materialized: ${String(source)}`;
  const check: Gate2Check = {
    code: "G2_MATERIALIZATION",
    pass: false,
    detail,
  };

  return {
    gate: 2,
    pass: false,
    verdict: {
      status: "reject",
      codes: ["G2_MATERIALIZATION"],
    },
    checks: [check],
    metrics: {
      totalRuns: 0,
      clearCount: 0,
      reachedStairsCount: 0,
      questCompletedCount: 0,
      deathCount: 0,
      clearRatePercent: 0,
      medianHpRetentionPercent: 0,
      minTurns: 0,
      maxTurns: 0,
    },
    candidate: {
      seed: manifest.params.seed,
      stairsReachable: false,
      pathLength: null,
      hasThreatOnPath: false,
      placementDeviationCount: 0,
    },
    ensemble: {
      policies: gateConfig.policies,
      seeds: gateConfig.seeds,
      maxTurns: gateConfig.maxTurns,
    },
    elapsedMs: 0,
    wallClockBudgetMs: gateConfig.wallClockBudgetMs,
  };
};

const collectFailedChecks = (
  gateReports: NonNullable<GenerationAttemptInput["gateReports"]>,
): readonly {
  readonly gate: 0 | 1 | 2;
  readonly code: GateCheck["code"] | Gate2Check["code"];
  readonly detail: string;
}[] => [
  ...(gateReports.gate0 === undefined
    ? []
    : failedChecks(gateReports.gate0).map(withGate(gateReports.gate0))),
  ...(gateReports.gate1 === undefined
    ? []
    : failedChecks(gateReports.gate1).map(withGate(gateReports.gate1))),
  ...(gateReports.gate2 === undefined
    ? []
    : gateReports.gate2.checks
        .filter((check) => !check.pass)
        .map((check) => ({
          gate: 2 as const,
          code: check.code,
          detail: check.detail,
        }))),
];

const withGate =
  (report: GateReport) =>
  (check: GateCheck): { readonly gate: 0 | 1; readonly code: GateCheck["code"]; readonly detail: string } => ({
    gate: report.gate,
    code: check.code,
    detail: check.detail,
  });

const offendingFragments = (
  providerResult: ProviderResult,
  manifest: FloorManifest | undefined,
): readonly string[] => {
  const raw = providerResult.ok ? providerResult.raw : providerResult.raw;
  if (raw !== undefined && raw.trim().length > 0) {
    return [truncateFragment(raw)];
  }

  if (manifest !== undefined) {
    return [truncateFragment(JSON.stringify(manifest, null, 2))];
  }

  return [];
};

const truncateFragment = (fragment: string): string =>
  fragment.length <= FRAGMENT_MAX_CHARS
    ? fragment
    : `${fragment.slice(0, FRAGMENT_MAX_CHARS)}\n...<truncated>`;

const serveFallback = (
  ctx: GenerateFloorContext,
  attempts: readonly GenerationAttemptInput[],
): GenerateFloorResult => {
  const fallbackProvider =
    ctx.fallbackProvider ?? createFallbackFloorContentProvider();
  const floor = fallbackProvider.getFloor(ctx.depth, ctx.seed);
  const record = writeRecord(ctx, attempts, {
    kind: "fallback",
    fallbackId: fallbackId(ctx.depth, floor),
  });

  return { floor, record };
};

const fallbackId = (depth: number, floor: FloorContent): string =>
  `fallback:old-stock:${floor.params.bandOrSize}-${depth}`;

const writeRecord = (
  ctx: GenerateFloorContext,
  attempts: readonly GenerationAttemptInput[],
  outcome: Parameters<typeof writeGenerationRecord>[0]["outcome"],
): GenerationRecord => {
  const createdAt = ctx.createdAt ?? ctx.now?.() ?? new Date().toISOString();
  const recordedAt = ctx.recordedAt ?? ctx.now?.() ?? createdAt;

  return writeGenerationRecord(
    {
      runId: ctx.runId,
      depth: ctx.depth,
      seed: ctx.seed,
      modelId: ctx.modelId,
      createdAt,
      recordedAt,
      attempts,
      outcome,
    },
    ctx.artifacts,
  );
};

const servedManifestPath = (
  ctx: GenerateFloorContext,
  attemptIndex: number,
): string => {
  const rootDir = trimTrailingSlash(ctx.artifacts?.rootDir ?? DEFAULT_ROOT_DIR);
  return `${rootDir}/${ctx.runId}/floors/${ctx.depth}/attempts/${attemptIndex}/manifest.json`;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/g, "");
