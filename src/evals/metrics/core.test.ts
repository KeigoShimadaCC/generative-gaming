import { describe, expect, it } from "vitest";

import type { ProviderTokenUsage } from "../../director/provider/types.js";
import type { Gate2Report } from "../../gauntlet/gate2/judge.js";
import type { GateReport } from "../../gauntlet/gates01/report.js";
import { MemoryArtifactFs } from "../../harness/artifacts/fs.js";
import type {
  GenerationAttemptRecord,
  GenerationRecord,
  RunGenerationIndex,
} from "../../harness/artifacts/types.js";
import type { DepthBand } from "../../schemas/entities/index.js";
import { ENGINE_VERSION, PROTOCOL_VERSION } from "../../schemas/protocol.js";
import {
  EVAL_METRIC_VERSION,
  scoreGenerationRecord,
  scoreGenerationRecords,
  scoreRunGenerationArtifacts,
} from "./core.js";

const RUN_ID = "run-metrics";
const MODEL_ID = "mock-metrics";
const CREATED_AT = "2026-06-12T00:00:00.000Z";
const RECORDED_AT = "2026-06-12T00:01:00.000Z";

const BAND_TARGETS: Readonly<
  Record<
    DepthBand,
    {
      readonly clearRateMinPercent: number;
      readonly medianHpRetentionPercent: {
        readonly min: number;
        readonly max: number;
      };
    }
  >
> = {
  shallows: {
    clearRateMinPercent: 95,
    medianHpRetentionPercent: { min: 55, max: 90 },
  },
  middle: {
    clearRateMinPercent: 85,
    medianHpRetentionPercent: { min: 30, max: 75 },
  },
  lowest: {
    clearRateMinPercent: 70,
    medianHpRetentionPercent: { min: 15, max: 60 },
  },
};

describe("core eval metric scoring", () => {
  it("scores per-generation metrics from embedded generation records", () => {
    const scores = fixtureRecords().map(scoreGenerationRecord);

    expect(
      scores.map((score) => ({
        depth: score.depth,
        band: score.band,
        validity: score.validity,
        solvability: score.solvability,
        servedWithoutFallback: score.servedWithoutFallback,
        fallback: score.fallback,
        repairCount: score.repairCount,
        latencyMs: score.latencyMs,
        tokens: score.tokens,
        hpRetentionRecorded: score.advisoryFlags.hpRetentionRecorded,
        failedAdvisoryCodes: score.advisoryFlags.failedAdvisoryCodes,
        bandAccurate: score.bandAccuracy?.accurate ?? null,
      })),
    ).toEqual([
      {
        depth: 1,
        band: "shallows",
        validity: true,
        solvability: true,
        servedWithoutFallback: true,
        fallback: false,
        repairCount: 0,
        latencyMs: 100,
        tokens: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        hpRetentionRecorded: true,
        failedAdvisoryCodes: [],
        bandAccurate: true,
      },
      {
        depth: 6,
        band: "middle",
        validity: false,
        solvability: true,
        servedWithoutFallback: true,
        fallback: false,
        repairCount: 1,
        latencyMs: 100,
        tokens: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
        hpRetentionRecorded: true,
        failedAdvisoryCodes: ["G2_HP_RETENTION"],
        bandAccurate: false,
      },
      {
        depth: 10,
        band: "lowest",
        validity: true,
        solvability: false,
        servedWithoutFallback: false,
        fallback: true,
        repairCount: 0,
        latencyMs: 300,
        tokens: { inputTokens: 30, outputTokens: 40, totalTokens: 70 },
        hpRetentionRecorded: true,
        failedAdvisoryCodes: [],
        bandAccurate: false,
      },
      {
        depth: 3,
        band: "shallows",
        validity: false,
        solvability: false,
        servedWithoutFallback: false,
        fallback: true,
        repairCount: 0,
        latencyMs: 50,
        tokens: null,
        hpRetentionRecorded: false,
        failedAdvisoryCodes: [],
        bandAccurate: null,
      },
    ]);
  });

  it("aggregates known fixture scores with hand-computed arithmetic", () => {
    const report = scoreGenerationRecords(fixtureRecords(), {
      comparability: { candidateId: "fixture-set-a" },
    });

    expect(report.recordType).toBe("eval-scores");
    expect(report.metricVersion).toBe(EVAL_METRIC_VERSION);
    expect(report.recordCount).toBe(4);
    expect(report.comparability).toEqual({ candidateId: "fixture-set-a" });

    // Hand arithmetic over 4 records:
    // validity: records 1 and 3 pass -> 2 / 4 = 50%.
    // solvability: records 1 and 2 pass Gate 2 blocking checks -> 2 / 4 = 50%.
    // served: records 1 and 2 avoid fallback -> 2 / 4 = 50%.
    // fallback: records 3 and 4 fall back -> 2 / 4 = 50%.
    expect(report.summary.rates).toEqual({
      validity: { count: 4, passed: 2, percent: 50 },
      solvability: { count: 4, passed: 2, percent: 50 },
      servedWithoutFallback: { count: 4, passed: 2, percent: 50 },
      fallback: { count: 4, passed: 2, percent: 50 },
      bandAccuracy: { count: 3, passed: 1, percent: (1 / 3) * 100 },
    });

    // Latency sums all provider attempts per record:
    // [100, 40 + 60, 300, 50] -> sorted [50, 100, 100, 300].
    // min 50, p50 (100 + 100) / 2 = 100, avg 550 / 4 = 137.5, max 300.
    expect(report.summary.latencyMs).toEqual({
      count: 4,
      min: 50,
      p50: 100,
      avg: 137.5,
      max: 300,
    });

    // Repairs are attemptCount - 1: [0, 1, 0, 0] -> 0 repairs: 3, 1 repair: 1.
    expect(report.summary.repairDistribution).toEqual({
      zero: 3,
      one: 1,
      two: 0,
      threeOrMore: 0,
      byRepairCount: [
        { repairCount: 0, count: 3 },
        { repairCount: 1, count: 1 },
      ],
    });

    // Token totals ignore the no-token fallback record:
    // input 10 + 5 + 30 = 45; output 20 + 7 + 40 = 67; total 30 + 12 + 70 = 112.
    expect(report.summary.tokens).toEqual({
      recordCountWithTokens: 3,
      totals: { inputTokens: 45, outputTokens: 67, totalTokens: 112 },
      averagePerRecordWithTokens: {
        inputTokens: 15,
        outputTokens: 67 / 3,
        totalTokens: 112 / 3,
      },
    });
  });

  it("breaks aggregates down per difficulty band", () => {
    const report = scoreGenerationRecords(fixtureRecords());

    // Shallows records are depths 1 and 3:
    // validity/solvability/served/fallback are each 1 / 2 = 50%.
    // Only depth 1 has Gate 2 band data, and it is accurate -> 1 / 1 = 100%.
    expect(report.summary.byBand.shallows.count).toBe(2);
    expect(report.summary.byBand.shallows.rates).toEqual({
      validity: { count: 2, passed: 1, percent: 50 },
      solvability: { count: 2, passed: 1, percent: 50 },
      servedWithoutFallback: { count: 2, passed: 1, percent: 50 },
      fallback: { count: 2, passed: 1, percent: 50 },
      bandAccuracy: { count: 1, passed: 1, percent: 100 },
    });
    expect(report.summary.byBand.shallows.latencyMs).toEqual({
      count: 2,
      min: 50,
      p50: 75,
      avg: 75,
      max: 100,
    });

    // Middle has one repaired, served record whose HP retention is above target.
    expect(report.summary.byBand.middle.count).toBe(1);
    expect(report.summary.byBand.middle.rates.bandAccuracy).toEqual({
      count: 1,
      passed: 0,
      percent: 0,
    });
    expect(report.summary.byBand.middle.repairDistribution).toEqual({
      zero: 0,
      one: 1,
      two: 0,
      threeOrMore: 0,
      byRepairCount: [{ repairCount: 1, count: 1 }],
    });

    // Lowest has one fallback after a blocking Gate 2 clear-rate reject.
    expect(report.summary.byBand.lowest.count).toBe(1);
    expect(report.summary.byBand.lowest.rates.solvability).toEqual({
      count: 1,
      passed: 0,
      percent: 0,
    });
    expect(report.summary.byBand.lowest.rates.fallback).toEqual({
      count: 1,
      passed: 1,
      percent: 100,
    });
  });

  it("is deterministic and does not mutate input records", () => {
    const records = fixtureRecords();
    const before = JSON.parse(JSON.stringify(records)) as typeof records;

    expect(scoreGenerationRecords(records)).toEqual(scoreGenerationRecords(records));
    expect(JSON.parse(JSON.stringify(records))).toEqual(before);
  });

  it("can score records loaded through the artifact reader without fs writes", () => {
    const fs = new MemoryArtifactFs();
    const records = fixtureRecords().slice(0, 2);
    const index: RunGenerationIndex = {
      recordType: "generation-index",
      protocolVersion: PROTOCOL_VERSION,
      engineVersion: ENGINE_VERSION,
      modelId: MODEL_ID,
      seed: "metrics-seed",
      createdAt: CREATED_AT,
      runId: RUN_ID,
      updatedAt: RECORDED_AT,
      floors: records.map((record) => ({
        depth: record.depth,
        recordPath: `floors/${record.depth}/generation.json`,
        outcome:
          record.outcome.kind === "manifest"
            ? { kind: "manifest" }
            : { kind: "fallback", fallbackId: record.outcome.fallbackId },
        recordedAt: RECORDED_AT,
      })),
    };

    fs.files.set(`runs/${RUN_ID}/index.json`, `${JSON.stringify(index)}\n`);
    for (const record of records) {
      fs.files.set(
        `runs/${RUN_ID}/floors/${record.depth}/generation.json`,
        `${JSON.stringify(record)}\n`,
      );
    }
    const filesBefore = new Map(fs.files);
    const dirsBefore = new Set(fs.dirs);

    const report = scoreRunGenerationArtifacts(RUN_ID, {
      fs,
      rootDir: "runs",
      comparability: { candidateId: "reader-fixture" },
    });

    expect(report.recordCount).toBe(2);
    expect(report.generations.map((score) => score.depth)).toEqual([1, 6]);
    expect(report.comparability).toEqual({ candidateId: "reader-fixture" });
    expect(fs.files).toEqual(filesBefore);
    expect(fs.dirs).toEqual(dirsBefore);
  });
});

const fixtureRecords = (): readonly GenerationRecord[] => [
  generationRecord({
    depth: 1,
    attempts: [
      attempt({
        depth: 1,
        attemptIndex: 0,
        ok: true,
        latencyMs: 100,
        tokens: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        gate0: true,
        gate1: true,
        gate2: gate2Report({
          band: "shallows",
          clearRatePercent: 100,
          medianHpRetentionPercent: 60,
        }),
      }),
    ],
    outcome: manifestOutcome(1, 0),
  }),
  generationRecord({
    depth: 6,
    attempts: [
      attempt({
        depth: 6,
        attemptIndex: 0,
        ok: false,
        latencyMs: 40,
        tokens: null,
        gate0: false,
      }),
      attempt({
        depth: 6,
        attemptIndex: 1,
        ok: true,
        latencyMs: 60,
        tokens: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
        gate0: true,
        gate1: true,
        gate2: gate2Report({
          band: "middle",
          clearRatePercent: 90,
          medianHpRetentionPercent: 80,
        }),
      }),
    ],
    outcome: manifestOutcome(6, 1),
  }),
  generationRecord({
    depth: 10,
    attempts: [
      attempt({
        depth: 10,
        attemptIndex: 0,
        ok: true,
        latencyMs: 300,
        tokens: { inputTokens: 30, outputTokens: 40, totalTokens: 70 },
        gate0: true,
        gate1: true,
        gate2: gate2Report({
          band: "lowest",
          clearRatePercent: 35,
          medianHpRetentionPercent: 20,
          blockingCodes: ["G2_HARD_CLEAR_RATE", "G2_CLEAR_RATE"],
        }),
      }),
    ],
    outcome: {
      kind: "fallback",
      fallbackId: "fallback:old-stock:lowest-10",
    },
  }),
  generationRecord({
    depth: 3,
    attempts: [
      attempt({
        depth: 3,
        attemptIndex: 0,
        ok: false,
        latencyMs: 50,
        tokens: null,
        gate0: false,
      }),
    ],
    outcome: {
      kind: "fallback",
      fallbackId: "fallback:old-stock:shallows-3",
    },
  }),
];

const generationRecord = (input: {
  readonly depth: number;
  readonly attempts: readonly GenerationAttemptRecord[];
  readonly outcome: GenerationRecord["outcome"];
}): GenerationRecord => ({
  recordType: "generation",
  protocolVersion: PROTOCOL_VERSION,
  engineVersion: ENGINE_VERSION,
  modelId: MODEL_ID,
  seed: `seed-${input.depth}`,
  createdAt: CREATED_AT,
  runId: RUN_ID,
  depth: input.depth,
  attempts: input.attempts,
  outcome: input.outcome,
});

const attempt = (input: {
  readonly depth: number;
  readonly attemptIndex: number;
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly tokens: ProviderTokenUsage | null;
  readonly gate0?: boolean;
  readonly gate1?: boolean;
  readonly gate2?: Gate2Report;
}): GenerationAttemptRecord => ({
  attemptIndex: input.attemptIndex,
  promptHash: `prompt-${input.depth}-${input.attemptIndex}`,
  rawOutputPath: `floors/${input.depth}/attempts/${input.attemptIndex}/raw.txt`,
  provider: {
    ok: input.ok,
    usage: { latencyMs: input.latencyMs, tokens: input.tokens },
    ...(input.ok
      ? { manifestPath: manifestPath(input.depth, input.attemptIndex) }
      : {
          error: {
            code: "parse_fail",
            message: "fixture provider failure",
          },
        }),
  },
  gateReports: {
    ...(input.gate0 === undefined ? {} : { gate0: gateReport(0, input.gate0) }),
    ...(input.gate1 === undefined ? {} : { gate1: gateReport(1, input.gate1) }),
    ...(input.gate2 === undefined ? {} : { gate2: input.gate2 }),
  },
});

const gateReport = (gate: 0 | 1, pass: boolean): GateReport => ({
  gate,
  pass,
  checks: [
    {
      code:
        gate === 0
          ? pass
            ? "G0_SCHEMA"
            : "G0_INVALID_JSON"
          : "G1_REF_INTEGRITY",
      pass,
      detail: "fixture gate result",
    },
  ],
});

const gate2Report = (input: {
  readonly band: DepthBand;
  readonly clearRatePercent: number;
  readonly medianHpRetentionPercent: number;
  readonly blockingCodes?: Gate2Report["verdict"]["codes"];
}): Gate2Report => {
  const target = BAND_TARGETS[input.band];
  const clearRatePass =
    input.clearRatePercent >= target.clearRateMinPercent;
  const hpRetentionPass =
    input.medianHpRetentionPercent >=
      target.medianHpRetentionPercent.min &&
    input.medianHpRetentionPercent <= target.medianHpRetentionPercent.max;
  const blockingCodes = input.blockingCodes ?? [];

  return {
    gate: 2,
    pass: blockingCodes.length === 0,
    verdict: {
      status: blockingCodes.length === 0 ? "pass" : "reject",
      codes: blockingCodes,
    },
    checks: [
      {
        code: "G2_CLEAR_RATE",
        pass: clearRatePass,
        detail: "fixture clear-rate check",
      },
      ...(blockingCodes.includes("G2_HARD_CLEAR_RATE")
        ? [
            {
              code: "G2_HARD_CLEAR_RATE" as const,
              pass: false,
              detail: "fixture hard clear-rate check",
            },
          ]
        : []),
      {
        code: "G2_HP_RETENTION",
        pass: hpRetentionPass,
        advisory: true,
        detail: "fixture HP-retention check",
      },
    ],
    metrics: {
      totalRuns: 100,
      clearCount: input.clearRatePercent,
      reachedStairsCount: input.clearRatePercent,
      questCompletedCount: input.clearRatePercent,
      deathCount: 0,
      clearRatePercent: input.clearRatePercent,
      medianHpRetentionPercent: input.medianHpRetentionPercent,
      minTurns: 10,
      maxTurns: 20,
    },
    candidate: {
      seed: `candidate-${input.band}`,
      stairsReachable: true,
      pathLength: 12,
      hasThreatOnPath: true,
      placementDeviationCount: 0,
    },
    ensemble: {
      policies: ["cautious"],
      seeds: ["fixture-gate2-seed"],
      maxTurns: 800,
    },
    elapsedMs: 1,
    wallClockBudgetMs: 8_000,
  };
};

const manifestOutcome = (
  depth: number,
  attemptIndex: number,
): GenerationRecord["outcome"] => ({
  kind: "manifest",
  manifestPath: manifestPath(depth, attemptIndex),
});

const manifestPath = (depth: number, attemptIndex: number): string =>
  `floors/${depth}/attempts/${attemptIndex}/manifest.json`;
