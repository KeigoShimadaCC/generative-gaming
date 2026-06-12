import type { Gate2Evaluation } from "./run.js";

export const GATE2_REASON_CODES = [
  "G2_MATERIALIZATION",
  "G2_CLEAR_RATE",
  "G2_HARD_CLEAR_RATE",
  "G2_HP_RETENTION",
  "G2_DEATH_SHALLOW",
  "G2_ZERO_THREAT",
  "G2_WALL_CLOCK",
] as const;

export type Gate2ReasonCode = (typeof GATE2_REASON_CODES)[number];

export type Gate2Check = {
  readonly code: Gate2ReasonCode;
  readonly pass: boolean;
  readonly detail: string;
};

export type Gate2Verdict = {
  readonly status: "pass" | "reject";
  readonly codes: readonly Gate2ReasonCode[];
};

export type Gate2Report = {
  readonly gate: 2;
  readonly pass: boolean;
  readonly verdict: Gate2Verdict;
  readonly checks: readonly Gate2Check[];
  readonly metrics: Gate2Evaluation["aggregate"];
  readonly candidate: Gate2Evaluation["candidate"];
  readonly ensemble: Gate2Evaluation["ensemble"];
  readonly elapsedMs: number;
  readonly wallClockBudgetMs: number;
};

export const judgeGate2 = (evaluation: Gate2Evaluation): Gate2Report => {
  const threshold = evaluation.thresholds[evaluation.band];
  const hardClearRateMin = threshold.hardRejects.clearRateBelowPercent;
  const deathFloorMax = threshold.hardRejects.anyBotDeathThroughFloor;
  const checks = [
    passCheck("G2_MATERIALIZATION", "candidate floor materialized"),
    checkZeroThreat(evaluation),
    checkDeathShallow(evaluation, deathFloorMax),
    checkHardClearRate(evaluation, hardClearRateMin),
    checkClearRate(evaluation, threshold.clearRateMinPercent),
    checkHpRetention(evaluation, threshold.medianHpRetentionPercent),
    checkWallClock(evaluation),
  ];
  const failed = checks.filter((check) => !check.pass);

  return {
    gate: 2,
    pass: failed.length === 0,
    verdict: {
      status: failed.length === 0 ? "pass" : "reject",
      codes: failed.map((check) => check.code),
    },
    checks,
    metrics: evaluation.aggregate,
    candidate: evaluation.candidate,
    ensemble: evaluation.ensemble,
    elapsedMs: evaluation.elapsedMs,
    wallClockBudgetMs: evaluation.wallClockBudgetMs,
  };
};

export const failedGate2Checks = (
  report: Gate2Report,
): readonly Gate2Check[] => report.checks.filter((check) => !check.pass);

export const formatGate2Report = (report: Gate2Report): string => {
  const header = `Gate 2: ${report.pass ? "PASS" : "FAIL"}`;
  const lines = report.checks.map(
    (check) =>
      `  [${check.pass ? "ok" : "FAIL"}] ${check.code}: ${check.detail}`,
  );

  return [header, ...lines].join("\n");
};

const checkZeroThreat = (evaluation: Gate2Evaluation): Gate2Check => {
  if (
    evaluation.depth < evaluation.zeroThreatRejectBelowDepth &&
    !evaluation.candidate.hasThreatOnPath
  ) {
    return failCheck(
      "G2_ZERO_THREAT",
      `depth ${evaluation.depth} has no enemy encounter possible on the stairs path`,
    );
  }

  return passCheck(
    "G2_ZERO_THREAT",
    evaluation.depth < evaluation.zeroThreatRejectBelowDepth
      ? "at least one enemy encounter is possible on the stairs path"
      : `zero-threat hard reject applies only below depth ${evaluation.zeroThreatRejectBelowDepth}`,
  );
};

const checkDeathShallow = (
  evaluation: Gate2Evaluation,
  deathFloorMax: number | undefined,
): Gate2Check => {
  if (
    deathFloorMax !== undefined &&
    evaluation.depth <= deathFloorMax &&
    evaluation.aggregate.deathCount > 0
  ) {
    return failCheck(
      "G2_DEATH_SHALLOW",
      `${evaluation.aggregate.deathCount} bot death(s) on depth ${evaluation.depth}`,
    );
  }

  return passCheck(
    "G2_DEATH_SHALLOW",
    deathFloorMax === undefined
      ? "band has no shallow-death hard reject"
      : `${evaluation.aggregate.deathCount} bot death(s) through floor ${deathFloorMax}`,
  );
};

const checkHardClearRate = (
  evaluation: Gate2Evaluation,
  hardClearRateMin: number | undefined,
): Gate2Check => {
  if (
    hardClearRateMin !== undefined &&
    evaluation.aggregate.clearRatePercent < hardClearRateMin
  ) {
    return failCheck(
      "G2_HARD_CLEAR_RATE",
      `clear rate ${formatPercent(evaluation.aggregate.clearRatePercent)} is below hard reject ${hardClearRateMin}%`,
    );
  }

  return passCheck(
    "G2_HARD_CLEAR_RATE",
    hardClearRateMin === undefined
      ? "band has no hard clear-rate floor"
      : `clear rate ${formatPercent(evaluation.aggregate.clearRatePercent)} is at least hard reject ${hardClearRateMin}%`,
  );
};

const checkClearRate = (
  evaluation: Gate2Evaluation,
  clearRateMin: number,
): Gate2Check => {
  if (evaluation.aggregate.clearRatePercent < clearRateMin) {
    return failCheck(
      "G2_CLEAR_RATE",
      `clear rate ${formatPercent(evaluation.aggregate.clearRatePercent)} is below ${clearRateMin}%`,
    );
  }

  return passCheck(
    "G2_CLEAR_RATE",
    `clear rate ${formatPercent(evaluation.aggregate.clearRatePercent)} is at least ${clearRateMin}%`,
  );
};

const checkHpRetention = (
  evaluation: Gate2Evaluation,
  band: { readonly min: number; readonly max: number },
): Gate2Check => {
  const hp = evaluation.aggregate.medianHpRetentionPercent;

  if (hp < band.min || hp > band.max) {
    return failCheck(
      "G2_HP_RETENTION",
      `median HP retention ${formatPercent(hp)} is outside ${band.min}-${band.max}%`,
    );
  }

  return passCheck(
    "G2_HP_RETENTION",
    `median HP retention ${formatPercent(hp)} is inside ${band.min}-${band.max}%`,
  );
};

const checkWallClock = (evaluation: Gate2Evaluation): Gate2Check => {
  if (evaluation.elapsedMs > evaluation.wallClockBudgetMs) {
    return failCheck(
      "G2_WALL_CLOCK",
      `ensemble took ${evaluation.elapsedMs}ms over budget ${evaluation.wallClockBudgetMs}ms`,
    );
  }

  return passCheck(
    "G2_WALL_CLOCK",
    `ensemble took ${evaluation.elapsedMs}ms within budget ${evaluation.wallClockBudgetMs}ms`,
  );
};

const passCheck = (
  code: Gate2ReasonCode,
  detail: string,
): Gate2Check => ({
  code,
  pass: true,
  detail,
});

const failCheck = (
  code: Gate2ReasonCode,
  detail: string,
): Gate2Check => ({
  code,
  pass: false,
  detail,
});

const formatPercent = (value: number): string => {
  if (Number.isInteger(value)) {
    return `${value}%`;
  }

  return `${value.toFixed(1)}%`;
};
