import { describe, expect, it } from "vitest";

import type { ProviderResult } from "../../director/provider/types.js";
import {
  buildGateReport,
  failCheck,
  passCheck,
} from "../../gauntlet/gates01/report.js";
import { validShallowsManifestFixture } from "../../schemas/fixtures/manifest.js";
import { ENGINE_VERSION, PROTOCOL_VERSION } from "../../schemas/protocol.js";
import { MemoryArtifactFs } from "./fs.js";
import { hashPrompt } from "./hash.js";
import {
  listFloors,
  listRuns,
  loadGenerationChain,
  readRunIndex,
} from "./read.js";
import { TECH_SPEC_STAMP_FIELDS, type RunGenerationIndex } from "./types.js";
import {
  GenerationRecordExistsError,
  writeGenerationRecord,
} from "./write.js";

const RUN_ID = "run-artifact-test";
const SEED = "artifact-seed";
const CREATED_AT = "2026-06-12T00:00:00.000Z";
const RECORDED_AT = "2026-06-12T00:01:00.000Z";
const MODEL_ID = "mock";

const successProviderResult = (raw = JSON.stringify(validShallowsManifestFixture)): ProviderResult => ({
  ok: true,
  raw,
  manifest: validShallowsManifestFixture,
  usage: {
    latencyMs: 42,
    tokens: {
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
    },
  },
});

const failureProviderResult = (): ProviderResult => ({
  ok: false,
  raw: "{not-json",
  error: {
    code: "parse_fail",
    message: "invalid JSON",
  },
  usage: {
    latencyMs: 17,
    tokens: null,
  },
});

const sampleInput = (depth: number) => ({
  runId: RUN_ID,
  depth,
  seed: SEED,
  modelId: MODEL_ID,
  createdAt: CREATED_AT,
  recordedAt: RECORDED_AT,
  attempts: [
    {
      prompt: "generate floor 1",
      providerResult: failureProviderResult(),
      gateReports: {
        gate0: buildGateReport(0, [
          failCheck("G0_INVALID_JSON", "malformed output"),
        ]),
      },
    },
    {
      prompt: "repair floor 1",
      providerResult: successProviderResult(),
      gateReports: {
        gate0: buildGateReport(0, [passCheck("G0_SCHEMA", "valid schema")]),
        gate1: buildGateReport(1, [
          passCheck("G1_REF_INTEGRITY", "refs intact"),
        ]),
      },
    },
  ],
  outcome: {
    kind: "manifest" as const,
    manifestPath: "runs/ignored/placeholder.json",
  },
});

const writeSample = (
  fs: MemoryArtifactFs,
  depth: number,
  recordedAt = RECORDED_AT,
) => {
  const input = sampleInput(depth);
  const servedManifestPath = `runs/${RUN_ID}/floors/${depth}/attempts/1/manifest.json`;
  return writeGenerationRecord(
    {
      ...input,
      recordedAt,
      outcome: {
        kind: "manifest",
        manifestPath: servedManifestPath,
      },
    },
    { fs, rootDir: "runs" },
  );
};

const assertStampComplete = (
  value: Record<string, unknown>,
  label: string,
): void => {
  for (const field of TECH_SPEC_STAMP_FIELDS) {
    expect(value[field], `${label}.${field}`).toBeDefined();
    expect(typeof value[field], `${label}.${field} type`).toBe("string");
    expect((value[field] as string).length, `${label}.${field} length`).toBeGreaterThan(0);
  }
};

describe("generation artifact persistence", () => {
  it("round-trips a full attempt chain losslessly", () => {
    const fs = new MemoryArtifactFs();
    const written = writeSample(fs, 1);
    const loaded = loadGenerationChain(RUN_ID, 1, { fs, rootDir: "runs" });

    expect(loaded).toEqual(written);
    expect(loaded.attempts).toHaveLength(2);
    expect(loaded.attempts[0]?.promptHash).toBe(hashPrompt("generate floor 1"));
    expect(loaded.attempts[1]?.provider.ok).toBe(true);
    expect(loaded.outcome).toEqual({
      kind: "manifest",
      manifestPath: "floors/1/attempts/1/manifest.json",
    });

    const raw = fs.readFile(`runs/${RUN_ID}/floors/1/attempts/0/raw.txt`);
    expect(raw).toBe("{not-json");
    const manifest = JSON.parse(
      fs.readFile(`runs/${RUN_ID}/floors/1/attempts/1/manifest.json`),
    );
    expect(manifest).toEqual(validShallowsManifestFixture);
  });

  it("refuses to overwrite an existing generation record", () => {
    const fs = new MemoryArtifactFs();
    writeSample(fs, 2);

    expect(() => writeSample(fs, 2)).toThrow(GenerationRecordExistsError);
    expect(() => writeSample(fs, 2)).toThrow(
      /generation record already exists/,
    );
  });

  it("keeps the run index consistent after multiple floors", () => {
    const fs = new MemoryArtifactFs();
    writeSample(fs, 1, "2026-06-12T00:01:00.000Z");
    writeSample(fs, 3, "2026-06-12T00:02:00.000Z");

    const index = readRunIndex(RUN_ID, { fs, rootDir: "runs" });
    expect(index.floors.map((entry) => entry.depth)).toEqual([1, 3]);
    expect(index.updatedAt).toBe("2026-06-12T00:02:00.000Z");

    const floors = listFloors(RUN_ID, { fs, rootDir: "runs" });
    expect(floors.map((entry) => entry.outcome.kind)).toEqual([
      "manifest",
      "manifest",
    ]);
  });

  it("carries the complete TECH_SPEC §5 stamp set on records and index", () => {
    const fs = new MemoryArtifactFs();
    const record = writeSample(fs, 4);
    const index = readRunIndex(RUN_ID, { fs, rootDir: "runs" });

    assertStampComplete(record as unknown as Record<string, unknown>, "record");
    assertStampComplete(index as unknown as Record<string, unknown>, "index");
    expect(record.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(record.engineVersion).toBe(ENGINE_VERSION);
    expect(record.modelId).toBe(MODEL_ID);
    expect(record.seed).toBe(SEED);
    expect(record.createdAt).toBe(CREATED_AT);
  });

  it("lists runs and floors from the index without scanning generation bodies", () => {
    const fs = new MemoryArtifactFs();
    writeSample(fs, 5, "2026-06-12T00:03:00.000Z");

    const generationPath = `runs/${RUN_ID}/floors/5/generation.json`;
    fs.files.delete(generationPath);

    const runs = listRuns({ fs, rootDir: "runs" });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.runId).toBe(RUN_ID);
    expect(runs[0]?.floorCount).toBe(1);

    const floors = listFloors(RUN_ID, { fs, rootDir: "runs" });
    expect(floors).toHaveLength(1);
    expect(floors[0]?.depth).toBe(5);
    expect(floors[0]?.recordPath).toBe("floors/5/generation.json");

    expect(() => loadGenerationChain(RUN_ID, 5, { fs, rootDir: "runs" })).toThrow(
      /generation record missing/,
    );
  });

  it("records fallback outcomes in the index summary", () => {
    const fs = new MemoryArtifactFs();
    writeGenerationRecord(
      {
        runId: RUN_ID,
        depth: 7,
        seed: SEED,
        modelId: "ambient-codex",
        createdAt: CREATED_AT,
        recordedAt: "2026-06-12T00:04:00.000Z",
        attempts: [
          {
            prompt: "timeout attempt",
            providerResult: {
              ok: false,
              error: {
                code: "timeout",
                message: "provider timed out",
              },
              usage: { latencyMs: 120_000, tokens: null },
            },
          },
        ],
        outcome: {
          kind: "fallback",
          fallbackId: "fallback:old-stock:shallows-3",
        },
      },
      { fs, rootDir: "runs" },
    );

    const record = loadGenerationChain(RUN_ID, 7, { fs, rootDir: "runs" });
    expect(record.outcome).toEqual({
      kind: "fallback",
      fallbackId: "fallback:old-stock:shallows-3",
    });
    expect(record.modelId).toBe("ambient-codex");

    const index = readRunIndex(RUN_ID, { fs, rootDir: "runs" }) as RunGenerationIndex;
    const floor = index.floors.find((entry) => entry.depth === 7);
    expect(floor?.outcome).toEqual({
      kind: "fallback",
      fallbackId: "fallback:old-stock:shallows-3",
    });
  });
});
