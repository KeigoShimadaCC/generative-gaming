import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  compareReports,
  type EvalComparisonRow,
  type EvalReport,
} from "../../src/evals/runner/report.js";

type ThresholdSpec = {
  readonly percent?: number;
  readonly ms?: number;
};

type ThresholdConfig = {
  readonly default: ThresholdSpec;
  readonly [metric: string]: ThresholdSpec | string | undefined;
};

const baselinePath =
  process.argv[2] ?? "tests/eval-baselines/mock-baseline.json";
const candidatePath =
  process.argv[3] ?? "runs/evals/ci-mock-baseline/report.json";
const thresholdsPath =
  process.argv[4] ?? "tests/eval-baselines/thresholds.json";

const readReport = (path: string): EvalReport => {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as Record<
    string,
    unknown
  >;
  const { _baseline: _ignored, ...report } = raw;
  return report as EvalReport;
};

const readThresholds = (path: string): ThresholdConfig => {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as ThresholdConfig;
  const { _comment: _ignored, ...thresholds } = raw;
  return thresholds as ThresholdConfig;
};

const toleranceFor = (
  thresholds: ThresholdConfig,
  metric: string,
  unit: EvalComparisonRow["unit"],
): number => {
  const spec = thresholds[metric] ?? thresholds.default;
  if (typeof spec === "string") {
    return unit === "percent" ? thresholds.default.percent ?? 0 : thresholds.default.ms ?? 0;
  }

  if (unit === "percent") {
    return spec.percent ?? thresholds.default.percent ?? 0;
  }

  return spec.ms ?? thresholds.default.ms ?? 0;
};

const exceedsTolerance = (
  row: EvalComparisonRow,
  thresholds: ThresholdConfig,
): boolean => {
  if (!row.regression) {
    return false;
  }

  return Math.abs(row.delta) > toleranceFor(thresholds, row.metric, row.unit);
};

const main = (): void => {
  const baseline = readReport(baselinePath);
  const candidate = readReport(candidatePath);
  const thresholds = readThresholds(thresholdsPath);
  const comparison = compareReports(baseline, candidate);
  const failures = comparison.rows.filter((row) =>
    exceedsTolerance(row, thresholds),
  );

  if (candidate.status !== "complete") {
    process.stderr.write(
      `eval threshold check failed: candidate status is ${candidate.status}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (candidate.overall.recordCount !== baseline.overall.recordCount) {
    process.stderr.write(
      `eval threshold check failed: record count ${candidate.overall.recordCount} != baseline ${baseline.overall.recordCount}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (failures.length > 0) {
    process.stderr.write("eval threshold check failed — regressions beyond tolerance:\n");
    for (const row of failures) {
      const tol = toleranceFor(thresholds, row.metric, row.unit);
      const unit = row.unit === "percent" ? "%" : "ms";
      process.stderr.write(
        `  ${row.segment}/${row.metric}: ${row.baseline}${unit} -> ${row.candidate}${unit} (delta ${row.delta}${unit}, tolerance ${tol}${unit})\n`,
      );
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `eval threshold check passed (${comparison.rows.length} metrics compared, 0 regressions beyond tolerance)\n`,
  );
};

main();
