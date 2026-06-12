import { describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import { assemblePrompt } from "./assemble.js";
import type { AssemblePromptInput } from "./types.js";
import { PROMPT_MAX_CHAR_LENGTH } from "./types.js";
import type { TraceSummaryResult } from "./summarize.js";

const shallowTraceFacts: TraceSummaryResult = {
  facts: {
    combatEngagementRate: 0.42,
    fightsPicked: 18,
    fightsAvoided: 25,
    retreatCount: 2,
    retreatFrequency: 0.01,
    itemPickups: 6,
    itemUses: 1,
    itemUsesByCategory: { "pickup:oldstock": 6 },
    hoardingSignal: 6,
    npcTalksInitiated: 0,
    explorationRatio: 0.12,
    cellsVisited: 77,
    floorCellsEstimate: 640,
    closeCallCount: 0,
    killsByEnemyType: { "enemy#2": 3 },
    questAccepted: 0,
    questRefused: 0,
    questCompleted: 0,
    totalTurns: 200,
  },
  textBlock: [
    "PLAYER TRACE SUMMARY",
    "Combat: engagement 42% (18 fights picked, 25 avoided); retreats 2 (1.0% of turns).",
    "Items: 6 pickups, 1 uses; hoarding signal 6.00; profile pickup:oldstock:6.",
    "Exploration: 77 cells seen (~12.0% of floor); close calls 0.",
    "Social: 0 talks initiated; quests accepted 0, refused 0, completed 0.",
    "Kills: enemy#2:3.",
    "Turns recorded: 200.",
  ].join("\n"),
};

const middleTraceFacts: TraceSummaryResult = {
  facts: {
    combatEngagementRate: 0.55,
    fightsPicked: 40,
    fightsAvoided: 33,
    retreatCount: 1,
    retreatFrequency: 0.005,
    itemPickups: 12,
    itemUses: 4,
    itemUsesByCategory: { food: 2, weapon: 2 },
    hoardingSignal: 3,
    npcTalksInitiated: 2,
    explorationRatio: 0.18,
    cellsVisited: 173,
    floorCellsEstimate: 960,
    closeCallCount: 1,
    killsByEnemyType: { "enemy#5": 5, "enemy#9": 2 },
    questAccepted: 1,
    questRefused: 0,
    questCompleted: 0,
    totalTurns: 400,
  },
  textBlock: [
    "PLAYER TRACE SUMMARY",
    "Combat: engagement 55% (40 fights picked, 33 avoided); retreats 1 (0.5% of turns).",
    "Items: 12 pickups, 4 uses; hoarding signal 3.00; profile food:2, weapon:2.",
    "Exploration: 173 cells seen (~18.0% of floor); close calls 1.",
    "Social: 2 talks initiated; quests accepted 1, refused 0, completed 0.",
    "Kills: enemy#5:5, enemy#9:2.",
    "Turns recorded: 400.",
  ].join("\n"),
};

const shallowInput: AssemblePromptInput = {
  band: "shallows",
  depth: 3,
  config,
  bounds,
  traceFacts: shallowTraceFacts,
  runContext: { seed: "fixture-shallows-3", runId: "snapshot-shallows" },
};

const middleInput: AssemblePromptInput = {
  band: "middle",
  depth: 6,
  config,
  bounds,
  traceFacts: middleTraceFacts,
  memoryBlock: null,
  runContext: { seed: "fixture-middle-6", runId: "snapshot-middle" },
};

describe("assemblePrompt", () => {
  it("assembles a stable shallows prompt snapshot", () => {
    expect(assemblePrompt(shallowInput)).toMatchSnapshot();
  });

  it("assembles a stable middle prompt snapshot", () => {
    expect(assemblePrompt(middleInput)).toMatchSnapshot();
  });

  it("stays within the prompt character budget", () => {
    const prompt = assemblePrompt(shallowInput);
    expect(prompt.length).toBeLessThan(PROMPT_MAX_CHAR_LENGTH);
    expect(prompt.length).toBeLessThan(22_000);
  });

  it("includes optional memory block when provided", () => {
    const withMemory = assemblePrompt({
      ...middleInput,
      memoryBlock: "Last run ended on floor 8 running from poison.",
    });

    expect(withMemory).toContain("CROSS-RUN MEMORY");
    expect(withMemory).toContain("running from poison");
  });
});
