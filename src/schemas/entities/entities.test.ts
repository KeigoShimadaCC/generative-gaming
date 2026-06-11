import { describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import {
  BehaviorSchema,
  EnemyDefinitionSchema,
  EnemyStatBlockSchema,
  ItemDefinitionSchema,
  NarrationBeatsSchema,
  NpcDefinitionSchema,
  QuestDefinitionSchema,
  QuestObjectiveSchema,
  TrapDefinitionSchema,
  TrapDefinitionsForFloorSchema,
} from "./index.js";
import {
  makeBehaviorFixture,
  makeItemFixture,
  makeQuestObjectiveFixture,
  validBehaviorFixtures,
  validCharmItemFixture,
  validCharmPassiveFixture,
  validDialogueTreeFixture,
  validEnemyDefinitionFixture,
  validItemFixtures,
  validNarrationBeatsFixture,
  validNpcDefinitionFixture,
  validQuestDefinitionFixture,
  validQuestObjectiveFixtures,
  validTrapDefinitionFixture,
} from "../fixtures/entities.js";
import {
  makeEffectBundleFixture,
  validDamageEffectFixture,
  validEffectBundleFixture,
  validQuaffTriggerFixture,
  validSelfTargetingFixture,
} from "../fixtures/vocab.js";

const expectPasses = (schema: SchemaLike, value: unknown): void => {
  expect(schema.safeParse(value).success).toBe(true);
};

const expectFails = (schema: SchemaLike, value: unknown): void => {
  expect(schema.safeParse(value).success).toBe(false);
};

type SchemaLike = {
  readonly safeParse: (value: unknown) => { readonly success: boolean };
};

const overCapString = (maxChars: number): string => "x".repeat(maxChars + 1);

describe("generated text caps", () => {
  it("rejects names over the configured name cap", () => {
    const overCapName = overCapString(
      bounds.directorManifest.textCaps.nameMaxChars,
    );

    expectFails(ItemDefinitionSchema, {
      ...validItemFixtures[0],
      name: overCapName,
    });
    expectFails(EnemyDefinitionSchema, {
      ...validEnemyDefinitionFixture,
      name: overCapName,
    });
    expectFails(NpcDefinitionSchema, {
      ...validNpcDefinitionFixture,
      name: overCapName,
    });
    expectFails(TrapDefinitionSchema, {
      ...validTrapDefinitionFixture,
      name: overCapName,
    });
  });

  it("rejects dialogue text over the configured description/dialogue cap", () => {
    const rootNode = validDialogueTreeFixture.nodes[0];
    if (rootNode === undefined) {
      throw new Error("dialogue fixture must include a root node");
    }

    expectFails(NpcDefinitionSchema, {
      ...validNpcDefinitionFixture,
      dialogue: {
        ...validDialogueTreeFixture,
        nodes: [
          {
            ...rootNode,
            text: overCapString(
              bounds.directorManifest.textCaps.descriptionDialogueLineMaxChars,
            ),
          },
          ...validDialogueTreeFixture.nodes.slice(1),
        ],
      },
    });
  });

  it("rejects narration text over the configured narration cap", () => {
    const observation = validNarrationBeatsFixture.observations[0];
    if (observation === undefined) {
      throw new Error("narration fixture must include an observation");
    }

    const overCapNarration = overCapString(
      bounds.directorManifest.textCaps.narrationLineMaxChars,
    );

    expectFails(NarrationBeatsSchema, {
      ...validNarrationBeatsFixture,
      floorIntro: overCapNarration,
    });
    expectFails(NarrationBeatsSchema, {
      ...validNarrationBeatsFixture,
      observations: [
        {
          ...observation,
          text: overCapNarration,
        },
      ],
    });
  });
});

describe("item definition schema", () => {
  it("accepts valid fixtures for every item category", () => {
    for (const item of validItemFixtures) {
      expectPasses(ItemDefinitionSchema, item);
    }
  });

  it("rejects item values outside every band", () => {
    for (const band of ["shallows", "middle", "lowest"] as const) {
      const valueBounds = config.itemsEconomy.valueBandsCoin[band];
      const baseItem = {
        ...validItemFixtures[0],
        value: {
          band,
          coin: valueBounds.min,
        },
      };

      expectFails(ItemDefinitionSchema, {
        ...baseItem,
        value: {
          band,
          coin: valueBounds.min - 1,
        },
      });
      expectFails(ItemDefinitionSchema, {
        ...baseItem,
        value: {
          band,
          coin: valueBounds.max + 1,
        },
      });
    }
  });

  it("rejects weapon and armor bonuses outside bounds", () => {
    const weaponBounds = bounds.itemsEconomy.weaponAtkBonus;
    expectFails(
      ItemDefinitionSchema,
      makeItemFixture("weapon", "weapon", {
        attackBonus: weaponBounds.min - 1,
      }),
    );
    expectFails(
      ItemDefinitionSchema,
      makeItemFixture("weapon", "weapon", {
        attackBonus: weaponBounds.max + 1,
      }),
    );

    const armorBounds = bounds.itemsEconomy.armorDefBonus;
    expectFails(
      ItemDefinitionSchema,
      makeItemFixture("armor", "armor", {
        defenseBonus: armorBounds.min - 1,
      }),
    );
    expectFails(
      ItemDefinitionSchema,
      makeItemFixture("armor", "armor", {
        defenseBonus: armorBounds.max + 1,
      }),
    );
  });

  it("rejects charm passives that are not exactly one equip_passive bundle", () => {
    expectFails(
      ItemDefinitionSchema,
      makeItemFixture("charm", "charm", {
        passive: makeEffectBundleFixture(
          [validDamageEffectFixture, validDamageEffectFixture],
          validCharmPassiveFixture.trigger,
          validCharmPassiveFixture.targeting,
        ),
      }),
    );
    expectFails(
      ItemDefinitionSchema,
      makeItemFixture("charm", "charm", {
        passive: makeEffectBundleFixture(
          [validDamageEffectFixture],
          validQuaffTriggerFixture,
          validSelfTargetingFixture,
        ),
      }),
    );
  });

  it("rejects malformed and extra-property items", () => {
    expectFails(ItemDefinitionSchema, {
      ...validCharmItemFixture,
      kind: "not_a_category",
    });
    expectFails(ItemDefinitionSchema, {
      ...validCharmItemFixture,
      extra: true,
    });
    expectFails(ItemDefinitionSchema, {
      ...validCharmItemFixture,
      charm: {
        passive: validCharmPassiveFixture,
        extra: true,
      },
    });
  });
});

describe("enemy definition schema", () => {
  it("accepts valid behavior fixtures and an enemy definition fixture", () => {
    for (const behavior of validBehaviorFixtures) {
      expectPasses(BehaviorSchema, behavior);
    }

    expectPasses(EnemyDefinitionSchema, validEnemyDefinitionFixture);
  });

  it("rejects stat blocks outside every band", () => {
    for (const band of ["shallows", "middle", "lowest"] as const) {
      const statBounds = bounds.enemyDesign.statBudgetsByBand[band];
      const baseStats = {
        band,
        hp: statBounds.hp.min,
        attack: statBounds.attack.min,
        defense: statBounds.defense.min,
        xpYield: statBounds.xpYield.min,
      };

      for (const key of ["hp", "attack", "defense", "xpYield"] as const) {
        expectFails(EnemyStatBlockSchema, {
          ...baseStats,
          [key]: statBounds[key].min - 1,
        });
        expectFails(EnemyStatBlockSchema, {
          ...baseStats,
          [key]: statBounds[key].max + 1,
        });
      }
    }
  });

  it("rejects behavior parameters outside bounds", () => {
    const behaviorBounds = bounds.enemyDesign.behaviorVocabulary.parameters;

    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("keep_range", "keepRange", {
        distanceTiles: behaviorBounds.keepRangeDistanceTiles.min - 1,
      }),
    );
    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("keep_range", "keepRange", {
        distanceTiles: behaviorBounds.keepRangeDistanceTiles.max + 1,
      }),
    );
    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("flee_low_hp", "fleeLowHp", {
        thresholdPercent: behaviorBounds.fleeLowHpThresholdPercent.min - 1,
      }),
    );
    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("flee_low_hp", "fleeLowHp", {
        thresholdPercent: behaviorBounds.fleeLowHpThresholdPercent.max + 1,
      }),
    );
    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("pack_hunter", "packHunter", {
        allyCount: behaviorBounds.packHunter.allyCountMin - 1,
      }),
    );
    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("pack_hunter", "packHunter", {
        allyCount: behaviorBounds.packHunter.allyCountMax + 1,
      }),
    );
    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("ambusher", "ambusher", {
        wakeRadiusTiles: behaviorBounds.ambusherWakeRadiusTiles.min - 1,
      }),
    );
    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("ambusher", "ambusher", {
        wakeRadiusTiles: behaviorBounds.ambusherWakeRadiusTiles.max + 1,
      }),
    );
    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("territorial", "territorial", {
        radiusTiles: behaviorBounds.territorialRadiusTiles.min - 1,
      }),
    );
    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("territorial", "territorial", {
        radiusTiles: behaviorBounds.territorialRadiusTiles.max + 1,
      }),
    );
    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("guard", "guard", {
        tetherId: "cell-1",
        tetherRadiusTiles: behaviorBounds.guardTetherRadiusTiles.min - 1,
      }),
    );
    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("guard", "guard", {
        tetherId: "cell-1",
        tetherRadiusTiles: behaviorBounds.guardTetherRadiusTiles.max + 1,
      }),
    );
    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("caster", "caster", {
        cooldownTurns: behaviorBounds.casterCooldownTurns.min - 1,
      }),
    );
    expectFails(
      BehaviorSchema,
      makeBehaviorFixture("caster", "caster", {
        cooldownTurns: behaviorBounds.casterCooldownTurns.max + 1,
      }),
    );
  });

  it("rejects behavior and ability counts outside bounds", () => {
    expectFails(EnemyDefinitionSchema, {
      ...validEnemyDefinitionFixture,
      behaviors: [],
    });
    expectFails(EnemyDefinitionSchema, {
      ...validEnemyDefinitionFixture,
      behaviors: [
        validBehaviorFixtures[0],
        validBehaviorFixtures[1],
        validBehaviorFixtures[2],
        validBehaviorFixtures[3],
      ],
    });
    expectFails(EnemyDefinitionSchema, {
      ...validEnemyDefinitionFixture,
      abilities: [
        validEffectBundleFixture,
        validEffectBundleFixture,
        validEffectBundleFixture,
      ],
    });
  });

  it("rejects malformed and extra-property enemies and behaviors", () => {
    expectFails(BehaviorSchema, {
      ...validBehaviorFixtures[0],
      kind: "not_a_behavior",
    });
    expectFails(BehaviorSchema, {
      ...validBehaviorFixtures[0],
      extra: true,
    });
    expectFails(EnemyDefinitionSchema, {
      ...validEnemyDefinitionFixture,
      extra: true,
    });
  });
});

describe("quest definition schema", () => {
  it("accepts every objective fixture and a quest definition fixture", () => {
    for (const objective of validQuestObjectiveFixtures) {
      expectPasses(QuestObjectiveSchema, objective);
    }

    expectPasses(QuestDefinitionSchema, validQuestDefinitionFixture);
  });

  it("rejects reward value multipliers outside bounds", () => {
    const rewardBounds = config.itemsEconomy.questRewardValueMultiplier;
    expectFails(QuestDefinitionSchema, {
      ...validQuestDefinitionFixture,
      reward: {
        ...validQuestDefinitionFixture.reward,
        valueMultiplier: rewardBounds.min - 0.1,
      },
    });
    expectFails(QuestDefinitionSchema, {
      ...validQuestDefinitionFixture,
      reward: {
        ...validQuestDefinitionFixture.reward,
        valueMultiplier: rewardBounds.max + 0.1,
      },
    });
  });

  it("rejects malformed and extra-property quests", () => {
    expectFails(
      QuestObjectiveSchema,
      makeQuestObjectiveFixture("fetch", "kill", {
        targetTag: "wrong-payload",
      }),
    );
    expectFails(QuestObjectiveSchema, {
      ...validQuestObjectiveFixtures[0],
      kind: "not_an_objective",
    });
    expectFails(QuestDefinitionSchema, {
      ...validQuestDefinitionFixture,
      extra: true,
    });
  });
});

describe("NPC definition schema", () => {
  it("accepts a valid NPC definition fixture", () => {
    expectPasses(NpcDefinitionSchema, validNpcDefinitionFixture);
  });

  it("rejects dialogue choice and depth bounds outside limits", () => {
    const rootNode = validDialogueTreeFixture.nodes[0];
    if (rootNode === undefined) {
      throw new Error("dialogue fixture must include a root node");
    }

    const firstChoice = rootNode.choices[0];
    if (firstChoice === undefined) {
      throw new Error("dialogue fixture root must include a choice");
    }

    expectFails(NpcDefinitionSchema, {
      ...validNpcDefinitionFixture,
      dialogue: {
        ...validDialogueTreeFixture,
        nodes: [
          {
            ...rootNode,
            choices: [firstChoice],
          },
        ],
      },
    });
    expectFails(NpcDefinitionSchema, {
      ...validNpcDefinitionFixture,
      dialogue: {
        ...validDialogueTreeFixture,
        nodes: [
          {
            ...rootNode,
            choices: [
              ...rootNode.choices,
              ...rootNode.choices,
              ...rootNode.choices,
            ],
          },
        ],
      },
    });
    expectFails(NpcDefinitionSchema, {
      ...validNpcDefinitionFixture,
      dialogue: {
        rootNodeId: "root",
        nodes: [
          dialogueNode("root", "a"),
          dialogueNode("a", "b"),
          dialogueNode("b", "c"),
          dialogueNode("c", null),
        ],
      },
    });
  });

  it("rejects merchant inventory over the item cap", () => {
    expectFails(NpcDefinitionSchema, {
      ...validNpcDefinitionFixture,
      merchantInventoryItemIds: [
        "item-1",
        "item-2",
        "item-3",
        "item-4",
        "item-5",
        "item-6",
        "item-7",
      ],
    });
  });

  it("rejects malformed and extra-property NPCs", () => {
    expectFails(NpcDefinitionSchema, {
      ...validNpcDefinitionFixture,
      origin: "made",
    });
    expectFails(NpcDefinitionSchema, {
      ...validNpcDefinitionFixture,
      extra: true,
    });
  });
});

describe("trap definition schema", () => {
  it("accepts a valid trap fixture", () => {
    expectPasses(TrapDefinitionSchema, validTrapDefinitionFixture);
  });

  it("rejects non-hidden traps, non-step triggers, and per-floor trap count overflow", () => {
    expectFails(TrapDefinitionSchema, {
      ...validTrapDefinitionFixture,
      hidden: false,
    });
    expectFails(TrapDefinitionSchema, {
      ...validTrapDefinitionFixture,
      effectBundle: validEffectBundleFixture,
    });
    expectFails(TrapDefinitionsForFloorSchema, [
      validTrapDefinitionFixture,
      validTrapDefinitionFixture,
      validTrapDefinitionFixture,
      validTrapDefinitionFixture,
      validTrapDefinitionFixture,
    ]);
  });

  it("rejects extra properties on traps", () => {
    expectFails(TrapDefinitionSchema, {
      ...validTrapDefinitionFixture,
      extra: true,
    });
  });
});

describe("narration beats schema", () => {
  it("accepts a valid narration fixture", () => {
    expectPasses(NarrationBeatsSchema, validNarrationBeatsFixture);
  });

  it("rejects observation count over the configured cap", () => {
    expectFails(NarrationBeatsSchema, {
      ...validNarrationBeatsFixture,
      observations: [
        ...validNarrationBeatsFixture.observations,
        ...validNarrationBeatsFixture.observations,
        ...validNarrationBeatsFixture.observations,
        ...validNarrationBeatsFixture.observations,
      ],
    });
  });

  it("rejects extra properties on narration beats", () => {
    expectFails(NarrationBeatsSchema, {
      ...validNarrationBeatsFixture,
      extra: true,
    });
  });
});

const dialogueNode = (id: string, nextNodeId: string | null) => ({
  id,
  text: `Node ${id}`,
  choices: [
    {
      id: `${id}-a`,
      label: "Continue",
      nextNodeId,
      closesDialogue: nextNodeId === null,
      questHookId: null,
    },
    {
      id: `${id}-b`,
      label: "Leave",
      nextNodeId: null,
      closesDialogue: true,
      questHookId: null,
    },
  ],
});
