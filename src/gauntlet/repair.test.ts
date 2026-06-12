import { describe, expect, it } from "vitest";

import { bounds, config } from "../config/index.js";
import {
  type DirectorProvider,
  type GenerateManifestOptions,
  type JudgeOptions,
  type JudgeResult,
  type ProviderFailureCode,
  type ProviderResult,
} from "../director/provider/index.js";
import type { FloorContent } from "../engine/run/index.js";
import { MemoryArtifactFs, loadGenerationChain } from "../harness/artifacts/index.js";
import {
  validShallowsManifestFixture,
} from "../schemas/fixtures/manifest.js";
import type { FloorManifest } from "../schemas/manifest.js";
import {
  defaultGate2Config,
  type Gate2Config,
  type Gate2RunOptions,
} from "./gate2/run.js";
import { generateFloor } from "./repair.js";

const ROOT_DIR = "runs";
const DEPTH = validShallowsManifestFixture.depth;
const SEED = "repair-seed";
const CREATED_AT = "2026-06-12T00:00:00.000Z";
const RECORDED_AT = "2026-06-12T00:00:01.000Z";
const MODEL_ID = "mock-repair-provider";
const ORIGINAL_PROMPT = "Generate floor 3 for repair test.";
const USAGE = { latencyMs: 5, tokens: null };

describe("repair loop and fallback degradation", () => {
  it("serves a generated floor and writes a one-shot attempt chain on the happy path", async () => {
    const fs = new MemoryArtifactFs();
    const provider = new SequenceDirectorProvider([
      providerSuccess(validShallowsManifestFixture),
    ]);
    const result = await generateFloor(
      ctx("repair-happy", fs, provider, {
        gate2: passingGate2(validShallowsManifestFixture),
      }),
    );
    const loaded = assertPersisted(fs, "repair-happy", result.record);

    expect(provider.prompts).toEqual([ORIGINAL_PROMPT]);
    expect(provider.options[0]?.timeoutMs).toBe(config.director.manifestTimeoutMs);
    expect("manifest" in result.floor ? result.floor.manifest.depth : null).toBe(
      DEPTH,
    );
    expect(loaded.outcome.kind).toBe("manifest");
    expect(loaded.attempts).toHaveLength(1);
    expect(loaded.attempts[0]?.provider.ok).toBe(true);
    expect(loaded.attempts[0]?.provider.manifestPath).toBe(
      "floors/3/attempts/0/manifest.json",
    );
    expect(loaded.attempts[0]?.gateReports?.gate0?.pass).toBe(true);
    expect(loaded.attempts[0]?.gateReports?.gate1?.pass).toBe(true);
    expect(loaded.attempts[0]?.gateReports?.gate2?.pass).toBe(true);
  });

  it("repairs malformed output on the second attempt and snapshots the repair prompt", async () => {
    const fs = new MemoryArtifactFs();
    const provider = new SequenceDirectorProvider([
      providerFailure("parse_fail", "not a manifest at all"),
      providerSuccess(validShallowsManifestFixture),
    ]);
    const result = await generateFloor(
      ctx("repair-malformed", fs, provider, {
        gate2: passingGate2(validShallowsManifestFixture),
      }),
    );
    const loaded = assertPersisted(fs, "repair-malformed", result.record);

    expect(provider.prompts).toHaveLength(2);
    expect(provider.prompts[1]).toMatchInlineSnapshot(`
      "Generate floor 3 for repair test.

      Your previous output failed these checks:
      - Gate 0 G0_NO_JSON: $: no JSON object found

      Fix only these checks; preserve valid content when possible.

      Offending JSON fragment(s):
      \`\`\`json
      not a manifest at all
      \`\`\`

      Return the corrected complete JSON manifest only."
    `);
    expect(loaded.outcome.kind).toBe("manifest");
    expect(loaded.attempts).toHaveLength(2);
    expect(loaded.attempts[0]?.gateReports?.gate0?.checks[0]?.code).toBe(
      "G0_NO_JSON",
    );
    expect(loaded.attempts[1]?.gateReports?.gate2?.pass).toBe(true);
  });

  it("falls back after exactly two repairs when every manifest is unrepairable", async () => {
    const fs = new MemoryArtifactFs();
    const provider = new SequenceDirectorProvider(
      [],
      providerFailure("parse_fail", "{broken"),
    );
    const result = await generateFloor(ctx("repair-unrepairable", fs, provider));
    const loaded = assertPersisted(fs, "repair-unrepairable", result.record);

    expect(provider.prompts).toHaveLength(bounds.gauntlet.repairRetriesMax + 1);
    expect(loaded.outcome).toEqual({
      kind: "fallback",
      fallbackId: "fallback:old-stock:shallows-3",
    });
    expect(loaded.attempts).toHaveLength(3);
    expect(
      loaded.attempts.every(
        (attempt) => attempt.gateReports?.gate0?.checks[0]?.code === "G0_NO_JSON",
      ),
    ).toBe(true);
    expect((result.floor as FloorContent).params.seed).toBe(SEED);
  });

  it("degrades immediately to fallback on provider timeout", async () => {
    const fs = new MemoryArtifactFs();
    const provider = new SequenceDirectorProvider([
      providerFailure("timeout", undefined),
    ]);
    const result = await generateFloor(ctx("repair-timeout", fs, provider));
    const loaded = assertPersisted(fs, "repair-timeout", result.record);

    expect(provider.prompts).toEqual([ORIGINAL_PROMPT]);
    expect(loaded.outcome).toEqual({
      kind: "fallback",
      fallbackId: "fallback:old-stock:shallows-3",
    });
    expect(loaded.attempts).toHaveLength(1);
    expect(loaded.attempts[0]?.provider.ok).toBe(false);
    expect(loaded.attempts[0]?.provider.error?.code).toBe("timeout");
    expect(loaded.attempts[0]?.gateReports).toBeUndefined();
    expect((result.floor as FloorContent).params.seed).toBe(SEED);
  });

  it("never exceeds the repair cap under an adversarial always-fail provider", async () => {
    const fs = new MemoryArtifactFs();
    const provider = new SequenceDirectorProvider(
      [],
      providerFailure("validate_fail", JSON.stringify({ protocolVersion: "bad" })),
    );
    const result = await generateFloor(ctx("repair-cap", fs, provider));
    const loaded = assertPersisted(fs, "repair-cap", result.record);

    expect(provider.prompts).toHaveLength(3);
    expect(provider.prompts.slice(1)).toHaveLength(bounds.gauntlet.repairRetriesMax);
    expect(loaded.attempts).toHaveLength(3);
    expect(loaded.outcome.kind).toBe("fallback");
    expect(result.record.attempts.map((attempt) => attempt.attemptIndex)).toEqual([
      0, 1, 2,
    ]);
  });
});

class SequenceDirectorProvider implements DirectorProvider {
  readonly prompts: string[] = [];
  readonly options: GenerateManifestOptions[] = [];
  private readonly results: ProviderResult[];
  private readonly defaultResult: ProviderResult;

  constructor(
    results: readonly ProviderResult[],
    defaultResult: ProviderResult = providerFailure("process_error", undefined),
  ) {
    this.results = [...results];
    this.defaultResult = defaultResult;
  }

  async generateManifest(
    prompt: string,
    options: GenerateManifestOptions = {},
  ): Promise<ProviderResult> {
    this.prompts.push(prompt);
    this.options.push(options);

    return this.results.shift() ?? this.defaultResult;
  }

  async judge(prompt: string, options: JudgeOptions = {}): Promise<JudgeResult> {
    void prompt;
    void options;

    return {
      ok: false,
      error: {
        code: "process_error",
        message: "judge unused in repair tests",
      },
      usage: USAGE,
    };
  }
}

const ctx = (
  runId: string,
  fs: MemoryArtifactFs,
  provider: DirectorProvider,
  options: { readonly gate2?: Gate2RunOptions } = {},
) => ({
  prompt: ORIGINAL_PROMPT,
  provider,
  runId,
  depth: DEPTH,
  seed: SEED,
  modelId: MODEL_ID,
  createdAt: CREATED_AT,
  recordedAt: RECORDED_AT,
  artifacts: { fs, rootDir: ROOT_DIR },
  ...options,
});

const providerSuccess = (manifest: FloorManifest): ProviderResult => ({
  ok: true,
  raw: JSON.stringify(manifest),
  manifest,
  usage: USAGE,
});

const providerFailure = (
  code: ProviderFailureCode,
  raw: string | undefined,
): ProviderResult => ({
  ok: false,
  ...(raw === undefined ? {} : { raw }),
  error: {
    code,
    message: `mock ${code}`,
  },
  usage: USAGE,
});

const passingGate2 = (manifest: FloorManifest): Gate2RunOptions => ({
  config: currentBotRealityConfig(manifest),
});

const currentBotRealityConfig = (manifest: FloorManifest): Gate2Config => {
  const base = defaultGate2Config(manifest);

  return {
    ...base,
    policies: ["balanced", "aggressive"],
    seeds: ["repair-gate2-a", "repair-gate2-b"],
    maxTurns: 120,
    wallClockBudgetMs: 1_000,
    thresholdsByBand: {
      shallows: allowCurrentHpRetention(base.thresholdsByBand.shallows),
      middle: allowCurrentHpRetention(base.thresholdsByBand.middle),
      lowest: allowCurrentHpRetention(base.thresholdsByBand.lowest),
    },
  };
};

const allowCurrentHpRetention = (
  threshold: Gate2Config["thresholdsByBand"]["shallows"],
): Gate2Config["thresholdsByBand"]["shallows"] => ({
  ...threshold,
  medianHpRetentionPercent: {
    ...threshold.medianHpRetentionPercent,
    max: 100,
  },
});

const assertPersisted = (
  fs: MemoryArtifactFs,
  runId: string,
  record: Awaited<ReturnType<typeof generateFloor>>["record"],
) => {
  const loaded = loadGenerationChain(runId, DEPTH, { fs, rootDir: ROOT_DIR });

  expect(loaded).toEqual(record);
  expect(loaded.attempts.map((attempt) => attempt.attemptIndex)).toEqual(
    loaded.attempts.map((_, index) => index),
  );
  expect(
    loaded.attempts.every((attempt) => attempt.rawOutputPath.length > 0),
  ).toBe(true);

  return loaded;
};
