import { describe, expect, it } from "vitest";

import {
  buildLearnedSummary,
  createRunCallbackTracker,
  renderRunCallbackBlock,
} from "./index.js";

describe("director run callbacks", () => {
  it("tracks entities and quests referenced earlier this run", () => {
    const tracker = createRunCallbackTracker();

    tracker.recordEvents([
      {
        turn: 2,
        type: "dialogue_opened",
        data: { npcId: "npc#2", nodeId: "root" },
      },
      {
        turn: 3,
        type: "quest_refused",
        data: { questId: "quest-mirror", npcId: "npc#2" },
      },
      {
        turn: 5,
        type: "attack_hit",
        data: { actorId: "player", defenderId: "enemy#1" },
      },
    ]);

    const snapshot = tracker.snapshot();
    expect(snapshot.quests.map((quest) => quest.id)).toEqual(["quest-mirror"]);
    expect(snapshot.entities.map((entity) => entity.id)).toEqual([
      "npc#2",
      "enemy#1",
    ]);
    expect(renderRunCallbackBlock(snapshot)).toContain(
      "quest quest-mirror: quest_refused (1)",
    );
  });

  it("derives a learned summary from a known event sequence", () => {
    const summary = buildLearnedSummary(
      { outcome: "defeat", depth: 4, turns: 87 },
      [
        {
          turn: 4,
          type: "dialogue_opened",
          data: { npcId: "npc#2", nodeId: "root" },
        },
        {
          turn: 6,
          type: "quest_refused",
          data: { questId: "quest-mirror", npcId: "npc#2" },
        },
        {
          turn: 30,
          type: "quest_completed",
          data: { questId: "quest-lantern" },
        },
        {
          turn: 87,
          type: "entity_died",
          data: { entityId: "player", kind: "player" },
        },
      ],
    );

    expect(summary).toBe(
      "What the dungeon learned: the run ended in defeat on floor 4 after 87 turns; the delver died; refused quest-mirror; completed quest-lantern; callbacks should remember npc#2.",
    );
  });
});
