import { afterEach, describe, expect, it } from "vitest";

import { MemoryArtifactFs } from "../../harness/artifacts/index.js";
import type { ParsedTrace } from "../../harness/replay/types.js";
import { MockDirectorProvider } from "../provider/mock.js";
import {
  defaultGate2Config,
  type Gate2Config,
  type Gate2RunOptions,
} from "../../gauntlet/gate2/run.js";
import { validShallowsManifestFixture } from "../../schemas/fixtures/manifest.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import {
  createHttpHarness,
  createRunControllerRegistry,
  createTransportHandlers,
} from "./transport.js";

const ROOT_DIR = "runs";
const RUN_ID = "transport-run";
const SEED = "transport-seed";
const MODEL_ID = "mock-transport";
const CREATED_AT = "2026-06-12T00:00:00.000Z";

const passingGate2 = (manifest: FloorManifest): Gate2RunOptions => ({
  config: {
    ...defaultGate2Config(manifest),
    policies: ["balanced", "aggressive"],
    seeds: ["transport-gate2-a", "transport-gate2-b"],
    maxTurns: 120,
    wallClockBudgetMs: 1_000,
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

afterEach(() => {
  registry.remove(RUN_ID);
});

const registry = createRunControllerRegistry();
const fs = new MemoryArtifactFs();
const defaultOptions = {
  seed: SEED,
  modelId: MODEL_ID,
  provider: new MockDirectorProvider({ latencyMs: 0 }),
  gate2: passingGate2(validShallowsManifestFixture),
  artifacts: { fs, rootDir: ROOT_DIR },
  now: () => CREATED_AT,
};
const handlers = createTransportHandlers(registry, defaultOptions);

describe("transport handlers", () => {
  it("round-trips startGeneration, pollStatus, and getFloor through the http harness", async () => {
    const server = createHttpHarness(handlers);
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected bound tcp port");
    }

    try {
      const start = await postJson(address.port, {
        action: "startGeneration",
        body: {
          runId: RUN_ID,
          depth: 1,
          trace: trace(),
        },
      });
      expect(start).toEqual({ ok: true, prefetchDepth: 2 });

      const status = await postJson(address.port, {
        action: "pollStatus",
        body: { runId: RUN_ID },
      });
      expect(["ready", "in_flight", "idle"]).toContain(status.status);

      const floor = (await postJson(address.port, {
        action: "getFloor",
        body: {
          runId: RUN_ID,
          depth: 2,
          seed: `${SEED}:floor:2`,
        },
      })) as { depth: number; source: string; content: { roster: unknown[] } };
      expect(floor.depth).toBe(2);
      expect(floor.content.roster.length).toBeGreaterThan(0);
      expect(["generated", "fallback"]).toContain(floor.source);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});

const postJson = async (
  port: number,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const response = await fetch(`http://127.0.0.1:${port}/director`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await response.json()) as Record<string, unknown>;
};

const trace = (): ParsedTrace => ({
  header: {
    recordType: "header",
    protocolVersion: "1.2.0",
    engineVersion: "0.0.0",
    modelId: "transport-test",
    contentRef: { providerId: "transport-test", packVersion: "0.0.0" },
    seed: SEED,
    createdAt: CREATED_AT,
    runId: RUN_ID,
  },
  turns: [],
});
