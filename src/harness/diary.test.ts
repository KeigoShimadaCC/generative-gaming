import { describe, expect, it } from "vitest";

import type { EngineLogEvent } from "../engine/events.js";
import { createInitialState, type GameState } from "../engine/state/index.js";
import { ENGINE_VERSION, PROTOCOL_VERSION } from "../schemas/protocol.js";
import type { GenerationRecord } from "./artifacts/types.js";
import { composeDiary } from "./diary.js";

describe("composeDiary", () => {
  it("is a pure function of run artifacts", () => {
    const artifacts = fixtureRunArtifacts();

    expect(composeDiary(artifacts)).toEqual(composeDiary(artifacts));
  });

  it("keeps every diary claim attached to a trace or artifact source", () => {
    const artifacts = fixtureRunArtifacts();
    const diary = composeDiary(artifacts);
    const sourceIds = new Set([
      ...artifacts.state.log.map(
        (event, index) => `event:${index}:${event.type}:${event.turn}`,
      ),
      ...artifacts.generations.map(
        (record) => `artifact:generation:${record.runId}:${record.depth}`,
      ),
    ]);

    const entries = diary.floors.flatMap((floor) => floor.entries);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.sources.length, entry.id).toBeGreaterThan(0);
      for (const source of entry.sources) {
        expect(sourceIds.has(source.id), entry.text).toBe(true);
      }
      expect(entry.text).not.toMatch(/\bmaybe\b|\bperhaps\b|\bprobably\b/iu);
    }
  });

  it("composes fixture-run diary content from kills, close calls, discoveries, quests, narration, callbacks, and fallbacks", () => {
    const diary = composeDiary(fixtureRunArtifacts());
    const text = diary.floors
      .flatMap((floor) => floor.entries.map((entry) => entry.text))
      .join("\n");

    expect(diary.mode).toBe("final");
    expect(diary.summary).toEqual({
      outcome: "victory",
      depth: 2,
      turns: 16,
      kills: 1,
      discoveries: 4,
    });
    expect(text).toContain("You kill enemy#1.");
    expect(text).toContain("You are struck down to 2 HP and keep moving.");
    expect(text).toContain("You learn old-stock:chalk.");
    expect(text).toContain("You are offered quest-lantern.");
    expect(text).toContain("You complete quest-lantern.");
    expect(text).toContain("You keep one hand on the stair.");
    expect(text).toContain("The Deep keeps npc#2 on the page.");
    expect(text).toContain("You walk floor 2 by Old Stock:");
    expect(diary.learnedNote).toContain("What the dungeon learned:");
    expect(diary.learnedNote).toContain("completed quest-lantern");
  });
});

const fixtureRunArtifacts = (): {
  readonly state: GameState;
  readonly generations: readonly GenerationRecord[];
} => {
  const base = createInitialState("diary-fixture");
  const events = fixtureEvents(base.run.runId, base.run.seed);

  return {
    state: {
      ...base,
      run: {
        ...base.run,
        depth: 2,
        turn: 16,
        terminalStatus: "WIN",
      },
      log: events,
    },
    generations: [fallbackGeneration(base.run.runId, base.run.seed)],
  };
};

const fixtureEvents = (
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
        beatId: "intro-1",
        beatKind: "floor_intro",
        triggerTag: null,
        text: "You keep one hand on the stair.",
      },
    },
    {
      turn: 5,
      type: "attack_hit",
      data: {
        actorId: "enemy#1",
        defenderId: "player",
        attackerAttack: 4,
        defenderDefense: 1,
        baseDamage: 3,
        damage: 3,
        hitRoll: 7,
        hitChancePercent: 70,
        varianceMultiplier: 1,
        defenderHpBefore: 5,
        defenderHpAfter: 2,
      },
    },
    {
      turn: 6,
      type: "entity_died",
      data: {
        entityId: "enemy#1",
        kind: "enemy",
        position: { x: 3, y: 4 },
        xpYield: 2,
      },
    },
    {
      turn: 8,
      type: "item_identified",
      data: {
        itemInstanceId: "item-instance-1",
        definitionId: "old-stock:chalk",
        category: "note",
      },
    },
    {
      turn: 9,
      type: "dialogue_opened",
      data: { npcId: "npc#2", nodeId: "root" },
    },
    {
      turn: 10,
      type: "quest_offered",
      data: { questId: "quest-lantern", npcId: "npc#2" },
    },
    {
      turn: 11,
      type: "quest_accepted",
      data: { questId: "quest-lantern", npcId: "npc#2" },
    },
    {
      turn: 12,
      type: "run_floor_entered",
      data: {
        floorId: "floor-2",
        depth: 2,
        band: "shallows",
        seed,
        rosterCost: 4,
        spawnBudget: 5,
        placementDeviationCount: 0,
        hoardFeatureId: null,
      },
    },
    {
      turn: 15,
      type: "quest_completed",
      data: { questId: "quest-lantern", rewardCoin: 3 },
    },
    {
      turn: 16,
      type: "hoard_taken",
      data: {
        featureId: "hoard#1",
        name: "the quiet bell",
        depth: 2,
        position: { x: 9, y: 9 },
      },
    },
    {
      turn: 16,
      type: "terminal_state",
      data: { status: "WIN", reason: "fixture" },
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
  createdAt: "2026-06-12T00:00:00.000Z",
  runId,
  depth: 2,
  attempts: [],
  outcome: {
    kind: "fallback",
    fallbackId: "fallback:old-stock:shallows-2",
  },
});
