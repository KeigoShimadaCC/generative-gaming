import { afterEach, describe, expect, it, vi } from "vitest";

import {
  rosterAffordable,
  rosterCost
} from "../../../src/engine/enemies/index.js";
import { config } from "../../../src/config/index.js";
import { depthBandForDepth } from "../../../src/engine/state/init.js";
import {
  listRuns,
  loadGenerationChain
} from "../../../src/harness/artifacts/index.js";
import type { ParsedTrace } from "../../../src/harness/replay/types.js";
import { traceRunId } from "../../../src/harness/trace/recorder.js";
import { resetGlobalGenerationSemaphoreForTests } from "../../../src/director/orchestration/prefetch.js";
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION
} from "../../../src/schemas/protocol.js";
import fallbackFloor5Json from "../../../content/fallback/floors/5.json" with { type: "json" };
import fallbackFloor10Json from "../../../content/fallback/floors/10.json" with { type: "json" };
import fallbackFloor12Json from "../../../content/fallback/floors/12.json" with { type: "json" };
import fallbackEnemiesJson from "../../../content/fallback/enemies.json" with { type: "json" };

const ambientMock = vi.hoisted(() => ({
  delayMs: 50,
  shouldFail: false
}));

vi.mock("../../../src/director/provider/ambient.js", async () => {
  const { MockDirectorProvider } = await import(
    "../../../src/director/provider/mock.js"
  );
  const { depthBandForDepth: bandForDepth } = await import(
    "../../../src/engine/state/init.js"
  );
  const {
    validShallowsManifestFixture,
    validMiddleManifestFixture,
    validLowestManifestFixture
  } = await import("../../../src/schemas/fixtures/manifest.js");
  const { failure } = await import("../../../src/director/provider/types.js");
  type GenerateManifestOptions = import(
    "../../../src/director/provider/types.js"
  ).GenerateManifestOptions;
  type JudgeOptions = import("../../../src/director/provider/types.js").JudgeOptions;

  const fixtureByBand = {
    shallows: validShallowsManifestFixture,
    middle: validMiddleManifestFixture,
    lowest: validLowestManifestFixture
  } as const;

  const depthFromPrompt = (prompt: string): number => {
    const match = /depth (\d+)/u.exec(prompt);
    return match === null ? 1 : Number.parseInt(match[1] ?? "", 10);
  };

  class AmbientDirectorProvider {
    async generateManifest(prompt: string, options: GenerateManifestOptions = {}) {
      if (ambientMock.delayMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, ambientMock.delayMs);
        });
      }

      if (ambientMock.shouldFail) {
        return failure("process_error", "mock ambient failure", {
          latencyMs: ambientMock.delayMs,
          tokens: null
        });
      }

      const depth = depthFromPrompt(prompt);
      const band = bandForDepth(depth);
      const manifest = {
        ...fixtureByBand[band],
        depth,
        band,
        params: {
          ...fixtureByBand[band].params,
          bandOrSize: band,
          seed: `ambient-mock-${depth}`
        }
      };
      const inner = new MockDirectorProvider({ manifest, latencyMs: 0 });
      return inner.generateManifest(prompt, options);
    }

    async judge(prompt: string, options: JudgeOptions = {}) {
      const inner = new MockDirectorProvider({ latencyMs: 0 });
      return inner.judge(prompt, options);
    }
  }

  return { AmbientDirectorProvider };
});

import { createWebTransportState, resetWebTransportStateForTests, formatAmbientSourceMarker, formatProviderFailureReason } from "./transport-server";

afterEach(() => {
  resetGlobalGenerationSemaphoreForTests();
  resetWebTransportStateForTests();
  ambientMock.delayMs = 50;
  ambientMock.shouldFail = false;
  delete process.env.AMBIENT_REAL;
  delete process.env.AMBIENT;
  delete process.env.DIRECTOR;
});

describe("web director transport", () => {
  it("formats ambient fallback source markers with provider failure reasons", () => {
    const reason = formatProviderFailureReason({
      code: "process_error",
      message: "spawn codex ENOENT"
    });
    expect(reason).toBe("process_error: spawn codex ENOENT");
    expect(
      formatAmbientSourceMarker(
        {
          depth: 3,
          source: "fallback",
          content: {
            params: {
              bandOrSize: "shallows",
              seed: "x",
              roomCountRange: { min: 3, max: 5 },
              flavor: "warren"
            },
            roster: [],
            items: [],
            traps: [],
            npcs: []
          }
        },
        reason
      )
    ).toBe(
      "[AMBIENT-SOURCE] depth=3 source=fallback reason=process_error: spawn codex ENOENT"
    );
    expect(
      formatAmbientSourceMarker(
        {
          depth: 3,
          source: "generated",
          content: {
            params: {
              bandOrSize: "shallows",
              seed: "x",
              roomCountRange: { min: 3, max: 5 },
              flavor: "warren"
            },
            roster: [],
            items: [],
            traps: [],
            npcs: []
          }
        }
      )
    ).toBe("[AMBIENT-SOURCE] depth=3 source=generated");
  });

  it("truncates long ambient fallback reasons to 200 characters of message text", () => {
    const reason = formatProviderFailureReason({
      code: "process_error",
      message: "x".repeat(250)
    });
    expect(reason).toBe(`process_error: ${"x".repeat(200)}`);
  });

  it("serves middle-band generated content for a depth 5 request", async () => {
    const state = createWebTransportState();
    const { handlers } = state;
    const runId = "transport-depth-5-test";

    handlers.startGeneration({
      runId,
      depth: 4,
      trace: emptyTrace(runId)
    });

    const served = await handlers.getFloor({
      runId,
      depth: 5,
      seed: "transport-depth-5-seed"
    });
    const band = depthBandForDepth(5);

    expect(served.source).toBe("generated");
    expect(served.depth).toBe(5);
    expect(served.content.params.bandOrSize).toBe("middle");
    expect(band).toBe("middle");
    expect(rosterAffordable(served.content.roster, band)).toBe(true);
    expect(rosterCost(served.content.roster)).toBeGreaterThan(0);
    expect(
      served.content.items.some(
        (item) =>
          item.id === "oldstock-bitter-purge" &&
          item.kind === "draught" &&
          item.draught?.effect.effects.some(
            (effect) =>
              effect.kind === "heal" && (effect.heal?.amount ?? 0) >= 14
          ) === true
      )
    ).toBe(true);
  });

  it("derives mock floors with fallback-calibrated roster density at depths 5 and 10", async () => {
    const fallbackEnemiesById = new Map(
      (fallbackEnemiesJson as Array<{ id: string; stats: { xpYield: number } }>).map(
        (enemy) => [enemy.id, enemy]
      )
    );
    const fallbackXpTotal = (floor: {
      enemyRosterIds: readonly string[];
    }): number =>
      floor.enemyRosterIds.reduce(
        (total, enemyId) =>
          total + (fallbackEnemiesById.get(enemyId)?.stats.xpYield ?? 0),
        0
      );

    for (const { depth, fallbackFloor } of [
      { depth: 5, fallbackFloor: fallbackFloor5Json },
      { depth: 10, fallbackFloor: fallbackFloor10Json }
    ]) {
      const state = createWebTransportState();
      const runId = `transport-calibrated-depth-${depth}`;
      const seed = `transport-calibrated-depth-${depth}-seed`;
      const band = depthBandForDepth(depth);
      const fallbackXp = fallbackXpTotal(fallbackFloor);

      state.handlers.startGeneration({
        runId,
        depth: depth - 1,
        trace: emptyTrace(runId, seed)
      });

      const served = await state.handlers.getFloor({
        runId,
        depth,
        seed
      });
      const derivedXp = served.content.roster.reduce(
        (total, enemy) => total + enemy.stats.xpYield,
        0
      );
      const xpDeltaRatio =
        fallbackXp === 0 ? 0 : Math.abs(derivedXp - fallbackXp) / fallbackXp;

      expect(served.source).toBe("generated");
      expect(served.content.roster.length).toBeGreaterThanOrEqual(
        fallbackFloor.enemyRosterIds.length - 1
      );
      expect(served.content.roster.length).toBeLessThanOrEqual(
        fallbackFloor.enemyRosterIds.length + 1
      );
      expect(xpDeltaRatio).toBeLessThanOrEqual(0.3);
      expect(
        served.content.items.some(
          (item) =>
            (item.kind === "weapon" || item.kind === "armor") &&
            item.value.band === band
        )
      ).toBe(true);
      expect(rosterAffordable(served.content.roster, band)).toBe(true);
    }
  });

  it("wires real ambient transport when AMBIENT_REAL=1 even with DIRECTOR=fallback", async () => {
    const previousAmbientReal = process.env.AMBIENT_REAL;
    const previousDirector = process.env.DIRECTOR;
    process.env.AMBIENT_REAL = "1";
    process.env.DIRECTOR = "fallback";

    try {
      const state = createWebTransportState();
      expect(state.realAmbientDirector).toBe(true);
      expect(state.usesAmbientProvider).toBe(true);
      expect(state.fallbackDirector).toBe(true);
      expect(state.providerGenerationTimeoutMs).toBe(45_000);
      expect(state.fallbackProvider).toBeDefined();
      expect(
        state.fallbackProvider?.getFloor(5, "ambient-real-fallback-seed").params
          .bandOrSize
      ).toBe("middle");
    } finally {
      if (previousAmbientReal === undefined) {
        delete process.env.AMBIENT_REAL;
      } else {
        process.env.AMBIENT_REAL = previousAmbientReal;
      }
      if (previousDirector === undefined) {
        delete process.env.DIRECTOR;
      } else {
        process.env.DIRECTOR = previousDirector;
      }
      resetWebTransportStateForTests();
    }
  });

  it("waits for generated floors when AMBIENT_REAL=1 and generation succeeds", async () => {
    const previousAmbientReal = process.env.AMBIENT_REAL;
    const previousDirector = process.env.DIRECTOR;
    process.env.AMBIENT_REAL = "1";
    delete process.env.DIRECTOR;
    ambientMock.delayMs = 120;
    ambientMock.shouldFail = false;

    try {
      const state = createWebTransportState();
      const { handlers } = state;
      const runId = "transport-ambient-real-wait";
      const seed = "transport-ambient-real-wait-seed";

      handlers.startGeneration({
        runId,
        depth: 1,
        trace: emptyTrace(runId, seed)
      });

      const startedAtMs = performance.now();
      const served = await handlers.getFloor({
        runId,
        depth: 2,
        seed
      });
      const elapsedMs = performance.now() - startedAtMs;

      expect(served.source).toBe("generated");
      expect(served.depth).toBe(2);
      expect(elapsedMs).toBeGreaterThanOrEqual(100);
      expect(elapsedMs).toBeLessThan(10_000);
      expect(rosterAffordable(served.content.roster, depthBandForDepth(2))).toBe(
        true
      );
    } finally {
      if (previousAmbientReal === undefined) {
        delete process.env.AMBIENT_REAL;
      } else {
        process.env.AMBIENT_REAL = previousAmbientReal;
      }
      if (previousDirector === undefined) {
        delete process.env.DIRECTOR;
      } else {
        process.env.DIRECTOR = previousDirector;
      }
      resetWebTransportStateForTests();
    }
  }, 15_000);

  it("dedupes AMBIENT_REAL getFloor retries so generation runs once per depth", async () => {
    const previousAmbientReal = process.env.AMBIENT_REAL;
    const previousDirector = process.env.DIRECTOR;
    process.env.AMBIENT_REAL = "1";
    delete process.env.DIRECTOR;
    ambientMock.delayMs = 120;
    ambientMock.shouldFail = false;

    try {
      const state = createWebTransportState();
      const { handlers } = state;
      const runId = "transport-ambient-real-dedupe";
      const seed = "transport-ambient-real-dedupe-seed";

      handlers.startGeneration({
        runId,
        depth: 1,
        trace: emptyTrace(runId, seed)
      });

      const firstPromise = handlers.getFloor({
        runId,
        depth: 3,
        seed
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 40);
      });
      const secondPromise = handlers.getFloor({
        runId,
        depth: 3,
        seed
      });
      const [first, second] = await Promise.all([firstPromise, secondPromise]);

      expect(first.source).toBe("generated");
      expect(second.source).toBe("generated");
      expect(first.content.roster).toEqual(second.content.roster);
      expect(
        loadGenerationChain(state.artifactRunId, 3, state.artifacts).attempts.length
      ).toBe(1);
    } finally {
      if (previousAmbientReal === undefined) {
        delete process.env.AMBIENT_REAL;
      } else {
        process.env.AMBIENT_REAL = previousAmbientReal;
      }
      if (previousDirector === undefined) {
        delete process.env.DIRECTOR;
      } else {
        process.env.DIRECTOR = previousDirector;
      }
      resetWebTransportStateForTests();
    }
  }, 15_000);

  it("falls back when AMBIENT_REAL=1 and generation fails", async () => {
    const previousAmbientReal = process.env.AMBIENT_REAL;
    const previousDirector = process.env.DIRECTOR;
    process.env.AMBIENT_REAL = "1";
    process.env.DIRECTOR = "fallback";
    ambientMock.delayMs = 0;
    ambientMock.shouldFail = true;

    try {
      const state = createWebTransportState();
      const { handlers } = state;
      const runId = "transport-ambient-real-fallback";
      const seed = "transport-ambient-real-fallback-seed";

      handlers.startGeneration({
        runId,
        depth: 4,
        trace: emptyTrace(runId, seed)
      });

      const served = await handlers.getFloor({
        runId,
        depth: 5,
        seed
      });

      expect(served.source).toBe("fallback");
      expect(served.depth).toBe(5);
      expect(served.content.roster.map((enemy) => enemy.id)).toEqual(
        fallbackFloor5Json.enemyRosterIds
      );
    } finally {
      if (previousAmbientReal === undefined) {
        delete process.env.AMBIENT_REAL;
      } else {
        process.env.AMBIENT_REAL = previousAmbientReal;
      }
      if (previousDirector === undefined) {
        delete process.env.DIRECTOR;
      } else {
        process.env.DIRECTOR = previousDirector;
      }
      resetWebTransportStateForTests();
    }
  });

  it("leaves transport config unchanged when AMBIENT_REAL is unset", async () => {
    const previousAmbientReal = process.env.AMBIENT_REAL;
    const previousDirector = process.env.DIRECTOR;
    const previousAmbient = process.env.AMBIENT;
    delete process.env.AMBIENT_REAL;
    delete process.env.DIRECTOR;
    delete process.env.AMBIENT;

    try {
      const state = createWebTransportState();
      expect(state.realAmbientDirector).toBe(false);
      expect(state.usesAmbientProvider).toBe(false);
      expect(state.providerGenerationTimeoutMs).toBeUndefined();
      expect(state.fallbackProvider).toBeUndefined();
    } finally {
      if (previousAmbientReal === undefined) {
        delete process.env.AMBIENT_REAL;
      } else {
        process.env.AMBIENT_REAL = previousAmbientReal;
      }
      if (previousDirector === undefined) {
        delete process.env.DIRECTOR;
      } else {
        process.env.DIRECTOR = previousDirector;
      }
      if (previousAmbient === undefined) {
        delete process.env.AMBIENT;
      } else {
        process.env.AMBIENT = previousAmbient;
      }
      resetWebTransportStateForTests();
    }
  });

  it("wires bundled fallback provider when AMBIENT=1 without DIRECTOR=fallback", async () => {
    const previousAmbient = process.env.AMBIENT;
    const previousDirector = process.env.DIRECTOR;
    process.env.AMBIENT = "1";
    delete process.env.DIRECTOR;

    try {
      const state = createWebTransportState();
      expect(state.ambientDirector).toBe(true);
      expect(state.fallbackDirector).toBe(false);
      expect(state.fallbackProvider).toBeDefined();
      expect(
        state.fallbackProvider?.getFloor(5, "ambient-fallback-seed").params.bandOrSize
      ).toBe("middle");
    } finally {
      if (previousAmbient === undefined) {
        delete process.env.AMBIENT;
      } else {
        process.env.AMBIENT = previousAmbient;
      }
      if (previousDirector === undefined) {
        delete process.env.DIRECTOR;
      } else {
        process.env.DIRECTOR = previousDirector;
      }
      resetWebTransportStateForTests();
    }
  });

  it("serves calibrated fallback pack content for a depth 5 request when DIRECTOR=fallback", async () => {
    const previousDirector = process.env.DIRECTOR;
    process.env.DIRECTOR = "fallback";

    try {
      const state = createWebTransportState();
      const { handlers } = state;
      const runId = "transport-fallback-depth-5-test";

      handlers.startGeneration({
        runId,
        depth: 4,
        trace: emptyTrace(runId)
      });

      const served = await handlers.getFloor({
        runId,
        depth: 5,
        seed: "transport-fallback-depth-5-seed"
      });

      expect(served.source).toBe("fallback");
      expect(served.depth).toBe(5);
      expect(served.content.roster.map((enemy) => enemy.id)).toEqual(
        fallbackFloor5Json.enemyRosterIds
      );
    } finally {
      if (previousDirector === undefined) {
        delete process.env.DIRECTOR;
      } else {
        process.env.DIRECTOR = previousDirector;
      }
    }
  });

  it("serves calibrated fallback pack content for depth 12 after a depth-11 descend prefetch", async () => {
    const previousDirector = process.env.DIRECTOR;
    process.env.DIRECTOR = "fallback";

    try {
      const state = createWebTransportState({
        seed: "transport-fallback-depth-12-seed",
        createdAt: "2026-06-13T00:00:00.000Z"
      });
      const { handlers } = state;
      const runId = "transport-fallback-depth-12-test";
      const seed = "transport-fallback-depth-12-seed";
      let trace = emptyTrace(runId, seed);

      for (let depth = 1; depth <= 10; depth += 1) {
        handlers.startGeneration({ runId, depth, trace });
        const served = await handlers.getFloor({
          runId,
          depth: depth + 1,
          seed
        });
        expect(served.source).toBe("fallback");
        expect(served.depth).toBe(depth + 1);
        trace = traceAfterFloorEnter(trace, depth + 1);
      }

      handlers.startGeneration({ runId, depth: 11, trace });
      expect(handlers.pollStatus({ runId }).status).not.toBe("idle");

      const startedAtMs = performance.now();
      const served = await Promise.race([
        handlers.getFloor({ runId, depth: 12, seed }),
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () => reject(new Error("depth 12 getFloor hung past stairs cap")),
            15_000
          );
        })
      ]);
      const elapsedMs = performance.now() - startedAtMs;

      expect(elapsedMs).toBeLessThan(10_000);
      expect(served.source).toBe("fallback");
      expect(served.depth).toBe(12);
      expect(served.content.params.hoard?.id).toBe("hoard");
      expect(served.content.roster.map((enemy) => enemy.id)).toEqual(
        fallbackFloor12Json.enemyRosterIds
      );
    } finally {
      if (previousDirector === undefined) {
        delete process.env.DIRECTOR;
      } else {
        process.env.DIRECTOR = previousDirector;
      }
    }
  }, 20_000);

  it("serves depth 12 on the in-flight stairs-cap path without waiting on the counter clock", async () => {
    const previousDirector = process.env.DIRECTOR;
    process.env.DIRECTOR = "fallback";

    try {
      const state = createWebTransportState({
        seed: "transport-fallback-depth-12-inflight-seed",
        createdAt: "2026-06-13T00:00:01.000Z"
      });
      const { handlers } = state;
      const runId = "transport-fallback-depth-12-inflight";
      const seed = "transport-fallback-depth-12-inflight-seed";
      const trace = emptyTrace(runId, seed);

      handlers.startGeneration({ runId, depth: 11, trace });
      expect(handlers.pollStatus({ runId })).toMatchObject({
        status: "in_flight",
        depth: 12
      });

      const startedAtMs = performance.now();
      const served = await Promise.race([
        handlers.getFloor({ runId, depth: 12, seed }),
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () =>
              reject(
                new Error("depth 12 in-flight getFloor exceeded stairs cap")
              ),
            15_000
          );
        })
      ]);
      const elapsedMs = performance.now() - startedAtMs;

      expect(elapsedMs).toBeLessThan(10_000);
      expect(served.source).toBe("fallback");
      expect(served.depth).toBe(12);
      expect(served.content.params.hoard?.id).toBe("hoard");
    } finally {
      if (previousDirector === undefined) {
        delete process.env.DIRECTOR;
      } else {
        process.env.DIRECTOR = previousDirector;
      }
    }
  }, 20_000);

  it("coalesces concurrent depth-12 getFloor calls while depth-12 prefetch is in flight", async () => {
    const previousDirector = process.env.DIRECTOR;
    process.env.DIRECTOR = "fallback";

    try {
      const state = createWebTransportState({
        seed: "transport-fallback-depth-12-coalesce-seed",
        createdAt: "2026-06-13T00:00:02.000Z"
      });
      const { handlers } = state;
      const runId = "transport-fallback-depth-12-coalesce";
      const seed = "transport-fallback-depth-12-coalesce-seed";
      const trace = emptyTrace(runId, seed);

      handlers.startGeneration({ runId, depth: 11, trace });
      expect(handlers.pollStatus({ runId })).toMatchObject({
        status: "in_flight",
        depth: 12
      });

      const [first, second] = await Promise.all([
        handlers.getFloor({ runId, depth: 12, seed }),
        handlers.getFloor({ runId, depth: 12, seed })
      ]);

      expect(first).toEqual(second);
      expect(first.source).toBe("fallback");
      expect(first.depth).toBe(12);
      expect(first.content.params.hoard?.id).toBe("hoard");
    } finally {
      if (previousDirector === undefined) {
        delete process.env.DIRECTOR;
      } else {
        process.env.DIRECTOR = previousDirector;
      }
    }
  });

  it("uses the terminal fallback fast path after DIRECTOR=fallback is enabled post-init", async () => {
    const previousDirector = process.env.DIRECTOR;
    delete process.env.DIRECTOR;
    resetWebTransportStateForTests();

    try {
      const withoutFallback = createWebTransportState({
        seed: "transport-fallback-rebind-seed",
        createdAt: "2026-06-13T00:00:03.000Z"
      });
      expect(withoutFallback.fallbackDirector).toBe(false);

      process.env.DIRECTOR = "fallback";
      resetWebTransportStateForTests();
      const withFallback = createWebTransportState({
        seed: "transport-fallback-rebind-seed",
        createdAt: "2026-06-13T00:00:03.000Z"
      });
      const { handlers } = withFallback;
      const runId = "transport-fallback-rebind";
      const seed = "transport-fallback-rebind-seed";
      const trace = emptyTrace(runId, seed);

      handlers.startGeneration({ runId, depth: 11, trace });
      const served = await handlers.getFloor({ runId, depth: 12, seed });

      expect(served.source).toBe("fallback");
      expect(served.depth).toBe(12);
      expect(served.content.roster.map((enemy) => enemy.id)).toEqual(
        fallbackFloor12Json.enemyRosterIds
      );
    } finally {
      if (previousDirector === undefined) {
        delete process.env.DIRECTOR;
      } else {
        process.env.DIRECTOR = previousDirector;
      }
      resetWebTransportStateForTests();
    }
  });

  it("uses createdAt in the artifact run identity for new transport states", async () => {
    const seed = "transport-session-seed";
    const clientRunId = "transport-collision-test";
    const createdAtA = "2026-06-13T00:00:00.000Z";
    const createdAtB = "2026-06-13T00:00:01.000Z";
    const first = createWebTransportState({ seed, createdAt: createdAtA });
    const second = createWebTransportState({
      seed,
      createdAt: createdAtB,
      artifacts: first.artifacts
    });
    const firstArtifactRunId = traceRunId(seed, createdAtA);
    const secondArtifactRunId = traceRunId(seed, createdAtB);

    expect(first.artifactRunId).toBe(firstArtifactRunId);
    expect(second.artifactRunId).toBe(secondArtifactRunId);
    expect(firstArtifactRunId).not.toBe(secondArtifactRunId);

    await serveDepth5(first, clientRunId, "transport-session-a");
    await serveDepth5(second, clientRunId, "transport-session-b");

    expect(
      listRuns(first.artifacts)
        .map((run) => run.runId)
        .sort()
    ).toEqual([firstArtifactRunId, secondArtifactRunId].sort());
    expect(loadGenerationChain(firstArtifactRunId, 5, first.artifacts).runId).toBe(
      firstArtifactRunId
    );
    expect(
      loadGenerationChain(secondArtifactRunId, 5, first.artifacts).runId
    ).toBe(secondArtifactRunId);
  });
});

const serveDepth5 = async (
  state: ReturnType<typeof createWebTransportState>,
  runId: string,
  seed: string
) => {
  state.handlers.startGeneration({
    runId,
    depth: 4,
    trace: emptyTrace(runId)
  });

  const served = await state.handlers.getFloor({
    runId,
    depth: 5,
    seed
  });

  expect(served.source).toBe("generated");
  return served;
};

const emptyTrace = (runId: string, seed = "transport-test-seed"): ParsedTrace => ({
  header: {
    recordType: "header",
    protocolVersion: PROTOCOL_VERSION,
    engineVersion: ENGINE_VERSION,
    modelId: "transport-test",
    contentRef: {
      providerId: "fallback:old-stock",
      packVersion: "0.0.0"
    },
    seed,
    createdAt: "2026-06-13T00:00:00.000Z",
    runId
  },
  turns: []
});

const traceAfterFloorEnter = (
  trace: ParsedTrace,
  depth: number
): ParsedTrace => ({
  ...trace,
  turns: [
    ...trace.turns,
    {
      turn: trace.turns.length + 1,
      action: { kind: "descend" },
      events: [
        {
          turn: trace.turns.length + 1,
          type: "run_floor_entered",
          data: {
            floorId: `floor#${depth}`,
            depth,
            band: depthBandForDepth(depth),
            seed: `${trace.header.seed}:run:${depth}`,
            rosterCost: 0,
            spawnBudget: 0,
            placementDeviationCount: 0,
            hoardFeatureId: depth === config.runStructure.depthFloors ? "hoard" : null
          }
        }
      ],
      stateHash: `floor-${depth}`
    }
  ]
});
