import { describe, expect, it } from "vitest";

import { createMockDirectorProvider } from "../../director/provider/index.js";
import type { BehavioralFacts } from "../../director/prompt/summarize.js";
import { MemoryArtifactFs } from "../../harness/artifacts/fs.js";
import type { GenerationRecord } from "../../harness/artifacts/types.js";
import { validShallowsManifestFixture } from "../../schemas/fixtures/manifest.js";
import { ENGINE_VERSION, PROTOCOL_VERSION } from "../../schemas/protocol.js";
import {
  composeEvalReport,
  compareReports,
  formatEvalReportMarkdown,
  type EvalReport,
  type EvalRunnerConfig,
  runEvalSuite,
} from "./index.js";

const ROOT_DIR = "runs/evals";
const STARTED_AT = "2026-06-12T00:00:00.000Z";
const COMPLETED_AT = "2026-06-12T00:01:00.000Z";
const GIT_REV = "fixture-git-rev";

describe("eval runner", () => {
  it("runs a 2-persona x 1-band x n=2 mocked matrix and writes complete reports", async () => {
    const fs = new MemoryArtifactFs();
    const result = await runEvalSuite({
      ...baseConfig("runner-complete", fs),
      n: 2,
      maxCalls: 10,
      cells: [
        { persona: "hoarder", band: "shallows", depth: 3 },
        { persona: "pacifist", band: "shallows", depth: 3 },
      ],
    });
    const report = readReport(fs, result.reportJsonPath);

    expect(result.report).toEqual(report);
    expect(fs.files.has(result.reportMarkdownPath)).toBe(true);
    expect(report.recordType).toBe("eval-report");
    expect(report.status).toBe("complete");
    expect(report.provider).toEqual({
      mode: "mock",
      modelId: "director:mock",
    });
    expect(report.git.rev).toBe(GIT_REV);
    expect(report.bank.version).toMatch(/^persona-bank:[a-f0-9]{12}$/u);
    expect(report.config).toMatchObject({
      evalId: "runner-complete",
      rootDir: ROOT_DIR,
      n: 2,
      maxCalls: 10,
    });
    expect(report.calls).toEqual({
      attempted: 4,
      completed: 4,
      cap: 10,
    });
    expect(report.cells.map((cell) => cell.cellId)).toEqual([
      "shallows:hoarder",
      "shallows:pacifist",
    ]);
    expect(report.cells.map((cell) => cell.scores.recordCount)).toEqual([2, 2]);

    // Hand arithmetic over the runner-local mock fixture:
    // four valid manifest records, no fallbacks, one provider attempt each.
    expect(report.overall.recordCount).toBe(4);
    expect(report.overall.summary.rates.validity).toEqual({
      count: 4,
      passed: 4,
      percent: 100,
    });
    expect(report.overall.summary.rates.servedWithoutFallback).toEqual({
      count: 4,
      passed: 4,
      percent: 100,
    });
    expect(report.overall.summary.rates.fallback).toEqual({
      count: 4,
      passed: 0,
      percent: 0,
    });
    // Latencies are [10, 11] for each cell -> sorted [10, 10, 11, 11].
    expect(report.overall.summary.latencyMs).toEqual({
      count: 4,
      min: 10,
      p50: 10.5,
      avg: 10.5,
      max: 11,
    });
    // Token totals are two copies of generation 1 (150) and generation 2 (152).
    expect(report.overall.summary.tokens).toEqual({
      recordCountWithTokens: 4,
      totals: {
        inputTokens: 402,
        outputTokens: 202,
        totalTokens: 604,
      },
      averagePerRecordWithTokens: {
        inputTokens: 100.5,
        outputTokens: 50.5,
        totalTokens: 151,
      },
    });
  });

  it("marks the report partial when the call cap trips in a mocked run", async () => {
    const fs = new MemoryArtifactFs();
    const result = await runEvalSuite({
      ...baseConfig("runner-cap", fs),
      n: 2,
      maxCalls: 1,
      cells: [
        { persona: "hoarder", band: "shallows", depth: 3 },
        { persona: "pacifist", band: "shallows", depth: 3 },
      ],
    });

    expect(result.report.status).toBe("partial");
    expect(result.report.partialReason).toContain("call cap 1 reached");
    expect(result.report.calls).toEqual({
      attempted: 1,
      completed: 1,
      cap: 1,
    });
    expect(result.report.overall.recordCount).toBe(1);
    expect(readReport(fs, result.reportJsonPath).status).toBe("partial");
  });
});

describe("eval report comparison", () => {
  it("computes rate and latency deltas and flags regressions", async () => {
    const baselineFs = new MemoryArtifactFs();
    const candidateFs = new MemoryArtifactFs();
    const baseline = await runEvalSuite({
      ...baseConfig("compare-baseline", baselineFs),
      n: 1,
      cells: [{ persona: "hoarder", band: "shallows", depth: 3 }],
    });
    const candidate = await runEvalSuite({
      ...baseConfig("compare-candidate", candidateFs),
      n: 1,
      cells: [{ persona: "hoarder", band: "shallows", depth: 3 }],
      providerFactory: () =>
        createMockDirectorProvider({
          failureMode: "parse_fail",
          raw: "not json",
          latencyMs: 30,
          tokens: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        }),
    });

    const comparison = compareReports(baseline.report, candidate.report);
    const validity = comparison.rows.find(
      (row) => row.segment === "overall" && row.metric === "validity",
    );
    const latency = comparison.rows.find(
      (row) => row.segment === "overall" && row.metric === "latency.avg",
    );

    expect(validity).toEqual({
      segment: "overall",
      metric: "validity",
      unit: "percent",
      baseline: 100,
      candidate: 0,
      delta: -100,
      regression: true,
    });
    expect(latency).toEqual({
      segment: "overall",
      metric: "latency.avg",
      unit: "ms",
      baseline: 10,
      candidate: 30,
      delta: 20,
      regression: true,
    });
    expect(comparison.markdown).toContain("| overall | validity | 100% | 0% | -100% | yes |");
  });
});

describe("eval report thesis scoring", () => {
  it("tags unscored fallback thesis cells without adding them to aggregates", () => {
    const report = composeEvalReport({
      evalId: "thesis-tagged-fallback",
      status: "complete",
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
      config: {
        evalId: "thesis-tagged-fallback",
        rootDir: ROOT_DIR,
        n: 1,
        maxCalls: 2,
        cells: [
          { persona: "hoarder", band: "shallows", depth: 3 },
          { persona: "pacifist", band: "shallows", depth: 3 },
        ],
      },
      provider: {
        mode: "mock",
        modelId: "director:mock",
      },
      bank: {
        version: "persona-bank:test",
        fixtures: [],
      },
      gitRev: GIT_REV,
      calls: {
        attempted: 2,
        completed: 2,
        cap: 2,
      },
      cells: [
        {
          cellId: "shallows:hoarder",
          persona: "hoarder",
          band: "shallows",
          depth: 3,
          generationRunIds: ["scored-run"],
          bankSeeds: ["persona-bank-1"],
          records: [generationRecord("scored-run", "manifest")],
          metricInputs: [
            {
              manifest: validShallowsManifestFixture,
              traceFacts: emptyFacts(),
            },
          ],
        },
        {
          cellId: "shallows:pacifist",
          persona: "pacifist",
          band: "shallows",
          depth: 3,
          generationRunIds: ["fallback-run"],
          bankSeeds: ["persona-bank-1"],
          records: [generationRecord("fallback-run", "fallback")],
          metricInputs: [
            {
              manifest: null,
              traceFacts: emptyFacts(),
            },
          ],
        },
      ],
    });
    const scoredGeneration = report.cells[0]!.thesis.generations[0]!;
    const fallbackCell = report.cells[1]!;
    const fallbackGeneration = fallbackCell.thesis.generations[0]!;

    expect(scoredGeneration.novelty).toMatchObject({
      scored: true,
      metricVersion: "phase-42-novelty-v1",
    });
    expect(scoredGeneration.responsiveness).toMatchObject({
      scored: true,
      metricVersion: "phase-47-responsiveness-v2",
    });
    expect(fallbackGeneration.novelty).toEqual({
      scored: false,
      reason: "fallback",
    });
    expect(fallbackGeneration.responsiveness).toEqual({
      scored: false,
      reason: "fallback",
    });

    expect(fallbackCell.thesis.summary.novelty.sampleCount).toBe(0);
    expect(fallbackCell.thesis.summary.responsiveness.sampleCount).toBe(0);
    expect(report.thesis.novelty.sampleCount).toBe(1);
    expect(report.thesis.responsiveness.sampleCount).toBe(1);
    expect(formatEvalReportMarkdown(report)).toContain(
      "| shallows:pacifist | 1 | 0% | 0% | 0% | 100% | 0% | 0ms | — (fallback) | — (fallback) | — (fallback) |",
    );
  });
});

const baseConfig = (
  evalId: string,
  fs: MemoryArtifactFs,
): EvalRunnerConfig => ({
  evalId,
  rootDir: ROOT_DIR,
  mode: "mock",
  n: 1,
  maxCalls: 10,
  cells: [{ persona: "hoarder", band: "shallows", depth: 3 }],
  startedAt: STARTED_AT,
  completedAt: COMPLETED_AT,
  gitRev: GIT_REV,
  fs,
});

const readReport = (fs: MemoryArtifactFs, path: string): EvalReport =>
  JSON.parse(fs.readFile(path)) as EvalReport;

const generationRecord = (
  runId: string,
  outcome: GenerationRecord["outcome"]["kind"],
): GenerationRecord => ({
  recordType: "generation",
  protocolVersion: PROTOCOL_VERSION,
  engineVersion: ENGINE_VERSION,
  modelId: "director:mock",
  seed: `${runId}:seed`,
  createdAt: STARTED_AT,
  runId,
  depth: 3,
  attempts: [],
  outcome:
    outcome === "manifest"
      ? { kind: "manifest", manifestPath: "floors/3/attempts/0/manifest.json" }
      : { kind: "fallback", fallbackId: "fallback:old-stock:shallows-3" },
});

const emptyFacts = (): BehavioralFacts => ({
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
