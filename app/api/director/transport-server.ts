import {
  defaultGate2Config,
  type Gate2Config,
  type Gate2RunOptions,
} from "../../../src/gauntlet/gate2/run.js";
import {
  createRunControllerRegistry,
  createTransportHandlers,
  type TransportHandlers,
} from "../../../src/director/orchestration/transport.js";
import { MockDirectorProvider } from "../../../src/director/provider/mock.js";
import { MemoryArtifactFs } from "../../../src/harness/artifacts/index.js";
import { validShallowsManifestFixture } from "../../../src/schemas/fixtures/manifest.js";
import type { FloorManifest } from "../../../src/schemas/manifest.js";

const ROOT_DIR = "runs";
const SEED = "web-transport";
const MODEL_ID = "mock-web-transport";
const CREATED_AT = "2026-06-12T00:00:00.000Z";

const relaxHp = (
  threshold: Gate2Config["thresholdsByBand"]["shallows"],
): Gate2Config["thresholdsByBand"]["shallows"] => ({
  ...threshold,
  medianHpRetentionPercent: {
    ...threshold.medianHpRetentionPercent,
    max: 100,
  },
});

const passingGate2 = (manifest: FloorManifest): Gate2RunOptions => ({
  config: {
    ...defaultGate2Config(manifest),
    policies: ["balanced", "aggressive"],
    seeds: ["web-gate2-a", "web-gate2-b"],
    maxTurns: 120,
    wallClockBudgetMs: 1_000,
    thresholdsByBand: {
      shallows: relaxHp(defaultGate2Config(manifest).thresholdsByBand.shallows),
      middle: relaxHp(defaultGate2Config(manifest).thresholdsByBand.middle),
      lowest: relaxHp(defaultGate2Config(manifest).thresholdsByBand.lowest),
    },
  },
});

const createWebTransportHandlers = (): TransportHandlers => {
  const registry = createRunControllerRegistry();
  const fs = new MemoryArtifactFs();

  return createTransportHandlers(registry, {
    seed: SEED,
    modelId: MODEL_ID,
    provider: new MockDirectorProvider({ latencyMs: 0 }),
    gate2: passingGate2(validShallowsManifestFixture),
    artifacts: { fs, rootDir: ROOT_DIR },
    now: () => CREATED_AT,
  });
};

const transportGlobal = globalThis as typeof globalThis & {
  __ggWebTransportHandlers?: TransportHandlers;
};

export const getTransportHandlers = (): TransportHandlers => {
  transportGlobal.__ggWebTransportHandlers ??= createWebTransportHandlers();
  return transportGlobal.__ggWebTransportHandlers;
};
