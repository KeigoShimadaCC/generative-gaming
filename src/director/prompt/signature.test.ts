import { describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import { assemblePrompt } from "./assemble.js";
import { buildSignaturePromptPlan } from "./signature.js";
import type { AssemblePromptInput } from "./types.js";
import type { TraceSummaryResult } from "./summarize.js";

const traceFacts: TraceSummaryResult = {
  facts: {
    combatEngagementRate: 0.33,
    fightsPicked: 20,
    fightsAvoided: 40,
    retreatCount: 6,
    retreatFrequency: 0.02,
    itemPickups: 18,
    itemUses: 2,
    itemUsesByCategory: { food: 1, weapon: 1 },
    hoardingSignal: 16,
    npcTalksInitiated: 1,
    explorationRatio: 0.8,
    cellsVisited: 768,
    floorCellsEstimate: 960,
    closeCallCount: 2,
    killsByEnemyType: { "enemy#5": 4 },
    questAccepted: 1,
    questRefused: 1,
    questCompleted: 0,
    totalTurns: 300,
  },
  textBlock: [
    "PLAYER TRACE SUMMARY",
    "Combat: engagement 33% (20 fights picked, 40 avoided); retreats 6 (2.0% of turns).",
    "Items: 18 pickups, 2 uses; hoarding signal 16.00; profile food:1, weapon:1.",
    "Exploration: 768 cells seen (~80.0% of floor); close calls 2.",
    "Social: 1 talks initiated; quests accepted 1, refused 1, completed 0.",
    "Kills: enemy#5:4.",
    "Turns recorded: 300.",
  ].join("\n"),
};

describe("signature prompt planning", () => {
  it("relaxes signature budget numbers by the configured percent", () => {
    const plan = buildSignaturePromptPlan({
      band: "middle",
      config,
      bounds,
      signatureUsedThisRun: false,
    });

    expect(plan.ask).toBe(true);
    expect(plan.relaxPercent).toBe(25);
    expect(plan.budgets).toEqual({
      spawnBudget: { base: 45, prompt: 57 },
      maxEnemiesAlive: { base: 12, prompt: 15 },
      itemsPerFloorMax: { base: 8, prompt: 10 },
      trapsPerFloorMax: { base: 4, prompt: 5 },
      npcsPerFloorMax: { base: 2, prompt: 3 },
    });
  });

  it("asks for the signature moment exactly once across two middle floors", () => {
    const firstPrompt = assemblePrompt(middleInput(5, false));
    const secondPrompt = assemblePrompt(middleInput(6, true));
    const askCount = `${firstPrompt}\n${secondPrompt}`.match(
      /SIGNATURE MOMENT ASK/gu,
    )?.length;

    expect(askCount).toBe(1);
    expect(firstPrompt).toContain('"signature": true');
    expect(secondPrompt).toContain('"signature": false');
    expect(secondPrompt).toContain("Set metadata.signature to false");
  });

  it("snapshots the relaxed budget lines injected into the signature prompt", () => {
    const prompt = assemblePrompt(middleInput(5, false));
    const budgetLines = prompt
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("- spawn budget:") ||
          line.startsWith("- max enemies alive") ||
          line.startsWith("- items per floor:") ||
          line.startsWith("- traps per floor:") ||
          line.startsWith("- npcs per floor:"),
      )
      .join("\n");

    expect(budgetLines).toMatchInlineSnapshot(`
      "- spawn budget: 57 points (signature relaxed from 45 points by 25%)
      - max enemies alive per floor: 15 (signature relaxed from 12 by 25%)
      - items per floor: 4-10 (signature relaxed from 8 by 25%)
      - traps per floor: 0-5 (signature relaxed from 4 by 25%)
      - npcs per floor: 0-3 (signature relaxed from 2 by 25%)"
    `);
  });
});

const middleInput = (
  depth: number,
  signatureMomentUsedThisRun: boolean,
): AssemblePromptInput => ({
  band: "middle",
  depth,
  config,
  bounds,
  traceFacts,
  runContext: {
    seed: `signature-middle-${depth}`,
    runId: "signature-two-floor",
    signatureMomentUsedThisRun,
  },
});
