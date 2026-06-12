import { bounds, config } from "../../config/index.js";
import {
  makeBehaviorFixture,
  validApproachMeleeBehaviorFixture,
  validDeliverObjectiveFixture,
  validQuestDefinitionFixture,
  validTrapDefinitionFixture,
} from "../../schemas/fixtures/entities.js";
import {
  makeEffectBundleFixture,
  makeEffectFixture,
  makeTriggerFixture,
  validSelfTargetingFixture,
  validUseTriggerFixture,
} from "../../schemas/fixtures/vocab.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import type { QuestDefinition } from "../../schemas/entities/index.js";
import {
  validLowestManifestFixture,
  validMiddleManifestFixture,
  validShallowsManifestFixture,
} from "../../schemas/fixtures/manifest.js";
import { PROTOCOL_VERSION } from "../../schemas/protocol.js";
import type { GateReasonCode } from "./report.js";

/** Phase-30 entity fixtures use placeholder ids; gate 1 expects floor-local refs. */
export const withGateLegalEntityRefs = (
  manifest: FloorManifest,
): FloorManifest => {
  if (manifest.items.length < 2) {
    return manifest;
  }

  const [primaryItem, secondaryItem] = manifest.items;
  const patchQuest = (quest: QuestDefinition): QuestDefinition => {
    if (quest.objective.kind !== "fetch" || quest.objective.fetch === null) {
      return quest;
    }

    return {
      ...quest,
      objective: {
        ...quest.objective,
        fetch: {
          ...quest.objective.fetch,
          itemId: primaryItem!.id,
        },
      },
    };
  };

  return {
    ...manifest,
    quest: manifest.quest === null ? null : patchQuest(manifest.quest),
    npcs: manifest.npcs.map((npc) => ({
      ...npc,
      merchantInventoryItemIds: [primaryItem!.id, secondaryItem!.id],
      questHook: npc.questHook === null ? null : patchQuest(npc.questHook),
    })),
  };
};

export const gateLegalValidManifestFixtures = [
  validShallowsManifestFixture,
  withGateLegalEntityRefs(validMiddleManifestFixture),
  validLowestManifestFixture,
] as const satisfies readonly FloorManifest[];

export type AdversarialGateFixture = {
  readonly code: GateReasonCode;
  readonly label: string;
  readonly raw?: string;
  readonly manifest?: FloorManifest;
  readonly context?: { readonly signatureUsedThisRun: boolean };
};

const shallowRat = {
  ...validShallowsManifestFixture.roster[0]!,
  id: "shallow-affordable-rat",
  stats: {
    band: "shallows" as const,
    hp: 4,
    attack: 2,
    defense: 0,
    xpYield: 2,
  },
  behaviors: [validApproachMeleeBehaviorFixture],
  abilities: [],
};

const expensiveThief = {
  ...validShallowsManifestFixture.roster[0]!,
  id: "shallow-expensive-thief",
  stats: {
    band: "shallows" as const,
    hp: 8,
    attack: 3,
    defense: 1,
    xpYield: 5,
  },
  behaviors: [
    makeBehaviorFixture("thief", "thief", {}),
    makeBehaviorFixture("flee_low_hp", "fleeLowHp", {
      thresholdPercent:
        bounds.enemyDesign.behaviorVocabulary.parameters
          .fleeLowHpThresholdPercent.min,
    }),
  ],
  abilities: [
    makeEffectBundleFixture(
      [
        makeEffectFixture("blink", "blink", {
          distanceTiles:
            bounds.effectVocabulary.verbs.blink.distanceTiles.min,
        }),
      ],
      validUseTriggerFixture,
      validSelfTargetingFixture,
    ),
  ],
};

const lethalTrap = {
  ...validTrapDefinitionFixture,
  id: "shallow-lethal-trap",
  name: "lethal trap",
  placementHint: null,
  effectBundle: makeEffectBundleFixture(
    [
      makeEffectFixture("damage", "damage", {
        amount: bounds.effectVocabulary.verbs.damage.amount.max,
      }),
      makeEffectFixture("apply_status", "applyStatus", {
        status: "burn",
        duration: bounds.statusVocabulary.durationTurns.burn.max,
      }),
    ],
    makeTriggerFixture("step", "step", {}),
    validSelfTargetingFixture,
  ),
};

const overCapNarration = "x".repeat(
  bounds.directorManifest.textCaps.narrationLineMaxChars + 1,
);

export const gate0AdversarialFixtures: readonly AdversarialGateFixture[] = [
  {
    code: "G0_NO_JSON",
    label: "missing JSON object",
    raw: "no manifest here",
  },
  {
    code: "G0_INVALID_JSON",
    label: "broken JSON",
    raw: '{"depth":}',
  },
  {
    code: "G0_SCHEMA",
    label: "schema violation",
    raw: JSON.stringify({
      ...validShallowsManifestFixture,
      protocolVersion: "0.0.0",
    }),
  },
];

export const gate1AdversarialFixtures: readonly AdversarialGateFixture[] = [
  {
    code: "G1_PROTOCOL_VERSION",
    label: "wrong protocol version",
    manifest: {
      ...validShallowsManifestFixture,
      protocolVersion: "0.0.0" as typeof PROTOCOL_VERSION,
    },
  },
  {
    code: "G1_REF_INTEGRITY",
    label: "quest deliver references missing npc",
    manifest: {
      ...validShallowsManifestFixture,
      quest: {
        ...validQuestDefinitionFixture,
        objective: validDeliverObjectiveFixture,
      },
    },
  },
  {
    code: "G1_CALLBACK_REF",
    label: "callback without observation trigger",
    manifest: {
      ...validShallowsManifestFixture,
      metadata: {
        ...validShallowsManifestFixture.metadata,
        callbacks: ["orphan-callback"],
      },
    },
  },
  {
    code: "G1_PLACEMENT_HINT",
    label: "room index outside params range",
    manifest: {
      ...validShallowsManifestFixture,
      roster: [
        {
          ...validShallowsManifestFixture.roster[0]!,
          placementHint: {
            roomIndex: 99,
            distance: null,
            spread: false,
          },
        },
        validShallowsManifestFixture.roster[1]!,
      ],
    },
  },
  {
    code: "G1_ROSTER_BUDGET",
    label: "spawn budget exceeded",
    manifest: {
      ...validShallowsManifestFixture,
      roster: [expensiveThief, { ...expensiveThief, id: "shallow-expensive-thief-2" }],
    },
  },
  {
    code: "G1_ENEMY_STATS",
    label: "enemy stats band mismatch",
    manifest: {
      ...validShallowsManifestFixture,
      roster: [
        {
          ...validShallowsManifestFixture.roster[0]!,
          stats: {
            band: "middle",
            hp: bounds.enemyDesign.statBudgetsByBand.middle.hp.min,
            attack: bounds.enemyDesign.statBudgetsByBand.middle.attack.min,
            defense: bounds.enemyDesign.statBudgetsByBand.middle.defense.min,
            xpYield: bounds.enemyDesign.statBudgetsByBand.middle.xpYield.min,
          },
        },
        validShallowsManifestFixture.roster[1]!,
      ],
    },
  },
  {
    code: "G1_ITEM_VALUE",
    label: "item value band mismatch",
    manifest: {
      ...validShallowsManifestFixture,
      items: [
        {
          ...validShallowsManifestFixture.items[0]!,
          value: {
            band: "middle",
            coin: config.itemsEconomy.valueBandsCoin.middle.min,
          },
        },
        ...validShallowsManifestFixture.items.slice(1),
      ],
    },
  },
  {
    code: "G1_TRAP_LETHALITY",
    label: "lethal trap bundle",
    manifest: {
      ...validShallowsManifestFixture,
      traps: [lethalTrap],
    },
  },
  {
    code: "G1_ENTITY_CAP",
    label: "roster exceeds band alive cap",
    manifest: {
      ...validShallowsManifestFixture,
      roster: Array.from(
        { length: bounds.enemyDesign.statBudgetsByBand.shallows.maxEnemiesAlivePerFloor + 1 },
        (_, index) => ({
          ...shallowRat,
          id: `shallow-rat-${index}`,
        }),
      ),
    },
  },
  {
    code: "G1_TEXT_CAP",
    label: "floor intro over narration cap",
    manifest: {
      ...validShallowsManifestFixture,
      narration: {
        ...validShallowsManifestFixture.narration,
        floorIntro: overCapNarration,
      },
    },
  },
  {
    code: "G1_SIGNATURE",
    label: "duplicate signature in one run",
    manifest: withGateLegalEntityRefs(validMiddleManifestFixture),
    context: { signatureUsedThisRun: true },
  },
];

export const gate1SignatureBandFixture: AdversarialGateFixture = {
  code: "G1_SIGNATURE",
  label: "signature outside middle band",
  manifest: {
    ...validShallowsManifestFixture,
    metadata: {
      ...validShallowsManifestFixture.metadata,
      signature: true,
    },
  },
};
