import { afterEach, describe, expect, it, vi } from "vitest";

import { config, type GameConfig } from "../../config/index.js";
import {
  type DirectorProvider,
  type GenerateManifestOptions,
  type ProviderResult,
} from "../provider/index.js";
import { MockDirectorProvider } from "../provider/mock.js";
import {
  defaultGate2Config,
  type Gate2Config,
  type Gate2RunOptions,
} from "../../gauntlet/gate2/run.js";
import { MemoryArtifactFs, loadGenerationChain } from "../../harness/artifacts/index.js";
import type { ParsedTrace } from "../../harness/replay/types.js";
import {
  validShallowsManifestFixture,
} from "../../schemas/fixtures/manifest.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import {
  createPrefetchController,
  createDirectorFloorProvider,
  resetGlobalGenerationSemaphoreForTests,
} from "./prefetch.js";
import type { PrefetchClock } from "./types.js";

const ROOT_DIR = "runs";
const RUN_ID = "prefetch-run";
const SEED = "prefetch-seed";
const MODEL_ID = "mock-prefetch";
const CREATED_AT = "2026-06-12T00:00:00.000Z";
const STAIRS_CAP_MS = 8_000;

const readTestEnv = (): Record<string, string | undefined> =>
  (process as { env?: Record<string, string | undefined> }).env ?? {};

afterEach(() => {
  resetGlobalGenerationSemaphoreForTests();
  vi.useRealTimers();
});

describe("prefetch controller", () => {
  it("serves a ready prefetched floor on the fast path and starts the next prefetch", async () => {
    const fs = new MemoryArtifactFs();
    const provider = new DelayedMockDirectorProvider({ delayMs: 25 });
    const controller = createController(fs, provider);

    controller.onFloorEnter(1, trace());
    await flushAsync(80);

    expect(controller.pollStatus()).toEqual({ status: "ready", depth: 2 });

    const served = controller.getFloor(2, `${SEED}:floor:2`);
    expect(served.roster.length).toBeGreaterThan(0);
    expect(controller.pollStatus().status).toBe("in_flight");

    await flushAsync(80);
    expect(controller.pollStatus()).toEqual({ status: "ready", depth: 3 });
    expect(provider.getGenerationCount()).toBe(2);
    expect(loadGenerationChain(RUN_ID, 2, { fs, rootDir: ROOT_DIR }).attempts.length).toBeGreaterThan(0);
  });

  it("waits up to the stairs cap, serves fallback, and retains a late generated floor", async () => {
    const fs = new MemoryArtifactFs();
    const provider = new DelayedMockDirectorProvider({ delayMs: 120 });
    const timing = createElapsedMsClock();
    const controller = createController(fs, provider, {
      stairsCapMs: 50,
      clock: timing.clock,
    });

    controller.onFloorEnter(2, trace());
    expect(controller.pollStatus().status).toBe("in_flight");

    const startedAt = timing.clock();
    const fallback = await controller.resolveFloor(3, `${SEED}:floor:3`);
    const elapsed = timing.clock() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(110);
    expect(fallback.source).toBe("fallback");
    expect(fallback.content.roster.length).toBeGreaterThan(0);

    await flushAsync(300);

    expect(controller.pollStatus()).toEqual({ status: "ready", depth: 3 });
    const retained = await controller.resolveFloor(3, `${SEED}:floor:3`);
    expect(retained.source).toBe("generated");
    expect(provider.getGenerationCount()).toBe(1);
  });

  it("falls back immediately on provider timeout and records artifacts", async () => {
    const fs = new MemoryArtifactFs();
    const provider = new DelayedMockDirectorProvider({
      delayMs: 0,
      failureMode: "timeout",
    });
    const controller = createController(fs, provider);

    controller.onFloorEnter(1, trace());
    await flushAsync(10);

    const served = await controller.resolveFloor(2, `${SEED}:floor:2`);
    expect(served.source).toBe("fallback");
    expect(loadGenerationChain(RUN_ID, 2, { fs, rootDir: ROOT_DIR }).outcome.kind).toBe(
      "fallback",
    );
  });

  it("allows only one generation in flight across rapid floor requests", async () => {
    const fs = new MemoryArtifactFs();
    const provider = new DelayedMockDirectorProvider({ delayMs: 200 });
    const controller = createController(fs, provider, { stairsCapMs: 40 });

    controller.getFloor(2, `${SEED}:floor:2`);
    controller.getFloor(2, `${SEED}:floor:2`);

    await flushAsync(250);
    expect(provider.getGenerationCount()).toBe(1);
    expect(loadGenerationChain(RUN_ID, 2, { fs, rootDir: ROOT_DIR }).attempts.length).toBe(1);
  }, 10_000);

  it("allows only one generation in flight across separate controller instances", async () => {
    const fs = new MemoryArtifactFs();
    const provider = new DelayedMockDirectorProvider({ delayMs: 200 });
    const controllerA = createController(fs, provider, { stairsCapMs: 40 });
    const controllerB = createController(fs, provider, { stairsCapMs: 40 });

    controllerA.getFloor(2, `${SEED}:floor:2`);
    controllerB.getFloor(3, `${SEED}:floor:3`);

    await flushAsync(250);
    expect(provider.getGenerationCount()).toBe(1);
  }, 10_000);

  it("falls back and releases the global gate when prompt assembly throws", async () => {
    const failingProvider = new DelayedMockDirectorProvider();
    const failingController = createPrefetchController({
      runId: `${RUN_ID}-oversized-prompt`,
      seed: SEED,
      modelId: MODEL_ID,
      provider: failingProvider,
      gameConfig: oversizedPromptConfig(),
      gate2: passingGate2(validShallowsManifestFixture),
      artifacts: { fs: new MemoryArtifactFs(), rootDir: ROOT_DIR },
      prefetch: { stairsCapMs: 20 },
      now: () => CREATED_AT,
      providerGenerationTimeoutMs: 120_000,
    });

    failingController.onFloorEnter(1, trace());
    await flushAsync(0);

    expect(failingController.getDiscards()).toContainEqual(
      expect.objectContaining({ depth: 2, reason: "generation_failed" }),
    );
    expect(failingProvider.getGenerationCount()).toBe(0);

    const fallback = await failingController.resolveFloor(2, `${SEED}:floor:2`);
    expect(fallback.source).toBe("fallback");

    const normalProvider = new DelayedMockDirectorProvider();
    const normalController = createController(
      new MemoryArtifactFs(),
      normalProvider,
      { stairsCapMs: 20 },
    );

    normalController.onFloorEnter(1, trace());
    await flushAsync(40);

    expect(normalProvider.getGenerationCount()).toBe(1);
    expect(normalController.pollStatus()).toEqual({ status: "ready", depth: 2 });
  });

  it("cancels in-flight work without leaving pending timers", async () => {
    vi.useFakeTimers();
    const fs = new MemoryArtifactFs();
    const provider = new DelayedMockDirectorProvider({ delayMs: 5_000 });
    const controller = createController(fs, provider);

    controller.onFloorEnter(1, trace());
    await Promise.resolve();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    controller.cancel();
    await vi.runAllTimersAsync();
    expect(vi.getTimerCount()).toBe(0);
    expect(controller.pollStatus()).toEqual({ status: "idle" });
  });

  it("waits for generated floors up to provider timeout when AMBIENT_REAL=1", async () => {
    const env = readTestEnv();
    const previousAmbientReal = env.AMBIENT_REAL;
    env.AMBIENT_REAL = "1";

    try {
      const fs = new MemoryArtifactFs();
      const provider = new DelayedMockDirectorProvider({ delayMs: 120 });
      const timing = createElapsedMsClock();
      const controller = createController(fs, provider, {
        stairsCapMs: 50,
        clock: timing.clock,
      });

      controller.onFloorEnter(2, trace());
      expect(controller.pollStatus().status).toBe("in_flight");

      const startedAt = timing.clock();
      const served = await controller.resolveFloor(3, `${SEED}:floor:3`);
      const elapsed = timing.clock() - startedAt;

      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(served.source).toBe("generated");
      expect(served.content.roster.length).toBeGreaterThan(0);
      expect(provider.getGenerationCount()).toBe(1);
    } finally {
      if (previousAmbientReal === undefined) {
        delete env.AMBIENT_REAL;
      } else {
        env.AMBIENT_REAL = previousAmbientReal;
      }
    }
  });

  it("dedupes prefer-generated depth generation across sequential getFloor calls when AMBIENT_REAL=1", async () => {
    const env = readTestEnv();
    const previousAmbientReal = env.AMBIENT_REAL;
    env.AMBIENT_REAL = "1";

    try {
      const fs = new MemoryArtifactFs();
      const provider = new DelayedMockDirectorProvider({ delayMs: 120 });
      const controller = createController(fs, provider);

      const firstPromise = Promise.resolve().then(() =>
        controller.resolveFloor(3, `${SEED}:floor:3`),
      );
      await flushAsync(40);
      const secondPromise = controller.resolveFloor(3, `${SEED}:floor:3`);
      const [first, second] = await Promise.all([firstPromise, secondPromise]);

      expect(first.source).toBe("generated");
      expect(second.source).toBe("generated");
      expect(first.content.roster).toEqual(second.content.roster);
      expect(provider.getGenerationCount()).toBe(1);
      expect(loadGenerationChain(RUN_ID, 3, { fs, rootDir: ROOT_DIR }).attempts.length).toBe(1);
    } finally {
      if (previousAmbientReal === undefined) {
        delete env.AMBIENT_REAL;
      } else {
        env.AMBIENT_REAL = previousAmbientReal;
      }
    }
  }, 10_000);

  it("falls back on provider failure when AMBIENT_REAL=1", async () => {
    const env = readTestEnv();
    const previousAmbientReal = env.AMBIENT_REAL;
    env.AMBIENT_REAL = "1";

    try {
      const fs = new MemoryArtifactFs();
      const provider = new DelayedMockDirectorProvider({
        delayMs: 0,
        failureMode: "timeout",
      });
      const controller = createController(fs, provider);

      controller.onFloorEnter(1, trace());
      await flushAsync(10);

      const served = await controller.resolveFloor(2, `${SEED}:floor:2`);
      expect(served.source).toBe("fallback");
      expect(loadGenerationChain(RUN_ID, 2, { fs, rootDir: ROOT_DIR }).outcome.kind).toBe(
        "fallback",
      );
    } finally {
      if (previousAmbientReal === undefined) {
        delete env.AMBIENT_REAL;
      } else {
        env.AMBIENT_REAL = previousAmbientReal;
      }
    }
  });
});

describe("DirectorFloorProvider", () => {
  it("implements FloorContentProvider through the controller", async () => {
    const fs = new MemoryArtifactFs();
    const provider = new DelayedMockDirectorProvider({ delayMs: 10 });
    const floorProvider = createDirectorFloorProvider({
      runId: RUN_ID,
      seed: SEED,
      modelId: MODEL_ID,
      provider,
      gate2: passingGate2(validShallowsManifestFixture),
      artifacts: { fs, rootDir: ROOT_DIR },
      prefetch: { stairsCapMs: STAIRS_CAP_MS },
      now: () => CREATED_AT,
    });

    floorProvider.getFloor(2, `${SEED}:floor:2`);
    await flushAsync(30);

    const content = floorProvider.getFloor(2, `${SEED}:floor:2`);
    expect(content.roster.length).toBeGreaterThan(0);
  });
});

class DelayedMockDirectorProvider implements DirectorProvider {
  private readonly delayMs: number;
  private readonly failureMode: "timeout" | null;
  private count = 0;

  constructor(
    options: {
      readonly delayMs?: number;
      readonly failureMode?: "timeout" | null;
    } = {},
  ) {
    this.delayMs = options.delayMs ?? 0;
    this.failureMode = options.failureMode ?? null;
  }

  getGenerationCount(): number {
    return this.count;
  }

  async generateManifest(
    prompt: string,
    options: GenerateManifestOptions = {},
  ): Promise<ProviderResult> {
    this.count += 1;

    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.delayMs);
      });
    }

    const depth = depthFromPrompt(prompt);
    const manifest = manifestForDepth(depth);
    const inner = new MockDirectorProvider({
      manifest,
      latencyMs: this.delayMs,
      ...(this.failureMode === null ? {} : { failureMode: this.failureMode }),
    });

    return inner.generateManifest(prompt, options);
  }

  async judge(
    prompt: string,
    options: Parameters<DirectorProvider["judge"]>[1] = {},
  ) {
    const depth = depthFromPrompt(prompt);
    const inner = new MockDirectorProvider({ manifest: manifestForDepth(depth) });
    return inner.judge(prompt, options);
  }
}

const manifestForDepth = (depth: number): FloorManifest => ({
  ...validShallowsManifestFixture,
  depth,
  params: {
    ...validShallowsManifestFixture.params,
    seed: `${SEED}:floor:${depth}`,
  },
});

const depthFromPrompt = (prompt: string): number => {
  const match = prompt.match(/depth (\d+)/);
  if (match === null) {
    return validShallowsManifestFixture.depth;
  }

  return Number(match[1]);
};

const createController = (
  fs: MemoryArtifactFs,
  provider: DirectorProvider,
  prefetch: { readonly stairsCapMs?: number; readonly clock?: PrefetchClock } = {},
) => {
  const elapsedClock =
    prefetch.clock === undefined ? createElapsedMsClock() : null;

  return createPrefetchController({
    runId: RUN_ID,
    seed: SEED,
    modelId: MODEL_ID,
    provider,
    gate2: passingGate2(validShallowsManifestFixture),
    artifacts: { fs, rootDir: ROOT_DIR },
    prefetch: { stairsCapMs: prefetch.stairsCapMs ?? STAIRS_CAP_MS },
    clock: prefetch.clock ?? elapsedClock!.clock,
    now: () => CREATED_AT,
    providerGenerationTimeoutMs: 120_000,
  });
};

const createElapsedMsClock = (): { readonly clock: PrefetchClock } => {
  const start = performance.now();

  return {
    clock: () => performance.now() - start,
  };
};

const passingGate2 = (manifest: FloorManifest): Gate2RunOptions => ({
  config: {
    ...defaultGate2Config(manifest),
    policies: ["balanced"],
    seeds: ["prefetch-gate2-only"],
    maxTurns: 48,
    wallClockBudgetMs: 500,
    thresholdsByBand: {
      shallows: relaxHp(defaultGate2Config(manifest).thresholdsByBand.shallows),
      middle: relaxHp(defaultGate2Config(manifest).thresholdsByBand.middle),
      lowest: relaxHp(defaultGate2Config(manifest).thresholdsByBand.lowest),
    },
  },
});

const relaxHp = (
  threshold: Gate2Config["thresholdsByBand"]["shallows"],
): Gate2Config["thresholdsByBand"]["shallows"] => ({
  ...threshold,
  medianHpRetentionPercent: {
    ...threshold.medianHpRetentionPercent,
    max: 100,
  },
});

const oversizedPromptConfig = (): GameConfig => ({
  ...config,
  runStructure: {
    ...config.runStructure,
    floorGeometry: {
      ...config.runStructure.floorGeometry,
      shallows: {
        ...config.runStructure.floorGeometry.shallows,
        layoutFlavors: Array.from(
          { length: 5_000 },
          (_, index) => `oversized-flavor-${index}`,
        ) as unknown as GameConfig["runStructure"]["floorGeometry"]["shallows"]["layoutFlavors"],
      },
    },
  },
});

const trace = (): ParsedTrace => ({
  header: {
    recordType: "header",
    protocolVersion: "1.2.0",
    engineVersion: "0.0.0",
    modelId: "prefetch-test",
    contentRef: { providerId: "prefetch-test", packVersion: "0.0.0" },
    seed: SEED,
    createdAt: CREATED_AT,
    runId: RUN_ID,
  },
  turns: [],
});

const flushAsync = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};
