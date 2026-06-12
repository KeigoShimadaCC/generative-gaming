import { afterEach, describe, expect, it } from "vitest";

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
import fallbackFloor12Json from "../../../content/fallback/floors/12.json" with { type: "json" };

import { createWebTransportState } from "./transport-server";

afterEach(() => {
  resetGlobalGenerationSemaphoreForTests();
});

describe("web director transport", () => {
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
