import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { defaultUi, useGameStore } from "../../app/store/game-store";
import { bounds, config } from "../../src/config/index.js";
import {
  buildPromptMemoryBlock,
} from "../../src/director/memory/index.js";
import { assemblePrompt } from "../../src/director/prompt/assemble.js";
import { summarizeTrace, type TraceSummaryResult } from "../../src/director/prompt/summarize.js";
import type { EngineLogEvent } from "../../src/engine/events.js";
import { currentFloorRuntime } from "../../src/engine/run/index.js";
import type { GameState, Position } from "../../src/engine/state/index.js";
import { createInitialState } from "../../src/engine/state/init.js";
import {
  MemoryArtifactFs,
  type GenerationRecord,
} from "../../src/harness/artifacts/index.js";
import { composeDiary } from "../../src/harness/diary.js";
import {
  LOCAL_PROFILE_ID,
  openDatabase,
  type PersistenceDatabase,
} from "../../src/harness/persistence/index.js";
import { parseTraceNdjson } from "../../src/harness/replay/index.js";
import type { EvalReport } from "../../src/evals/runner/report.js";
import {
  defaultEvalRunnerConfig,
  runEvalSuite,
} from "../../src/evals/runner/run.js";
import { ENGINE_VERSION, PROTOCOL_VERSION } from "../../src/schemas/protocol.js";

const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));
const CREATED_AT = "2026-06-12T00:00:00.000Z";
const CREATED_AT_LATER = "2026-06-12T01:00:00.000Z";

describe("M2 integration milestone", () => {
  it("threads run 1 death into run 2 prompt through persisted memory", () => {
    const dir = mkdtempSync(join(tmpdir(), "everdeep-m2-memory-"));
    const dbPath = join(dir, "m2.sqlite");

    try {
      const writer = openSeededDatabase(dbPath);
      writer.memoryEvents.insert({
        id: "m2-run-1-death",
        profileId: LOCAL_PROFILE_ID,
        runId: "m2-run-1",
        type: "death",
        payload: {
          summary: "died to the stair warden on floor 4",
          floor: 4,
        },
        createdAt: CREATED_AT,
        salience: 100,
      });
      writer.close();

      const reader = openSeededDatabase(dbPath);
      const memoryBlock = buildPromptMemoryBlock({
        profileId: LOCAL_PROFILE_ID,
        currentRunId: "m2-run-2",
        repo: reader.memoryEvents,
      });
      const prompt = assemblePrompt({
        band: "shallows",
        depth: 1,
        config,
        bounds,
        traceFacts: emptyTraceSummary(),
        memoryBlock,
        runContext: {
          seed: "m2-run-2-seed",
          runId: "m2-run-2",
        },
      });

      expect(memoryBlock).toContain(
        "Run m2-run-1: died to the stair warden on floor 4",
      );
      expect(prompt).toContain("CROSS-RUN MEMORY");
      expect(prompt).toContain(
        "Run m2-run-1: died to the stair warden on floor 4",
      );
      expect(prompt).not.toContain("Run m2-run-2: died");
      reader.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps the dungeon diary faithful to fixture run sources", () => {
    const artifacts = fixtureDiaryArtifacts();
    const diary = composeDiary(artifacts);
    const entries = diary.floors.flatMap((floor) => floor.entries);
    const sourceIds = new Set([
      ...artifacts.state.log.map(
        (event, index) => `event:${index}:${event.type}:${event.turn}`,
      ),
      ...artifacts.generations.map(
        (record) => `artifact:generation:${record.runId}:${record.depth}`,
      ),
    ]);
    const text = entries.map((entry) => entry.text).join("\n");

    expect(diary.mode).toBe("final");
    expect(diary.summary).toMatchObject({
      outcome: "defeat",
      depth: 1,
      turns: 9,
      kills: 1,
    });
    expect(text).toContain("The stair remembers the hand that trembled.");
    expect(text).toContain("You are struck down to 2 HP and keep moving.");
    expect(text).toContain("You kill enemy#1.");
    expect(text).toContain("You walk floor 1 by Old Stock:");
    expect(diary.learnedNote).toContain("the delver died");

    for (const entry of entries) {
      expect(entry.sources.length, entry.text).toBeGreaterThan(0);
      for (const source of entry.sources) {
        expect(sourceIds.has(source.id), entry.text).toBe(true);
      }
      expect(entry.text).not.toMatch(/\bmaybe\b|\bperhaps\b|\bprobably\b/iu);
    }
  });

  it(
    "keeps tuned mock responsiveness scores at or above the Phase 47 baseline",
    async () => {
      const baseline = readMockBaseline();
      const fs = new MemoryArtifactFs();
      const candidate = await runEvalSuite({
        ...defaultEvalRunnerConfig({
          mode: "mock",
          evalId: "m2-mock-candidate",
        }),
        startedAt: CREATED_AT,
        completedAt: CREATED_AT_LATER,
        gitRev: "m2-test",
        fs,
      });
      const prompt = assemblePrompt({
        band: "shallows",
        depth: 3,
        config,
        bounds,
        traceFacts: summarizeTrace(readEvalTrace("hoarder-persona-bank-1.ndjson"), {
          band: "shallows",
        }),
        runContext: {
          seed: "m2-prompt-seed",
          runId: "m2-prompt-run",
        },
      });

      expect(candidate.report.status).toBe("complete");
      expect(candidate.report.overall.recordCount).toBe(
        baseline.overall.recordCount,
      );
      expect(candidate.report.thesis.responsiveness.sampleCount).toBeGreaterThan(
        0,
      );
      expect(
        candidate.report.thesis.responsiveness.samePersonaHitRate,
      ).toBeGreaterThanOrEqual(
        baseline.thesis.responsiveness.samePersonaHitRate,
      );
      expect(
        candidate.report.thesis.responsiveness.crossPersonaHitRate,
      ).toBeLessThanOrEqual(
        baseline.thesis.responsiveness.crossPersonaHitRate,
      );
      expect(prompt).toContain("RESPONSIVENESS TARGETS");
      expect(prompt).toContain("Hoarder-clear");
    },
    600_000,
  );

  it("records transition budget instrumentation after a fixture descend", async () => {
    resetGameStore();
    const originalFetch = globalThis.fetch;
    const offlineFetch: typeof fetch = async () => {
      throw new Error("offline artifact-free test transport");
    };
    vi.stubGlobal("fetch", offlineFetch);

    try {
      useGameStore.getState().startGameSession({ seed: "m2-transition" });
      const state = useGameStore.getState().gameState;
      if (state === null) {
        throw new Error("store did not start a game session");
      }
      const runtime = currentFloorRuntime(state);
      if (runtime === null) {
        throw new Error("fixture floor runtime missing");
      }

      useGameStore
        .getState()
        .setGameState(withPlayerPosition(state, runtime.stairsDown));
      const result = useGameStore.getState().dispatchAction({ kind: "descend" });
      expect(result).toBeNull();

      await flushAsync();

      const sample = useGameStore.getState().latencySamples.at(-1);
      expect(sample).toMatchObject({
        runId: state.run.runId,
        fromDepth: 1,
        toDepth: 2,
        controllerState: "none",
        servedSource: "fallback",
      });
      expect(sample?.stairsToPlayableMs).toEqual(expect.any(Number));
      expect(sample?.recordedAtMs).toEqual(expect.any(Number));
      expect(useGameStore.getState().gameState?.run.depth).toBe(2);
    } finally {
      vi.stubGlobal("fetch", originalFetch);
      resetGameStore();
    }
  });
});

const openSeededDatabase = (dbPath: string): PersistenceDatabase => {
  const db = openDatabase({ path: dbPath });
  db.profile.upsert({
    createdAt: CREATED_AT,
    settings: { hintsEnabled: true },
  });
  return db;
};

const emptyTraceSummary = (): TraceSummaryResult => ({
  facts: {
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
    floorCellsEstimate: 1,
    closeCallCount: 0,
    killsByEnemyType: {},
    questAccepted: 0,
    questRefused: 0,
    questCompleted: 0,
    totalTurns: 0,
  },
  textBlock: [
    "PLAYER TRACE SUMMARY",
    "Combat: engagement 0% (0 fights picked, 0 avoided); retreats 0 (0.0% of turns).",
    "Items: 0 pickups, 0 uses; hoarding signal 0.00.",
    "Exploration: 0 cells seen (~0.0% of floor); close calls 0.",
    "Social: 0 talks initiated; quests accepted 0, refused 0, completed 0.",
    "Turns recorded: 0.",
  ].join("\n"),
});

const fixtureDiaryArtifacts = (): {
  readonly state: GameState;
  readonly generations: readonly GenerationRecord[];
} => {
  const base = createInitialState("m2-diary-fixture");
  const events = fixtureDiaryEvents(base.run.runId, base.run.seed);

  return {
    state: {
      ...base,
      run: {
        ...base.run,
        turn: 9,
        terminalStatus: "LOSS",
      },
      log: events,
    },
    generations: [fallbackGeneration(base.run.runId, base.run.seed)],
  };
};

const fixtureDiaryEvents = (
  runId: string,
  seed: string,
): readonly EngineLogEvent[] =>
  [
    {
      turn: 0,
      type: "state_created",
      data: { runId, seed, depth: 1, band: "shallows" },
    },
    {
      turn: 0,
      type: "run_floor_entered",
      data: {
        floorId: "floor-1",
        depth: 1,
        band: "shallows",
        seed,
        rosterCost: 3,
        spawnBudget: 5,
        placementDeviationCount: 0,
        hoardFeatureId: null,
      },
    },
    {
      turn: 1,
      type: "deep_narration",
      data: {
        depth: 1,
        beatId: "m2-intro",
        beatKind: "floor_intro",
        triggerTag: null,
        text: "The stair remembers the hand that trembled.",
      },
    },
    {
      turn: 4,
      type: "attack_hit",
      data: {
        actorId: "enemy#1",
        defenderId: "player",
        attackerAttack: 4,
        defenderDefense: 1,
        baseDamage: 3,
        damage: 3,
        hitRoll: 11,
        hitChancePercent: 70,
        varianceMultiplier: 1,
        defenderHpBefore: 5,
        defenderHpAfter: 2,
      },
    },
    {
      turn: 5,
      type: "entity_died",
      data: {
        entityId: "enemy#1",
        kind: "enemy",
        position: { x: 2, y: 2 },
        xpYield: 2,
      },
    },
    {
      turn: 9,
      type: "entity_died",
      data: {
        entityId: "player",
        kind: "player",
        position: { x: 3, y: 2 },
        xpYield: 0,
      },
    },
    {
      turn: 9,
      type: "terminal_state",
      data: { status: "LOSS", reason: "fixture death" },
    },
  ] as readonly EngineLogEvent[];

const fallbackGeneration = (
  runId: string,
  seed: string,
): GenerationRecord => ({
  recordType: "generation",
  protocolVersion: PROTOCOL_VERSION,
  engineVersion: ENGINE_VERSION,
  modelId: "mock",
  seed,
  createdAt: CREATED_AT,
  runId,
  depth: 1,
  attempts: [],
  outcome: {
    kind: "fallback",
    fallbackId: "fallback:old-stock:shallows-1",
  },
});

const readMockBaseline = (): EvalReport => {
  const raw = JSON.parse(
    readFileSync(
      join(ROOT_DIR, "tests", "eval-baselines", "mock-baseline.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const { _baseline: _ignored, ...report } = raw;
  return report as EvalReport;
};

const readEvalTrace = (fileName: string) =>
  parseTraceNdjson(
    readFileSync(join(ROOT_DIR, "tests", "eval-bank", fileName), "utf8"),
  );

const withPlayerPosition = (
  state: GameState,
  position: Position,
): GameState => ({
  ...state,
  player: {
    ...state.player,
    position,
  },
});

const resetGameStore = (): void => {
  useGameStore.setState({
    gameState: null,
    gameSession: null,
    screen: "title",
    activeRun: null,
    runIndex: [],
    terminalRun: null,
    transition: null,
    arrivalIntroLine: null,
    latencySamples: [],
    ui: defaultUi,
  });
};

const flushAsync = async (): Promise<void> => {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
};
