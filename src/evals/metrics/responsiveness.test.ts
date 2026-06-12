import { describe, expect, it } from "vitest";

import type { BehavioralFacts } from "../../director/prompt/summarize.js";
import { validApproachMeleeBehaviorFixture } from "../../schemas/fixtures/entities.js";
import {
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
    const hoarderFacts = hoarderTraceFacts();
    const hoarderManifest = hoarderResponsiveManifest();
    const matrix = responsivenessMatrix(
      hoarderManifest,
      hoarderFacts,
      "hoarder",
    );

    expect(matrix.samePersona.rate).toBeGreaterThan(0.5);
    expect(matrix.crossPersona.pacifist.rate).toBeLessThan(
      matrix.samePersona.rate,
    );
    expect(matrix.crossPersona.speedrunner.rate).toBeLessThan(
      matrix.samePersona.rate,
    );
  });

  it("scores pacifist-responsive content higher for pacifist than hoarder", () => {
    const pacifistFacts = pacifistTraceFacts();
    const pacifistManifest = pacifistResponsiveManifest();
    const hoarderRate = hitRate(pacifistManifest, pacifistFacts, "hoarder");
    const pacifistRate = hitRate(pacifistManifest, pacifistFacts, "pacifist");

    expect(pacifistRate.rate).toBeGreaterThan(hoarderRate.rate);
    expect(pacifistRate.detectors.find((hit) => hit.id === "pacifist_caution_narration")?.hit).toBe(
      true,
    );
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

const hoarderTraceFacts = (): BehavioralFacts => ({
  combatEngagementRate: 0.1,
  fightsPicked: 0,
  fightsAvoided: 2,
  retreatCount: 1,
  retreatFrequency: 0.05,
  itemPickups: 8,
  itemUses: 1,
  itemUsesByCategory: {},
  hoardingSignal: 4,
  npcTalksInitiated: 0,
  explorationRatio: 0.2,
  cellsVisited: 20,
  floorCellsEstimate: 100,
  closeCallCount: 0,
  killsByEnemyType: {},
  questAccepted: 0,
  questRefused: 0,
  questCompleted: 0,
  totalTurns: 80,
});

const pacifistTraceFacts = (): BehavioralFacts => ({
  combatEngagementRate: 0,
  fightsPicked: 0,
  fightsAvoided: 4,
  retreatCount: 2,
  retreatFrequency: 0.1,
  itemPickups: 1,
  itemUses: 0,
  itemUsesByCategory: {},
  hoardingSignal: 0,
  npcTalksInitiated: 0,
  explorationRatio: 0.12,
  cellsVisited: 18,
  floorCellsEstimate: 100,
  closeCallCount: 0,
  killsByEnemyType: {},
  questAccepted: 0,
  questRefused: 0,
  questCompleted: 0,
  totalTurns: 60,
});

const hoarderResponsiveManifest = (): FloorManifest => {
  const base = validShallowsManifestFixture;

  return {
    ...base,
    roster: [
      {
        ...base.roster[0]!,
        behaviors: [{ ...validApproachMeleeBehaviorFixture, kind: "thief" }],
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
      floorIntro: "A heavy cache of treasure waits in every alcove.",
    },
  };
};

const pacifistResponsiveManifest = (): FloorManifest => {
  const base = validMiddleManifestFixture;

  return {
    ...base,
    params: {
      ...base.params,
      flavor: "open",
      roomCountRange: { min: 5, max: 9 },
    },
    roster: base.roster.map((enemy) => ({
      ...enemy,
      placementHint:
        enemy.placementHint?.distance === "near_entrance"
          ? {
              roomIndex: null,
              distance: "far_from_entrance",
              spread: true,
            }
          : enemy.placementHint,
      behaviors: enemy.behaviors.map((behavior) => ({
        ...behavior,
        kind: "keep_range",
      })),
    })),
    narration: {
      floorIntro: "Quiet halls invite a careful, peaceful passage.",
      observations: base.narration.observations,
    },
  };
};
