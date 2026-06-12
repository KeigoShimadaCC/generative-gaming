import { config } from "../../config/index.js";
import {
  listFloors,
  loadGenerationChain,
  type ArtifactReadOptions,
  type GenerationAttemptRecord,
  type GenerationRecord,
} from "../../harness/artifacts/index.js";
import type { DepthBand } from "../../schemas/entities/index.js";
import type { Gate2ReasonCode, Gate2Report } from "../../gauntlet/gate2/judge.js";

export const EVAL_METRIC_VERSION = "phase-40b-core-v1" as const;

export type EvalTokenUsage = {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
};

type TokenUsageLike = {
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
  readonly totalTokens?: number | null;
};

export type EvalTokenStats = {
  readonly recordCountWithTokens: number;
  readonly totals: EvalTokenUsage | null;
  readonly averagePerRecordWithTokens: EvalTokenUsage | null;
};

export type EvalRate = {
  readonly count: number;
  readonly passed: number;
  readonly percent: number;
};

export type EvalLatencyStats = {
  readonly count: number;
  readonly min: number;
  readonly p50: number;
  readonly avg: number;
  readonly max: number;
};

export type EvalRepairDistribution = {
  readonly zero: number;
  readonly one: number;
  readonly two: number;
  readonly threeOrMore: number;
  readonly byRepairCount: readonly EvalRepairBucket[];
};

export type EvalRepairBucket = {
  readonly repairCount: number;
  readonly count: number;
};

export type EvalAdvisoryFlags = {
  readonly hpRetentionRecorded: boolean;
  readonly hpRetentionAdvisory: boolean;
  readonly hpRetentionPassed: boolean | null;
  readonly advisoryCodes: readonly Gate2ReasonCode[];
  readonly failedAdvisoryCodes: readonly Gate2ReasonCode[];
};

export type EvalBandAccuracy = {
  readonly band: DepthBand;
  readonly clearRatePercent: number;
  readonly clearRateTargetPercent: number;
  readonly clearRateMet: boolean;
  readonly medianHpRetentionPercent: number;
  readonly medianHpRetentionTargetPercent: {
    readonly min: number;
    readonly max: number;
  };
  readonly hpRetentionInBand: boolean;
  readonly accurate: boolean;
};

export type EvalGate2Score = {
  readonly recorded: boolean;
  readonly passed: boolean;
  readonly blockingCodes: readonly Gate2ReasonCode[];
};

export type EvalGenerationScore = {
  readonly runId: string;
  readonly depth: number;
  readonly band: DepthBand;
  readonly attemptCount: number;
  readonly validity: boolean;
  readonly solvability: boolean;
  readonly servedWithoutFallback: boolean;
  readonly repairCount: number;
  readonly fallback: boolean;
  readonly latencyMs: number;
  readonly tokens: EvalTokenUsage | null;
  readonly gate2: EvalGate2Score;
  readonly advisoryFlags: EvalAdvisoryFlags;
  readonly bandAccuracy: EvalBandAccuracy | null;
};

export type EvalRates = {
  readonly validity: EvalRate;
  readonly solvability: EvalRate;
  readonly servedWithoutFallback: EvalRate;
  readonly fallback: EvalRate;
  readonly bandAccuracy: EvalRate;
};

export type EvalBandBreakdown = {
  readonly band: DepthBand;
  readonly count: number;
  readonly rates: EvalRates;
  readonly latencyMs: EvalLatencyStats;
  readonly repairDistribution: EvalRepairDistribution;
  readonly tokens: EvalTokenStats;
};

export type EvalComparabilityFields = {
  readonly baselineId?: string;
  readonly candidateId?: string;
  readonly segmentId?: string;
};

export type EvalScores = {
  readonly recordType: "eval-scores";
  readonly metricVersion: typeof EVAL_METRIC_VERSION;
  readonly recordCount: number;
  readonly generations: readonly EvalGenerationScore[];
  readonly summary: {
    readonly rates: EvalRates;
    readonly latencyMs: EvalLatencyStats;
    readonly repairDistribution: EvalRepairDistribution;
    readonly tokens: EvalTokenStats;
    readonly byBand: Readonly<Record<DepthBand, EvalBandBreakdown>>;
  };
  readonly comparability?: EvalComparabilityFields;
};

export type ScoreGenerationRecordsOptions = {
  readonly comparability?: EvalComparabilityFields;
};

export type ScoreRunGenerationArtifactsOptions = ArtifactReadOptions &
  ScoreGenerationRecordsOptions;

const DEPTH_BANDS: readonly DepthBand[] = ["shallows", "middle", "lowest"];

export const scoreGenerationRecord = (
  record: GenerationRecord,
): EvalGenerationScore => {
  const firstAttempt = record.attempts[0];
  const gate2 = gate2ReportForRecord(record);
  const band = bandForDepth(record.depth);
  const tokens = sumTokens(record.attempts);
  const gate2Score = scoreGate2(gate2);

  return {
    runId: record.runId,
    depth: record.depth,
    band,
    attemptCount: record.attempts.length,
    validity:
      firstAttempt?.gateReports?.gate0?.pass === true &&
      firstAttempt.gateReports.gate1?.pass === true,
    solvability: gate2Score.passed,
    servedWithoutFallback: record.outcome.kind === "manifest",
    repairCount: Math.max(0, record.attempts.length - 1),
    fallback: record.outcome.kind === "fallback",
    latencyMs: sumLatencyMs(record.attempts),
    tokens,
    gate2: gate2Score,
    advisoryFlags: scoreAdvisoryFlags(gate2),
    bandAccuracy: scoreBandAccuracy(band, gate2),
  };
};

export const scoreGenerationRecords = (
  records: readonly GenerationRecord[],
  options: ScoreGenerationRecordsOptions = {},
): EvalScores => {
  const generations = records.map(scoreGenerationRecord);

  return {
    recordType: "eval-scores",
    metricVersion: EVAL_METRIC_VERSION,
    recordCount: generations.length,
    generations,
    summary: {
      rates: ratesFor(generations),
      latencyMs: latencyStats(generations.map((score) => score.latencyMs)),
      repairDistribution: repairDistribution(generations),
      tokens: tokenStats(generations),
      byBand: bandBreakdowns(generations),
    },
    ...(options.comparability === undefined
      ? {}
      : { comparability: options.comparability }),
  };
};

export const loadGenerationRecordsForRun = (
  runId: string,
  options: ArtifactReadOptions = {},
): readonly GenerationRecord[] =>
  listFloors(runId, options).map((floor) =>
    loadGenerationChain(runId, floor.depth, options),
  );

export const scoreRunGenerationArtifacts = (
  runId: string,
  options: ScoreRunGenerationArtifactsOptions = {},
): EvalScores =>
  scoreGenerationRecords(loadGenerationRecordsForRun(runId, options), {
    ...(options.comparability === undefined
      ? {}
      : { comparability: options.comparability }),
  });

const gate2ReportForRecord = (
  record: GenerationRecord,
): Gate2Report | undefined => {
  const scoredAttempt = attemptForRecordOutcome(record);

  if (scoredAttempt?.gateReports?.gate2 !== undefined) {
    return scoredAttempt.gateReports.gate2;
  }

  return last(
    record.attempts
      .map((attempt) => attempt.gateReports?.gate2)
      .filter((report): report is Gate2Report => report !== undefined),
  );
};

const attemptForRecordOutcome = (
  record: GenerationRecord,
): GenerationAttemptRecord | undefined => {
  if (record.outcome.kind === "manifest") {
    const servedManifestPath = record.outcome.manifestPath;
    const servedAttempt = record.attempts.find(
      (attempt) => attempt.provider.manifestPath === servedManifestPath,
    );

    if (servedAttempt !== undefined) {
      return servedAttempt;
    }

    return last(record.attempts.filter((attempt) => attempt.provider.ok));
  }

  return last(record.attempts);
};

const scoreGate2 = (report: Gate2Report | undefined): EvalGate2Score => {
  if (report === undefined) {
    return {
      recorded: false,
      passed: false,
      blockingCodes: [],
    };
  }

  return {
    recorded: true,
    passed: report.pass,
    blockingCodes: report.verdict.codes,
  };
};

const scoreAdvisoryFlags = (
  report: Gate2Report | undefined,
): EvalAdvisoryFlags => {
  const checks = report?.checks ?? [];
  const advisoryChecks = checks.filter((check) => check.advisory === true);
  const hpRetention = checks.find((check) => check.code === "G2_HP_RETENTION");

  return {
    hpRetentionRecorded: hpRetention !== undefined,
    hpRetentionAdvisory: hpRetention?.advisory === true,
    hpRetentionPassed: hpRetention?.pass ?? null,
    advisoryCodes: advisoryChecks.map((check) => check.code),
    failedAdvisoryCodes: advisoryChecks
      .filter((check) => !check.pass)
      .map((check) => check.code),
  };
};

const scoreBandAccuracy = (
  band: DepthBand,
  report: Gate2Report | undefined,
): EvalBandAccuracy | null => {
  if (report === undefined) {
    return null;
  }

  const target = config.difficultyGate.thresholdsByBand[band];
  const clearRatePercent = report.metrics.clearRatePercent;
  const medianHpRetentionPercent = report.metrics.medianHpRetentionPercent;
  const clearRateMet = clearRatePercent >= target.clearRateMinPercent;
  const hpRetentionInBand =
    medianHpRetentionPercent >= target.medianHpRetentionPercent.min &&
    medianHpRetentionPercent <= target.medianHpRetentionPercent.max;

  return {
    band,
    clearRatePercent,
    clearRateTargetPercent: target.clearRateMinPercent,
    clearRateMet,
    medianHpRetentionPercent,
    medianHpRetentionTargetPercent: {
      min: target.medianHpRetentionPercent.min,
      max: target.medianHpRetentionPercent.max,
    },
    hpRetentionInBand,
    accurate: clearRateMet && hpRetentionInBand,
  };
};

const ratesFor = (scores: readonly EvalGenerationScore[]): EvalRates => ({
  validity: rate(scores, (score) => score.validity),
  solvability: rate(scores, (score) => score.solvability),
  servedWithoutFallback: rate(scores, (score) => score.servedWithoutFallback),
  fallback: rate(scores, (score) => score.fallback),
  bandAccuracy: bandAccuracyRate(scores),
});

const rate = (
  scores: readonly EvalGenerationScore[],
  predicate: (score: EvalGenerationScore) => boolean,
): EvalRate => {
  const passed = scores.filter(predicate).length;

  return {
    count: scores.length,
    passed,
    percent: percent(passed, scores.length),
  };
};

const bandAccuracyRate = (
  scores: readonly EvalGenerationScore[],
): EvalRate => {
  const applicable = scores.filter((score) => score.bandAccuracy !== null);
  const passed = applicable.filter(
    (score) => score.bandAccuracy?.accurate === true,
  ).length;

  return {
    count: applicable.length,
    passed,
    percent: percent(passed, applicable.length),
  };
};

const latencyStats = (values: readonly number[]): EvalLatencyStats => {
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    count: sorted.length,
    min: sorted[0] ?? 0,
    p50: median(sorted),
    avg: sorted.length === 0 ? 0 : total / sorted.length,
    max: sorted[sorted.length - 1] ?? 0,
  };
};

const repairDistribution = (
  scores: readonly EvalGenerationScore[],
): EvalRepairDistribution => {
  const buckets = new Map<number, number>();

  for (const score of scores) {
    buckets.set(score.repairCount, (buckets.get(score.repairCount) ?? 0) + 1);
  }

  return {
    zero: buckets.get(0) ?? 0,
    one: buckets.get(1) ?? 0,
    two: buckets.get(2) ?? 0,
    threeOrMore: scores.filter((score) => score.repairCount >= 3).length,
    byRepairCount: [...buckets.entries()]
      .sort(([left], [right]) => left - right)
      .map(([repairCount, count]) => ({ repairCount, count })),
  };
};

const tokenStats = (scores: readonly EvalGenerationScore[]): EvalTokenStats => {
  const tokenScores = scores.filter(
    (score): score is EvalGenerationScore & { readonly tokens: EvalTokenUsage } =>
      score.tokens !== null,
  );
  const totals = sumEvalTokens(tokenScores.map((score) => score.tokens));

  return {
    recordCountWithTokens: tokenScores.length,
    totals,
    averagePerRecordWithTokens:
      totals === null ? null : divideTokenUsage(totals, tokenScores.length),
  };
};

const bandBreakdowns = (
  scores: readonly EvalGenerationScore[],
): Readonly<Record<DepthBand, EvalBandBreakdown>> => ({
  shallows: bandBreakdown("shallows", scores),
  middle: bandBreakdown("middle", scores),
  lowest: bandBreakdown("lowest", scores),
});

const bandBreakdown = (
  band: DepthBand,
  scores: readonly EvalGenerationScore[],
): EvalBandBreakdown => {
  const bandScores = scores.filter((score) => score.band === band);

  return {
    band,
    count: bandScores.length,
    rates: ratesFor(bandScores),
    latencyMs: latencyStats(bandScores.map((score) => score.latencyMs)),
    repairDistribution: repairDistribution(bandScores),
    tokens: tokenStats(bandScores),
  };
};

const sumLatencyMs = (attempts: readonly GenerationAttemptRecord[]): number =>
  attempts.reduce((sum, attempt) => sum + attempt.provider.usage.latencyMs, 0);

const sumTokens = (
  attempts: readonly GenerationAttemptRecord[],
): EvalTokenUsage | null => {
  const tokens = attempts
    .map((attempt) => attempt.provider.usage.tokens ?? null)
    .filter((usage): usage is NonNullable<typeof usage> => usage !== null);

  return sumEvalTokens(tokens);
};

const sumEvalTokens = (
  values: readonly TokenUsageLike[],
): EvalTokenUsage | null => {
  const inputTokens = sumOptional(values.map((tokens) => tokens.inputTokens));
  const outputTokens = sumOptional(values.map((tokens) => tokens.outputTokens));
  const totalTokens = sumOptional(values.map((tokens) => tokens.totalTokens));

  if (
    inputTokens === null &&
    outputTokens === null &&
    totalTokens === null
  ) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
};

const sumOptional = (values: readonly (number | null | undefined)[]): number | null => {
  const present = values.filter((value): value is number => value !== null && value !== undefined);

  if (present.length === 0) {
    return null;
  }

  return present.reduce((sum, value) => sum + value, 0);
};

const divideTokenUsage = (
  tokens: EvalTokenUsage,
  divisor: number,
): EvalTokenUsage => ({
  inputTokens: divideOptional(tokens.inputTokens, divisor),
  outputTokens: divideOptional(tokens.outputTokens, divisor),
  totalTokens: divideOptional(tokens.totalTokens, divisor),
});

const divideOptional = (value: number | null, divisor: number): number | null =>
  value === null ? null : value / divisor;

const percent = (passed: number, count: number): number =>
  count === 0 ? 0 : (passed / count) * 100;

const median = (sortedValues: readonly number[]): number => {
  if (sortedValues.length === 0) {
    return 0;
  }

  const middle = Math.floor(sortedValues.length / 2);
  const right = sortedValues[middle] ?? 0;

  if (sortedValues.length % 2 === 1) {
    return right;
  }

  const left = sortedValues[middle - 1] ?? right;
  return (left + right) / 2;
};

const bandForDepth = (depth: number): DepthBand => {
  if (!Number.isSafeInteger(depth)) {
    throw new RangeError("depth must be a safe integer");
  }

  for (const band of DEPTH_BANDS) {
    const range = config.runStructure.depthBands[band];

    if (depth >= range.minFloor && depth <= range.maxFloor) {
      return band;
    }
  }

  throw new RangeError(`depth ${depth} is outside configured depth bands`);
};

const last = <T>(values: readonly T[]): T | undefined =>
  values[values.length - 1];
