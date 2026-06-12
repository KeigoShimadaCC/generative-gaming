import { describe, expect, it } from "vitest";

import type { BehavioralFacts } from "../../director/prompt/summarize.js";
import {
  validApproachMeleeBehaviorFixture,
  validFleeLowHpBehaviorFixture,
  validKeepRangeBehaviorFixture,
  validPatrolBehaviorFixture,
  validQuestDefinitionFixture,
  validThiefBehaviorFixture,
} from "../../schemas/fixtures/entities.js";
import {
  validLowestManifestFixture,
  validMiddleManifestFixture,
  validShallowsManifestFixture,
} from "../../schemas/fixtures/manifest.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import type { PersonaName } from "../personas/types.js";
import {
  hitRate,
  responsivenessMatrix,
  RESPONSIVENESS_DETECTOR_PROPOSAL,
} from "./responsiveness.js";

describe("responsiveness detectors", () => {
  it("scores high for same-persona responsive fixtures and low cross-persona", () => {
    const cases: readonly {
      readonly persona: PersonaName;
      readonly facts: BehavioralFacts;
      readonly manifest: FloorManifest;
    }[] = [
      {
        persona: "hoarder",
        facts: hoarderTraceFacts(),
        manifest: hoarderResponsiveManifest(),
      },
      {
        persona: "pacifist",
        facts: pacifistTraceFacts(),
        manifest: pacifistResponsiveManifest(),
      },
      {
        persona: "speedrunner",
        facts: speedrunnerTraceFacts(),
        manifest: speedrunnerResponsiveManifest(),
      },
      {
        persona: "completionist",
        facts: completionistTraceFacts(),
        manifest: completionistResponsiveManifest(),
      },
      {
        persona: "chaos",
        facts: chaosTraceFacts(),
        manifest: chaosResponsiveManifest(),
      },
    ];

    for (const testCase of cases) {
      const matrix = responsivenessMatrix(
        testCase.manifest,
        testCase.facts,
        testCase.persona,
      );
      const offDiagonalRates = Object.entries(matrix.crossPersona)
        .filter(([persona]) => persona !== testCase.persona)
        .map(([, rate]) => rate.rate);
      const maxCrossRate = Math.max(...offDiagonalRates);

      expect(matrix.samePersona.rate).toBeGreaterThanOrEqual(2 / 3);
      expect(maxCrossRate).toBeLessThanOrEqual(matrix.samePersona.rate / 2);
    }
  });

  it("does not count trivial completionist presence as responsiveness", () => {
    const rate = hitRate(
      thinCompletionistPresenceManifest(),
      completionistTraceFacts(),
      "completionist",
    );

    expect(rate.rate).toBe(0);
    expect(rate.detectors).toEqual([
      { id: "completionist_dialogue_depth", hit: false },
      { id: "completionist_quest_richness", hit: false },
      { id: "completionist_rich_callbacks", hit: false },
    ]);
  });

  it("keeps pacifist route and speedrunner compact detectors disambiguated", () => {
    const pacifistManifest = pacifistResponsiveManifest();
    const speedrunnerRate = hitRate(
      pacifistManifest,
      pacifistTraceFacts(),
      "speedrunner",
    );
    const pacifistRate = hitRate(
      pacifistManifest,
      pacifistTraceFacts(),
      "pacifist",
    );

    expect(
      pacifistRate.detectors.find(
        (hit) => hit.id === "pacifist_route_options",
      )?.hit,
    ).toBe(true);
    expect(
      speedrunnerRate.detectors.find(
        (hit) => hit.id === "speedrunner_compact_floor",
      )?.hit,
    ).toBe(false);
  });

  it("requires conjunctive pacifist soft-threat evidence", () => {
    const manifest = {
      ...pacifistResponsiveManifest(),
      roster: pacifistResponsiveManifest().roster.map((enemy) => ({
        ...enemy,
        behaviors: [validApproachMeleeBehaviorFixture],
      })),
    };
    const rate = hitRate(manifest, pacifistTraceFacts(), "pacifist");

    expect(
      rate.detectors.find((hit) => hit.id === "pacifist_soft_threats")?.hit,
    ).toBe(false);
  });

  it("does not count chaos origin mixing without content variance", () => {
    const manifest = {
      ...validShallowsManifestFixture,
      metadata: {
        ...validShallowsManifestFixture.metadata,
        originTags: { made: 1, old_stock: 1, kept: 1 },
      },
    };
    const rate = hitRate(manifest, chaosTraceFacts(), "chaos");

    expect(
      rate.detectors.find((hit) => hit.id === "chaos_content_variance")?.hit,
    ).toBe(false);
  });

  it("documents the detector proposal for human review", () => {
    const personas = new Set(
      RESPONSIVENESS_DETECTOR_PROPOSAL.map((detector) => detector.persona),
    );
    const uncertain = RESPONSIVENESS_DETECTOR_PROPOSAL.filter(
      (detector) => detector.uncertain === true,
    );

    expect(personas).toEqual(
      new Set<PersonaName>([
        "hoarder",
        "pacifist",
        "speedrunner",
        "completionist",
        "chaos",
      ]),
    );
    expect(uncertain.length).toBeGreaterThan(0);
    expect(
      RESPONSIVENESS_DETECTOR_PROPOSAL.every(
        (detector) => detector.id.length > 0 && detector.description.length > 0,
      ),
    ).toBe(true);
  });
});

const baseFacts = (): BehavioralFacts => ({
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
  floorCellsEstimate: 100,
  closeCallCount: 0,
  killsByEnemyType: {},
  questAccepted: 0,
  questRefused: 0,
  questCompleted: 0,
  totalTurns: 80,
});

const hoarderTraceFacts = (): BehavioralFacts => ({
  ...baseFacts(),
  combatEngagementRate: 0.1,
  fightsAvoided: 2,
  retreatCount: 1,
  retreatFrequency: 0.05,
  itemPickups: 8,
  itemUses: 1,
  hoardingSignal: 4,
  cellsVisited: 20,
});

const pacifistTraceFacts = (): BehavioralFacts => ({
  ...baseFacts(),
  fightsAvoided: 4,
  retreatCount: 2,
  retreatFrequency: 0.1,
  itemPickups: 1,
  explorationRatio: 0.12,
  cellsVisited: 18,
  totalTurns: 60,
});

const speedrunnerTraceFacts = (): BehavioralFacts => ({
  ...baseFacts(),
  itemPickups: 1,
  explorationRatio: 0.08,
  cellsVisited: 8,
  totalTurns: 35,
});

const completionistTraceFacts = (): BehavioralFacts => ({
  ...baseFacts(),
  combatEngagementRate: 1,
  fightsPicked: 2,
  itemPickups: 3,
  itemUses: 2,
  npcTalksInitiated: 2,
  explorationRatio: 0.45,
  cellsVisited: 45,
  questAccepted: 1,
  questCompleted: 1,
  totalTurns: 140,
});

const chaosTraceFacts = (): BehavioralFacts => ({
  ...baseFacts(),
  combatEngagementRate: 0.5,
  fightsPicked: 2,
  fightsAvoided: 2,
  itemPickups: 3,
  itemUses: 2,
  itemUsesByCategory: { food: 1, tool: 1 },
  closeCallCount: 1,
  questRefused: 1,
  cellsVisited: 25,
  totalTurns: 95,
});

const farSpreadHint = {
  roomIndex: null,
  distance: "far_from_entrance",
  spread: true,
} as const;

const nearEntranceHint = {
  roomIndex: null,
  distance: "near_entrance",
  spread: false,
} as const;

const hoarderResponsiveManifest = (): FloorManifest => {
  const base = validShallowsManifestFixture;

  return {
    ...base,
    roster: [
      {
        ...base.roster[0]!,
        behaviors: [validThiefBehaviorFixture],
      },
      base.roster[1]!,
    ],
    items: [
      ...base.items,
      {
        ...base.items[0]!,
        id: "hoarder-bonus-coin-a",
        name: "bonus coin a",
        kind: "coin",
      },
      {
        ...base.items[0]!,
        id: "hoarder-bonus-coin-b",
        name: "bonus coin b",
        kind: "coin",
      },
    ],
    narration: {
      ...base.narration,
      floorIntro:
        "Your pack remembers every hoard; bonus coin a presses into your palm.",
    },
  };
};

const pacifistResponsiveManifest = (): FloorManifest => {
  const base = validMiddleManifestFixture;

  return {
    ...base,
    params: {
      ...base.params,
      flavor: "ring",
      roomCountRange: { min: 5, max: 9 },
    },
    roster: base.roster.map((enemy, index) => ({
      ...enemy,
      placementHint: farSpreadHint,
      behaviors:
        index === 0
          ? [validKeepRangeBehaviorFixture]
          : [validFleeLowHpBehaviorFixture],
    })),
    narration: {
      floorIntro:
        "A quiet ring lets you slip past candle thief without striking.",
      observations: base.narration.observations,
    },
  };
};

const speedrunnerResponsiveManifest = (): FloorManifest => {
  const base = validLowestManifestFixture;

  return {
    ...base,
    params: {
      ...base.params,
      roomCountRange: { min: 4, max: 6 },
    },
    items: base.items.map((item, index) => ({
      ...item,
      placementHint: index < 2 ? nearEntranceHint : item.placementHint,
    })),
    narration: {
      floorIntro: "The stairs are near; a short, direct exit cuts straight on.",
      observations: [
        {
          id: "speed-obs-stairs",
          triggerTag: "stairs-short-route",
          text: "You see the stairs before the rooms can multiply.",
        },
      ],
    },
    metadata: {
      ...base.metadata,
      callbacks: ["stairs-short-route"],
    },
  };
};

const completionistResponsiveManifest = (): FloorManifest => {
  const base = validMiddleManifestFixture;
  const quest = {
    ...validQuestDefinitionFixture,
    objective: {
      ...validQuestDefinitionFixture.objective,
      fetch: {
        itemId: base.items[0]!.id,
        floorScope: "this_floor" as const,
      },
    },
  };

  return {
    ...base,
    quest,
    narration: {
      floorIntro:
        "The kept scrivener waits with Fixture Quest written in fresh ink.",
      observations: [
        {
          id: "completionist-obs-npc",
          triggerTag: "npc-talk",
          text: "The kept scrivener opens another branch of the story.",
        },
        {
          id: "completionist-obs-quest",
          triggerTag: "quest-map",
          text: "Fixture Quest points toward the rust pick you have not checked.",
        },
      ],
    },
    metadata: {
      ...base.metadata,
      callbacks: ["npc-talk", "quest-map"],
    },
  };
};

const chaosResponsiveManifest = (): FloorManifest => {
  const base = validLowestManifestFixture;

  return {
    ...base,
    roster: [
      {
        ...base.roster[0]!,
        behaviors: [validApproachMeleeBehaviorFixture, validThiefBehaviorFixture],
      },
      {
        ...base.roster[1]!,
        behaviors: [validKeepRangeBehaviorFixture, validPatrolBehaviorFixture],
      },
    ],
    narration: {
      floorIntro: "The floor changes its mind twice before you cross it.",
      observations: [
        {
          id: "chaos-obs-fight",
          triggerTag: "mixed-fight",
          text: "One threat invites a strike.",
        },
        {
          id: "chaos-obs-avoid",
          triggerTag: "mixed-avoid",
          text: "Another leaves just enough room to refuse it.",
        },
      ],
    },
    metadata: {
      ...base.metadata,
      callbacks: ["mixed-fight", "mixed-avoid"],
    },
  };
};

const thinCompletionistPresenceManifest = (): FloorManifest => {
  const base = validMiddleManifestFixture;
  const npc = base.npcs[0]!;

  return {
    ...base,
    npcs: [
      {
        ...npc,
        questHook: null,
        dialogue: {
          rootNodeId: "root",
          nodes: [
            {
              id: "root",
              text: "A short greeting.",
              choices: [
                {
                  id: "thin-a",
                  label: "Nod",
                  nextNodeId: null,
                  closesDialogue: true,
                  questHookId: null,
                },
                {
                  id: "thin-b",
                  label: "Leave",
                  nextNodeId: null,
                  closesDialogue: true,
                  questHookId: null,
                },
              ],
            },
          ],
        },
      },
    ],
    quest: {
      ...validQuestDefinitionFixture,
      title: "Errand",
      reward: {
        valueMultiplier: validQuestDefinitionFixture.reward.valueMultiplier,
        coin: null,
        itemIds: [],
        identifyItemIds: [],
      },
    },
    narration: {
      floorIntro: "Someone has a job.",
      observations: [],
    },
    metadata: {
      ...base.metadata,
      callbacks: [],
    },
  };
};
