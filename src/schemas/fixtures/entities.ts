import { bounds, config } from "../../config/index.js";
import type {
  Behavior,
  ItemDefinition,
  NpcDefinition,
  QuestDefinition,
  QuestObjective,
} from "../index.js";
import type { EffectBundle } from "../vocab/index.js";
import {
  makeEffectBundleFixture,
  validDamageEffectFixture,
  validEquipPassiveTriggerFixture,
  validQuaffTriggerFixture,
  validSelfTargetingFixture,
  validStepTriggerFixture,
  validUseTriggerFixture,
} from "./vocab.js";

type ItemPayloadKey = Exclude<
  keyof ItemDefinition,
  "id" | "name" | "glyph" | "kind" | "value"
>;
type BehaviorPayloadKey = Exclude<keyof Behavior, "kind">;
type QuestObjectivePayloadKey = Exclude<keyof QuestObjective, "kind">;

const itemNullPayloads = {
  weapon: null,
  armor: null,
  charm: null,
  draught: null,
  note: null,
  throwable: null,
  food: null,
  tool: null,
  keyItem: null,
  coin: null,
} as const;

const behaviorNullPayloads = {
  approachMelee: null,
  keepRange: null,
  fleeLowHp: null,
  packHunter: null,
  ambusher: null,
  territorial: null,
  guard: null,
  patrol: null,
  thief: null,
  caster: null,
  bodyguard: null,
  mimic: null,
} as const;

const questObjectiveNullPayloads = {
  fetch: null,
  kill: null,
  reach: null,
  deliver: null,
  escort: null,
  constraint: null,
} as const;

export const validCharmPassiveFixture = makeEffectBundleFixture(
  [validDamageEffectFixture],
  validEquipPassiveTriggerFixture,
  validSelfTargetingFixture,
);

export const validUseEffectBundleFixture = makeEffectBundleFixture(
  [validDamageEffectFixture],
  validUseTriggerFixture,
  validSelfTargetingFixture,
);

export const validStepEffectBundleFixture = makeEffectBundleFixture(
  [validDamageEffectFixture],
  validStepTriggerFixture,
  validSelfTargetingFixture,
);

export const makeItemFixture = (
  kind: ItemDefinition["kind"],
  field: ItemPayloadKey,
  payload: NonNullable<ItemDefinition[ItemPayloadKey]>,
  valueCoin = config.itemsEconomy.valueBandsCoin.shallows.min,
): ItemDefinition =>
  ({
    id: `${kind}-1`,
    name: `${kind} fixture`,
    glyph: "?",
    kind,
    value: {
      band: "shallows",
      coin: valueCoin,
    },
    ...itemNullPayloads,
    [field]: payload,
  }) as ItemDefinition;

export const validWeaponItemFixture = makeItemFixture("weapon", "weapon", {
  attackBonus: bounds.itemsEconomy.weaponAtkBonus.min,
});

export const validArmorItemFixture = makeItemFixture("armor", "armor", {
  defenseBonus: bounds.itemsEconomy.armorDefBonus.min,
});

export const validCharmItemFixture = makeItemFixture("charm", "charm", {
  passive: validCharmPassiveFixture,
});

export const validDraughtItemFixture = makeItemFixture("draught", "draught", {
  effect: makeEffectBundleFixture(
    [validDamageEffectFixture],
    validQuaffTriggerFixture,
    validSelfTargetingFixture,
  ),
});

export const validNoteItemFixture = makeItemFixture("note", "note", {
  effect: makeEffectBundleFixture(
    [validDamageEffectFixture],
    validQuaffTriggerFixture,
    validSelfTargetingFixture,
  ),
});

export const validThrowableItemFixture = makeItemFixture(
  "throwable",
  "throwable",
  {
    effect: makeEffectBundleFixture(
      [validDamageEffectFixture],
      validQuaffTriggerFixture,
      validSelfTargetingFixture,
    ),
  },
);

export const validFoodItemFixture = makeItemFixture("food", "food", {
  effect: makeEffectBundleFixture(
    [validDamageEffectFixture],
    validQuaffTriggerFixture,
    validSelfTargetingFixture,
  ),
});

export const validToolItemFixture = makeItemFixture("tool", "tool", {
  effect: validUseEffectBundleFixture,
});

export const validKeyItemFixture = makeItemFixture("key_item", "keyItem", {
  questHookId: "quest-1",
});

export const validCoinItemFixture = makeItemFixture("coin", "coin", {});

export const validItemFixtures = [
  validWeaponItemFixture,
  validArmorItemFixture,
  validCharmItemFixture,
  validDraughtItemFixture,
  validNoteItemFixture,
  validThrowableItemFixture,
  validFoodItemFixture,
  validToolItemFixture,
  validKeyItemFixture,
  validCoinItemFixture,
] as const;

export const makeBehaviorFixture = (
  kind: Behavior["kind"],
  field: BehaviorPayloadKey,
  payload: NonNullable<Behavior[BehaviorPayloadKey]>,
): Behavior =>
  ({
    kind,
    ...behaviorNullPayloads,
    [field]: payload,
  }) as Behavior;

export const validApproachMeleeBehaviorFixture = makeBehaviorFixture(
  "approach_melee",
  "approachMelee",
  {},
);

export const validKeepRangeBehaviorFixture = makeBehaviorFixture(
  "keep_range",
  "keepRange",
  {
    distanceTiles:
      bounds.enemyDesign.behaviorVocabulary.parameters.keepRangeDistanceTiles.min,
  },
);

export const validFleeLowHpBehaviorFixture = makeBehaviorFixture(
  "flee_low_hp",
  "fleeLowHp",
  {
    thresholdPercent:
      bounds.enemyDesign.behaviorVocabulary.parameters
        .fleeLowHpThresholdPercent.min,
  },
);

export const validPackHunterBehaviorFixture = makeBehaviorFixture(
  "pack_hunter",
  "packHunter",
  {
    allyCount:
      bounds.enemyDesign.behaviorVocabulary.parameters.packHunter.allyCountMin,
  },
);

export const validAmbusherBehaviorFixture = makeBehaviorFixture(
  "ambusher",
  "ambusher",
  {
    wakeRadiusTiles:
      bounds.enemyDesign.behaviorVocabulary.parameters.ambusherWakeRadiusTiles.min,
  },
);

export const validTerritorialBehaviorFixture = makeBehaviorFixture(
  "territorial",
  "territorial",
  {
    radiusTiles:
      bounds.enemyDesign.behaviorVocabulary.parameters.territorialRadiusTiles.min,
  },
);

export const validGuardBehaviorFixture = makeBehaviorFixture("guard", "guard", {
  tetherId: "cell-1",
  tetherRadiusTiles:
    bounds.enemyDesign.behaviorVocabulary.parameters.guardTetherRadiusTiles.min,
});

export const validPatrolBehaviorFixture = makeBehaviorFixture(
  "patrol",
  "patrol",
  {},
);

export const validThiefBehaviorFixture = makeBehaviorFixture(
  "thief",
  "thief",
  {},
);

export const validCasterBehaviorFixture = makeBehaviorFixture(
  "caster",
  "caster",
  {
    cooldownTurns:
      bounds.enemyDesign.behaviorVocabulary.parameters.casterCooldownTurns.min,
  },
);

export const validBodyguardBehaviorFixture = makeBehaviorFixture(
  "bodyguard",
  "bodyguard",
  {},
);

export const validMimicBehaviorFixture = makeBehaviorFixture(
  "mimic",
  "mimic",
  {},
);

export const validBehaviorFixtures = [
  validApproachMeleeBehaviorFixture,
  validKeepRangeBehaviorFixture,
  validFleeLowHpBehaviorFixture,
  validPackHunterBehaviorFixture,
  validAmbusherBehaviorFixture,
  validTerritorialBehaviorFixture,
  validGuardBehaviorFixture,
  validPatrolBehaviorFixture,
  validThiefBehaviorFixture,
  validCasterBehaviorFixture,
  validBodyguardBehaviorFixture,
  validMimicBehaviorFixture,
] as const;

export const validEnemyDefinitionFixture = {
  id: "enemy-1",
  name: "Fixture Enemy",
  glyph: "e",
  origin: "made",
  stats: {
    band: "shallows",
    hp: bounds.enemyDesign.statBudgetsByBand.shallows.hp.min,
    attack: bounds.enemyDesign.statBudgetsByBand.shallows.attack.min,
    defense: bounds.enemyDesign.statBudgetsByBand.shallows.defense.min,
    xpYield: bounds.enemyDesign.statBudgetsByBand.shallows.xpYield.min,
  },
  behaviors: [validApproachMeleeBehaviorFixture],
  abilities: [] as EffectBundle[],
} as const;

export const makeQuestObjectiveFixture = (
  kind: QuestObjective["kind"],
  field: QuestObjectivePayloadKey,
  payload: NonNullable<QuestObjective[QuestObjectivePayloadKey]>,
): QuestObjective =>
  ({
    kind,
    ...questObjectiveNullPayloads,
    [field]: payload,
  }) as QuestObjective;

export const validFetchObjectiveFixture = makeQuestObjectiveFixture(
  "fetch",
  "fetch",
  {
    itemId: "item-1",
    floorScope: "this_floor",
  },
);

export const validKillObjectiveFixture = makeQuestObjectiveFixture(
  "kill",
  "kill",
  {
    targetTag: "target-tag",
  },
);

export const validReachObjectiveFixture = makeQuestObjectiveFixture(
  "reach",
  "reach",
  {
    featureId: "stairs",
  },
);

export const validDeliverObjectiveFixture = makeQuestObjectiveFixture(
  "deliver",
  "deliver",
  {
    itemId: "item-1",
    npcId: "npc-1",
  },
);

export const validEscortObjectiveFixture = makeQuestObjectiveFixture(
  "escort",
  "escort",
  {
    npcId: "npc-1",
  },
);

export const validConstraintObjectiveFixture = makeQuestObjectiveFixture(
  "constraint",
  "constraint",
  {
    engineFlag: "take_no_damage",
  },
);

export const validQuestObjectiveFixtures = [
  validFetchObjectiveFixture,
  validKillObjectiveFixture,
  validReachObjectiveFixture,
  validDeliverObjectiveFixture,
  validEscortObjectiveFixture,
  validConstraintObjectiveFixture,
] as const;

export const validQuestDefinitionFixture: QuestDefinition = {
  id: "quest-1",
  title: "Fixture Quest",
  objective: validFetchObjectiveFixture,
  reward: {
    valueMultiplier: config.itemsEconomy.questRewardValueMultiplier.min,
    coin: config.itemsEconomy.valueBandsCoin.shallows.min,
    itemIds: [],
    identifyItemIds: [],
  },
};

export const validDialogueTreeFixture = {
  rootNodeId: "root",
  nodes: [
    {
      id: "root",
      text: "The Deep keeps count.",
      choices: [
        {
          id: "root-a",
          label: "Ask",
          nextNodeId: "answer",
          closesDialogue: false,
          questHookId: null,
        },
        {
          id: "root-b",
          label: "Leave",
          nextNodeId: null,
          closesDialogue: true,
          questHookId: null,
        },
      ],
    },
    {
      id: "answer",
      text: "Bring back what was dropped.",
      choices: [
        {
          id: "answer-a",
          label: "Accept",
          nextNodeId: null,
          closesDialogue: true,
          questHookId: "quest-1",
        },
        {
          id: "answer-b",
          label: "Decline",
          nextNodeId: null,
          closesDialogue: true,
          questHookId: null,
        },
      ],
    },
  ],
};

export const validNpcDefinitionFixture: NpcDefinition = {
  id: "npc-1",
  name: "Fixture Kept",
  glyph: "k",
  origin: "kept",
  dialogue: validDialogueTreeFixture,
  merchantInventoryItemIds: ["weapon-1", "food-1"],
  questHook: validQuestDefinitionFixture,
};

export const validTrapDefinitionFixture = {
  id: "trap-1",
  name: "Fixture Trap",
  hidden: true,
  effectBundle: validStepEffectBundleFixture,
} as const;

export const validNarrationBeatsFixture = {
  floorIntro: "The Deep opens one quiet room.",
  observations: [
    {
      id: "obs-1",
      triggerTag: "first-blood",
      text: "The floor remembers the first cut.",
    },
  ],
} as const;
