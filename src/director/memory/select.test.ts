import { describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import {
  LOCAL_PROFILE_ID,
  openDatabase,
  type MemoryEventType,
  type PersistenceDatabase,
} from "../../harness/persistence/index.js";
import { assemblePrompt } from "../prompt/assemble.js";
import type { TraceSummaryResult } from "../prompt/summarize.js";
import {
  approxMemoryTokens,
  buildPromptMemoryBlock,
  renderMemoryBlock,
  selectMemories,
} from "./index.js";

const CREATED_AT = "2026-06-12T00:00:00.000Z";

const traceFacts: TraceSummaryResult = {
  facts: {
    combatEngagementRate: 0.3,
    fightsPicked: 3,
    fightsAvoided: 7,
    retreatCount: 1,
    retreatFrequency: 0.02,
    itemPickups: 2,
    itemUses: 0,
    itemUsesByCategory: {},
    hoardingSignal: 2,
    npcTalksInitiated: 1,
    explorationRatio: 0.2,
    cellsVisited: 50,
    floorCellsEstimate: 250,
    closeCallCount: 1,
    killsByEnemyType: {},
    questAccepted: 0,
    questRefused: 1,
    questCompleted: 0,
    totalTurns: 50,
  },
  textBlock: "PLAYER TRACE SUMMARY\nTurns recorded: 50.",
};

describe("director memory selection", () => {
  it("propagates run 1 death into run 2 memory block", () => {
    const db = openMemoryDb();
    try {
      insertMemoryEvent(db, {
        id: "run-1-death",
        runId: "run-1",
        type: "death",
        payload: {
          floor: 3,
          cause: "running from the Ashen Bailiff",
        },
        createdAt: CREATED_AT,
        salience: 100,
      });

      const memoryBlock = buildPromptMemoryBlock({
        profileId: LOCAL_PROFILE_ID,
        currentRunId: "run-2",
        repo: db.memoryEvents,
        tokenBudget: 80,
      });
      const prompt = assemblePrompt({
        band: "shallows",
        depth: 1,
        config,
        bounds,
        traceFacts,
        memoryBlock,
        runContext: { seed: "run-2-seed", runId: "run-2" },
      });

      expect(memoryBlock).toContain("died running from the Ashen Bailiff");
      expect(promptMemorySection(prompt)).toMatchInlineSnapshot(`
        "CROSS-RUN MEMORY
        What the Deep remembers:
        - Run run-1: died running from the Ashen Bailiff on floor 3"
      `);
    } finally {
      db.close();
    }
  });

  it("orders memories by configured salience weights", () => {
    const db = openMemoryDb();
    try {
      insertMemoryEvent(db, eventSeed("deed-event", "deed", "noted a deed"));
      insertMemoryEvent(
        db,
        eventSeed("completion-event", "completion", "completed a quest"),
      );
      insertMemoryEvent(
        db,
        eventSeed("refusal-event", "refusal", "refused a quest"),
      );
      insertMemoryEvent(db, eventSeed("death-event", "death", "died"));

      const picks = selectMemories(
        LOCAL_PROFILE_ID,
        "run-current",
        db.memoryEvents,
        {
          salienceWeight: 0,
          recencyWeight: 0,
          tokenBudget: 120,
        },
      );

      expect(picks.map((pick) => pick.event.type)).toEqual([
        "death",
        "refusal",
        "completion",
        "deed",
      ]);
    } finally {
      db.close();
    }
  });

  it("keeps rendered memory block inside the token budget", () => {
    const db = openMemoryDb();
    try {
      for (let index = 0; index < 5; index += 1) {
        insertMemoryEvent(db, {
          id: `long-${index}`,
          runId: `run-long-${index}`,
          type: "deed",
          payload: {
            summary:
              "carried a candle through the longest possible corridor and ignored every safer door",
          },
          createdAt: `2026-06-12T00:0${index}:00.000Z`,
          salience: 50 - index,
        });
      }

      const picks = selectMemories(
        LOCAL_PROFILE_ID,
        "run-current",
        db.memoryEvents,
        {
          maxPicks: 5,
          tokenBudget: 24,
        },
      );
      const block = renderMemoryBlock(picks, { maxPicks: 5, tokenBudget: 24 });

      expect(block).toContain("What the Deep remembers:");
      expect(approxMemoryTokens(block)).toBeLessThanOrEqual(24);
    } finally {
      db.close();
    }
  });

  it("selects deterministically from the same repository state", () => {
    const db = openMemoryDb();
    try {
      insertMemoryEvent(db, eventSeed("tie-b", "deed", "second tied deed"));
      insertMemoryEvent(db, eventSeed("tie-a", "deed", "first tied deed"));

      const first = renderMemoryBlock(
        selectMemories(LOCAL_PROFILE_ID, "run-current", db.memoryEvents, {
          salienceWeight: 0,
          recencyWeight: 0,
        }),
      );
      const second = renderMemoryBlock(
        selectMemories(LOCAL_PROFILE_ID, "run-current", db.memoryEvents, {
          salienceWeight: 0,
          recencyWeight: 0,
        }),
      );

      expect(second).toBe(first);
      expect(first).toContain("tie-a");
    } finally {
      db.close();
    }
  });
});

type MemoryEventSeed = {
  readonly id: string;
  readonly runId: string;
  readonly type: MemoryEventType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly salience: number;
};

const openMemoryDb = (): PersistenceDatabase => {
  const db = openDatabase({ path: ":memory:" });
  db.profile.upsert({ createdAt: CREATED_AT });
  return db;
};

const insertMemoryEvent = (
  db: PersistenceDatabase,
  event: MemoryEventSeed,
): void => {
  db.memoryEvents.insert({
    profileId: LOCAL_PROFILE_ID,
    ...event,
  });
};

const eventSeed = (
  id: string,
  type: MemoryEventType,
  summary: string,
): MemoryEventSeed => ({
  id,
  runId: `run-${id}`,
  type,
  payload: { summary },
  createdAt: CREATED_AT,
  salience: 1,
});

const promptMemorySection = (prompt: string): string => {
  const start = prompt.indexOf("CROSS-RUN MEMORY");
  const end = prompt.indexOf("\n\nFLOOR MANIFEST TASK", start);
  return prompt.slice(start, end);
};
