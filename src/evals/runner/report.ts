import type { ArtifactFsAdapter } from "../../harness/artifacts/fs.js";
import { nodeArtifactFsAdapter } from "../../harness/artifacts/fs.js";
import type { GenerationRecord } from "../../harness/artifacts/types.js";
import { loadFallbackContentPack } from "../../harness/content-loader.js";
import type { BehavioralFacts } from "../../director/prompt/summarize.js";
import {
  scoreGenerationRecords,
  type EvalRate,
  type EvalScores,
} from "../metrics/core.js";
import {
  distance as noveltyDistance,
  type NoveltyDistanceResult,
} from "../metrics/novelty.js";
import {
  responsivenessMatrix,
  serializeDetectorProposal,
  type ResponsivenessDetectorProposalEntry,
  type ResponsivenessMatrix,
} from "../metrics/responsiveness.js";
import type { PersonaBankSeed, PersonaName } from "../personas/types.js";
import type { DepthBand } from "../../schemas/entities/index.js";
import {
  parseManifest,
  type FloorManifest,
} from "../../schemas/manifest.js";

export const EVAL_REPORT_VERSION = "phase-41-eval-report-v1" as const;

export type EvalProviderMode = "mock" | "ambient";
export type EvalRunStatus = "complete" | "partial";

export type EvalConfigSnapshot = {
  readonly evalId: string;
  readonly rootDir: string;
  readonly n: number;
  readonly maxCalls: number;
  readonly cells: readonly EvalCellConfigSnapshot[];
};

export type EvalCellConfigSnapshot = {
  readonly persona: PersonaName;
  readonly band: DepthBand;
  readonly depth: number;
};

export type EvalProviderSnapshot = {
  readonly mode: EvalProviderMode;
  readonly modelId: string;
};

export type EvalBankSnapshot = {
  readonly version: string;
  readonly fixtures: readonly EvalBankFixtureSnapshot[];
};

export type EvalBankFixtureSnapshot = {
  readonly persona: PersonaName;
  readonly seed: PersonaBankSeed;
  readonly relativePath: string;
};

export type EvalMetricInput = {
  readonly manifest: FloorManifest | null;
  readonly traceFacts: BehavioralFacts;
};

export type EvalUnscoredThesisReason = "fallback" | "no-manifest";

export type EvalThesisMetric<TMetrics extends object> =
  | ({ readonly scored: true } & TMetrics)
  | {
      readonly scored: false;
      readonly reason: EvalUnscoredThesisReason;
    };

export type EvalGenerationThesisScore = {
  readonly generationIndex: number;
  readonly novelty: EvalThesisMetric<NoveltyDistanceResult>;
  readonly responsiveness: EvalThesisMetric<ResponsivenessMatrix>;
};

export type EvalThesisSummary = {
  readonly novelty: {
    readonly averageScore: number;
    readonly nearDuplicateCount: number;
    readonly sampleCount: number;
  };
  readonly responsiveness: {
    readonly samePersonaHitRate: number;
    readonly crossPersonaHitRate: number;
    readonly sampleCount: number;
  };
  readonly detectorProposal: readonly ResponsivenessDetectorProposalEntry[];
};

export type EvalCellRun = EvalCellConfigSnapshot & {
  readonly cellId: string;
  readonly generationRunIds: readonly string[];
  readonly bankSeeds: readonly PersonaBankSeed[];
  readonly records: readonly GenerationRecord[];
  readonly metricInputs?: readonly EvalMetricInput[];
};

export type EvalCellReport = Omit<EvalCellRun, "records" | "metricInputs"> & {
  readonly scores: EvalScores;
  readonly thesis: {
    readonly generations: readonly EvalGenerationThesisScore[];
    readonly summary: EvalThesisSummary;
  };
};

export type EvalReport = {
  readonly recordType: "eval-report";
  readonly reportVersion: typeof EVAL_REPORT_VERSION;
  readonly evalId: string;
  readonly status: EvalRunStatus;
  readonly partialReason?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly config: EvalConfigSnapshot;
  readonly provider: EvalProviderSnapshot;
  readonly bank: EvalBankSnapshot;
  readonly git: {
    readonly rev: string;
  };
  readonly calls: {
    readonly attempted: number;
    readonly completed: number;
    readonly cap: number;
  };
  readonly cells: readonly EvalCellReport[];
  readonly overall: EvalScores;
  readonly thesis: EvalThesisSummary;
};

export type WriteEvalReportOptions = {
  readonly rootDir?: string;
  readonly fs?: ArtifactFsAdapter;
};

export type ComposeEvalReportInput = {
  readonly evalId: string;
  readonly status: EvalRunStatus;
  readonly partialReason?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly config: EvalConfigSnapshot;
  readonly provider: EvalProviderSnapshot;
  readonly bank: EvalBankSnapshot;
  readonly gitRev: string;
  readonly calls: EvalReport["calls"];
  readonly cells: readonly EvalCellRun[];
};

export type EvalComparison = {
  readonly recordType: "eval-comparison";
  readonly baselineEvalId: string;
  readonly candidateEvalId: string;
  readonly rows: readonly EvalComparisonRow[];
  readonly markdown: string;
};

export type EvalComparisonRow = {
  readonly segment: string;
  readonly metric: string;
  readonly unit: "percent" | "ms";
  readonly baseline: number;
  readonly candidate: number;
  readonly delta: number;
  readonly regression: boolean;
};

const RATE_METRICS = [
  "validity",
  "solvability",
  "servedWithoutFallback",
  "fallback",
  "bandAccuracy",
] as const;

type RateMetric = (typeof RATE_METRICS)[number];

export const composeEvalReport = (
  input: ComposeEvalReportInput,
): EvalReport => {
  const fallbackPack = loadFallbackContentPack();
  const cells = input.cells.map((cell) => {
    const thesis = scoreCellThesisMetrics(cell, fallbackPack);

    return {
      cellId: cell.cellId,
      persona: cell.persona,
      band: cell.band,
      depth: cell.depth,
      generationRunIds: cell.generationRunIds,
      bankSeeds: cell.bankSeeds,
      scores: scoreGenerationRecords(cell.records, {
        comparability: { segmentId: cell.cellId },
      }),
      thesis,
    };
  });
  const records = input.cells.flatMap((cell) => [...cell.records]);
  const thesis = aggregateThesisSummaries(cells.map((cell) => cell.thesis.summary));

  return {
    recordType: "eval-report",
    reportVersion: EVAL_REPORT_VERSION,
    evalId: input.evalId,
    status: input.status,
    ...(input.partialReason === undefined
      ? {}
      : { partialReason: input.partialReason }),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    config: input.config,
    provider: input.provider,
    bank: input.bank,
    git: { rev: input.gitRev },
    calls: input.calls,
    cells,
    overall: scoreGenerationRecords(records, {
      comparability: { candidateId: input.evalId },
    }),
    thesis,
  };
};

export const manifestFromGenerationRecord = (
  record: GenerationRecord,
  options: {
    readonly rootDir: string;
    readonly fs: ArtifactFsAdapter;
  },
): FloorManifest | null => {
  if (record.outcome.kind !== "manifest") {
    return null;
  }

  const manifestPath = `${trimTrailingSlash(options.rootDir)}/${record.runId}/${record.outcome.manifestPath}`;
  if (!options.fs.fileExists(manifestPath)) {
    return null;
  }

  const parsed = parseManifest(options.fs.readFile(manifestPath));
  return parsed.ok ? parsed.manifest : null;
};

export const scoreCellThesisMetrics = (
  cell: EvalCellRun,
  fallbackPack = loadFallbackContentPack(),
): EvalCellReport["thesis"] => {
  const inputs =
    cell.metricInputs ??
    cell.records.map(() => ({
      manifest: null,
      traceFacts: emptyTraceFacts(),
    }));
  const recentManifests: FloorManifest[] = [];
  const generations: EvalGenerationThesisScore[] = [];

  for (const [generationIndex, input] of inputs.entries()) {
    const manifest = input.manifest;
    const unscoredReason =
      manifest === null
        ? unscoredThesisReason(cell.records[generationIndex])
        : null;
    const novelty: EvalThesisMetric<NoveltyDistanceResult> =
      manifest === null
        ? {
            scored: false,
            reason: unscoredReason ?? "no-manifest",
          }
        : {
            scored: true,
            ...noveltyDistance(manifest, {
              fallbackPack,
              recentManifests: [...recentManifests],
            }),
          };
    const responsiveness: EvalThesisMetric<ResponsivenessMatrix> =
      manifest === null
        ? {
            scored: false,
            reason: unscoredReason ?? "no-manifest",
          }
        : {
            scored: true,
            ...responsivenessMatrix(manifest, input.traceFacts, cell.persona),
          };

    if (manifest !== null) {
      recentManifests.push(manifest);
    }

    generations.push({
      generationIndex,
      novelty,
      responsiveness,
    });
  }

  return {
    generations,
    summary: summarizeThesisGenerations(generations, cell.persona),
  };
};

const unscoredThesisReason = (
  record: GenerationRecord | undefined,
): EvalUnscoredThesisReason =>
  record?.outcome.kind === "fallback" ? "fallback" : "no-manifest";

const summarizeThesisGenerations = (
  generations: readonly EvalGenerationThesisScore[],
  persona: PersonaName,
): EvalThesisSummary => {
  const noveltyScores = generations
    .map((generation) =>
      generation.novelty.scored ? generation.novelty.score : null,
    )
    .filter((score): score is number => score !== null);
  const nearDuplicateCount = generations.filter(
    (generation) =>
      generation.novelty.scored && generation.novelty.nearDuplicate,
  ).length;
  const samePersonaRates = generations
    .map((generation) =>
      generation.responsiveness.scored
        ? generation.responsiveness.samePersona.rate
        : null,
    )
    .filter((rate): rate is number => rate !== null);
  const crossPersonaRates = generations.flatMap((generation) => {
    if (!generation.responsiveness.scored) {
      return [];
    }

    return Object.entries(generation.responsiveness.crossPersona)
      .filter(([targetPersona]) => targetPersona !== persona)
      .map(([, hitRate]) => hitRate.rate);
  });

  return {
    novelty: {
      averageScore:
        noveltyScores.length === 0
          ? 0
          : noveltyScores.reduce((sum, score) => sum + score, 0) /
            noveltyScores.length,
      nearDuplicateCount,
      sampleCount: noveltyScores.length,
    },
    responsiveness: {
      samePersonaHitRate:
        samePersonaRates.length === 0
          ? 0
          : samePersonaRates.reduce((sum, rate) => sum + rate, 0) /
            samePersonaRates.length,
      crossPersonaHitRate:
        crossPersonaRates.length === 0
          ? 0
          : crossPersonaRates.reduce((sum, rate) => sum + rate, 0) /
            crossPersonaRates.length,
      sampleCount: samePersonaRates.length,
    },
    detectorProposal: serializeDetectorProposal(),
  };
};

const aggregateThesisSummaries = (
  summaries: readonly EvalThesisSummary[],
): EvalThesisSummary => {
  const noveltyScores = summaries.flatMap((summary) =>
    summary.novelty.sampleCount === 0
      ? []
      : [summary.novelty.averageScore],
  );
  const nearDuplicateCount = summaries.reduce(
    (sum, summary) => sum + summary.novelty.nearDuplicateCount,
    0,
  );
  const samePersonaRates = summaries.flatMap((summary) =>
    summary.responsiveness.sampleCount === 0
      ? []
      : [summary.responsiveness.samePersonaHitRate],
  );
  const crossPersonaRates = summaries.flatMap((summary) =>
    summary.responsiveness.sampleCount === 0
      ? []
      : [summary.responsiveness.crossPersonaHitRate],
  );

  return {
    novelty: {
      averageScore:
        noveltyScores.length === 0
          ? 0
          : noveltyScores.reduce((sum, score) => sum + score, 0) /
            noveltyScores.length,
      nearDuplicateCount,
      sampleCount: summaries.reduce(
        (sum, summary) => sum + summary.novelty.sampleCount,
        0,
      ),
    },
    responsiveness: {
      samePersonaHitRate:
        samePersonaRates.length === 0
          ? 0
          : samePersonaRates.reduce((sum, rate) => sum + rate, 0) /
            samePersonaRates.length,
      crossPersonaHitRate:
        crossPersonaRates.length === 0
          ? 0
          : crossPersonaRates.reduce((sum, rate) => sum + rate, 0) /
            crossPersonaRates.length,
      sampleCount: summaries.reduce(
        (sum, summary) => sum + summary.responsiveness.sampleCount,
        0,
      ),
    },
    detectorProposal: serializeDetectorProposal(),
  };
};

const emptyTraceFacts = (): BehavioralFacts => ({
  combatEngagementRate: 0,
  fightsPicked: 0,
  fightsAvoided: 0,
  retreatCount: 0,
  retreatFrequency: 0,
  itemPickups: 0,
  itemUses: 0,
  itemUsesByCategory: {},
  hoardingSignal: 0,
  npcTalksInitiated: 0,
  explorationRatio: 0,
  cellsVisited: 0,
  floorCellsEstimate: 0,
  closeCallCount: 0,
  killsByEnemyType: {},
  questAccepted: 0,
  questRefused: 0,
  questCompleted: 0,
  totalTurns: 0,
});

export const writeEvalReport = (
  report: EvalReport,
  options: WriteEvalReportOptions = {},
): {
  readonly jsonPath: string;
  readonly markdownPath: string;
} => {
  const rootDir = trimTrailingSlash(options.rootDir ?? "runs/evals");
  const fs = options.fs ?? nodeArtifactFsAdapter;
  const evalDir = `${rootDir}/${report.evalId}`;
  const jsonPath = `${evalDir}/report.json`;
  const markdownPath = `${evalDir}/report.md`;

  fs.makeDir(evalDir);
  fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFile(markdownPath, `${formatEvalReportMarkdown(report)}\n`);

  return { jsonPath, markdownPath };
};

export const formatEvalReportMarkdown = (report: EvalReport): string => [
  `# Eval ${report.evalId}`,
  "",
  `Status: ${report.status}${report.partialReason === undefined ? "" : ` (${report.partialReason})`}`,
  `Provider: ${report.provider.mode} (${report.provider.modelId})`,
  `Git: ${report.git.rev}`,
  `Bank: ${report.bank.version}`,
  `Config: n=${report.config.n}, maxCalls=${report.config.maxCalls}, cells=${report.config.cells.length}`,
  `Calls: ${report.calls.completed}/${report.calls.attempted} completed (cap ${report.calls.cap})`,
  "",
  "## Overall",
  "",
  formatRatesTable(report.overall.summary.rates),
  "",
  `Latency: min ${formatNumber(report.overall.summary.latencyMs.min)}ms, p50 ${formatNumber(report.overall.summary.latencyMs.p50)}ms, avg ${formatNumber(report.overall.summary.latencyMs.avg)}ms, max ${formatNumber(report.overall.summary.latencyMs.max)}ms`,
  "",
  "## Thesis Metrics",
  "",
  "### Novelty",
  "",
  "Distance blends name similarity, enemy stat-vector distance, and behavior/effect composition overlap against the fallback pack plus prior manifests in the run. Score equals distance (higher is fresher); near-duplicate when distance ≤ threshold.",
  "",
  `- Average novelty score: ${formatNumber(report.thesis.novelty.averageScore)}`,
  `- Near-duplicate count: ${report.thesis.novelty.nearDuplicateCount} / ${report.thesis.novelty.sampleCount}`,
  "",
  "### Responsiveness",
  "",
  "Named detectors per persona signature; hit-rate is the fraction of that persona's detectors satisfied by the manifest given trace facts. Cross-persona control expects lower hit-rates off-diagonal.",
  "",
  `- Same-persona hit rate: ${formatPercent(report.thesis.responsiveness.samePersonaHitRate * 100)}`,
  `- Cross-persona hit rate: ${formatPercent(report.thesis.responsiveness.crossPersonaHitRate * 100)}`,
  `- Detector count: ${report.thesis.detectorProposal.length}`,
  "",
  "### Detector Proposal",
  "",
  formatDetectorProposalTable(report.thesis.detectorProposal),
  "",
  "## Cells",
  "",
  "| Cell | Records | Valid | Solvable | Served | Fallback | Band Accurate | Avg Latency | Novelty | Same-Persona | Cross-Persona |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...report.cells.map(formatCellRow),
].join("\n");

export const compareReports = (
  baseline: EvalReport,
  candidate: EvalReport,
): EvalComparison => {
  const rows = [
    ...compareScoreSegments("overall", baseline.overall, candidate.overall),
    ...compareCells(baseline, candidate),
  ];

  return {
    recordType: "eval-comparison",
    baselineEvalId: baseline.evalId,
    candidateEvalId: candidate.evalId,
    rows,
    markdown: formatComparisonMarkdown(rows),
  };
};

const compareCells = (
  baseline: EvalReport,
  candidate: EvalReport,
): readonly EvalComparisonRow[] => {
  const candidateCells = new Map(
    candidate.cells.map((cell) => [cell.cellId, cell]),
  );

  return baseline.cells.flatMap((baselineCell) => {
    const candidateCell = candidateCells.get(baselineCell.cellId);

    if (candidateCell === undefined) {
      return [];
    }

    return compareScoreSegments(
      baselineCell.cellId,
      baselineCell.scores,
      candidateCell.scores,
    );
  });
};

const compareScoreSegments = (
  segment: string,
  baseline: EvalScores,
  candidate: EvalScores,
): readonly EvalComparisonRow[] => [
  ...RATE_METRICS.map((metric) =>
    compareRate(segment, metric, baseline.summary.rates[metric], candidate.summary.rates[metric]),
  ),
  compareLatency(segment, "latency.avg", baseline.summary.latencyMs.avg, candidate.summary.latencyMs.avg),
  compareLatency(segment, "latency.p50", baseline.summary.latencyMs.p50, candidate.summary.latencyMs.p50),
];

const compareRate = (
  segment: string,
  metric: RateMetric,
  baseline: EvalRate,
  candidate: EvalRate,
): EvalComparisonRow => {
  const delta = candidate.percent - baseline.percent;
  const regression =
    metric === "fallback" ? delta > 0 : delta < 0;

  return {
    segment,
    metric,
    unit: "percent",
    baseline: baseline.percent,
    candidate: candidate.percent,
    delta,
    regression,
  };
};

const compareLatency = (
  segment: string,
  metric: string,
  baseline: number,
  candidate: number,
): EvalComparisonRow => {
  const delta = candidate - baseline;

  return {
    segment,
    metric,
    unit: "ms",
    baseline,
    candidate,
    delta,
    regression: delta > 0,
  };
};

const formatRatesTable = (rates: EvalScores["summary"]["rates"]): string => [
  "| Metric | Passed | Count | Percent |",
  "|---|---:|---:|---:|",
  ...RATE_METRICS.map((metric) => {
    const rate = rates[metric];
    return `| ${metric} | ${rate.passed} | ${rate.count} | ${formatNumber(rate.percent)}% |`;
  }),
].join("\n");

const formatDetectorProposalTable = (
  detectors: readonly ResponsivenessDetectorProposalEntry[],
): string => [
  "| Persona | Detector | Uncertain | Definition |",
  "|---|---|---|---|",
  ...detectors.map(
    (detector) =>
      `| ${detector.persona} | ${detector.id} | ${detector.uncertain === true ? "yes" : "no"} | ${escapeMarkdownCell(detector.description)} |`,
  ),
].join("\n");

const formatCellRow = (cell: EvalCellReport): string => {
  const rates = cell.scores.summary.rates;
  const thesisValue = formatCellThesisValue(cell);

  return [
    `| ${cell.cellId}`,
    cell.scores.recordCount,
    formatPercent(rates.validity.percent),
    formatPercent(rates.solvability.percent),
    formatPercent(rates.servedWithoutFallback.percent),
    formatPercent(rates.fallback.percent),
    formatPercent(rates.bandAccuracy.percent),
    `${formatNumber(cell.scores.summary.latencyMs.avg)}ms`,
    thesisValue(
      cell.thesis.summary.novelty.sampleCount,
      formatNumber(cell.thesis.summary.novelty.averageScore),
    ),
    thesisValue(
      cell.thesis.summary.responsiveness.sampleCount,
      formatPercent(cell.thesis.summary.responsiveness.samePersonaHitRate * 100),
    ),
    `${thesisValue(
      cell.thesis.summary.responsiveness.sampleCount,
      formatPercent(cell.thesis.summary.responsiveness.crossPersonaHitRate * 100),
    )} |`,
  ].join(" | ");
};

const formatCellThesisValue =
  (cell: EvalCellReport) =>
  (sampleCount: number, value: string): string =>
    sampleCount === 0 ? `— (${unscoredCellReason(cell)})` : value;

const unscoredCellReason = (cell: EvalCellReport): EvalUnscoredThesisReason => {
  const reasons = cell.thesis.generations.flatMap((generation) => {
    const values: EvalUnscoredThesisReason[] = [];

    if (!generation.novelty.scored) {
      values.push(generation.novelty.reason);
    }
    if (!generation.responsiveness.scored) {
      values.push(generation.responsiveness.reason);
    }

    return values;
  });

  return reasons.includes("fallback") ? "fallback" : "no-manifest";
};

const formatComparisonMarkdown = (
  rows: readonly EvalComparisonRow[],
): string => [
  "| Segment | Metric | Baseline | Candidate | Delta | Regression |",
  "|---|---|---:|---:|---:|---|",
  ...rows.map(
    (row) =>
      `| ${row.segment} | ${row.metric} | ${formatValue(row.baseline, row.unit)} | ${formatValue(row.candidate, row.unit)} | ${formatSignedValue(row.delta, row.unit)} | ${row.regression ? "yes" : "no"} |`,
  ),
].join("\n");

const formatPercent = (value: number): string => `${formatNumber(value)}%`;

const formatValue = (
  value: number,
  unit: EvalComparisonRow["unit"],
): string => `${formatNumber(value)}${unit === "percent" ? "%" : "ms"}`;

const formatSignedValue = (
  value: number,
  unit: EvalComparisonRow["unit"],
): string => {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatValue(value, unit)}`;
};

const formatNumber = (value: number): string => {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2);
};

const escapeMarkdownCell = (value: string): string => value.replace(/\|/gu, "\\|");

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/g, "");
