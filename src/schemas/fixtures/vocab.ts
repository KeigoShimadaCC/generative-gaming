import { bounds } from "../../config/index.js";
import type {
  Effect,
  EffectBundle,
  StatusApplication,
  TargetingShape,
  Trigger,
} from "../vocab/index.js";

type EffectPayloadKey = Exclude<keyof Effect, "kind">;
type TriggerPayloadKey = Exclude<keyof Trigger, "kind">;
type TargetingPayloadKey = Exclude<keyof TargetingShape, "kind">;

const effectNullPayloads = {
  damage: null,
  heal: null,
  applyStatus: null,
  cureStatus: null,
  buffStat: null,
  nutrition: null,
  teleportSelf: null,
  teleportTarget: null,
  blink: null,
  knockback: null,
  reveal: null,
  identify: null,
  enchant: null,
  summon: null,
  transform: null,
  dig: null,
} as const;

const triggerNullPayloads = {
  quaff: null,
  read: null,
  throwHit: null,
  equipPassive: null,
  onHit: null,
  onStruck: null,
  step: null,
  use: null,
} as const;

const targetingNullPayloads = {
  self: null,
  melee: null,
  bolt: null,
  burst: null,
  floor: null,
} as const;

export const validStatusApplicationFixture: StatusApplication = {
  status: "poison",
  duration: bounds.statusVocabulary.durationTurns.poison.min,
};

export const makeEffectFixture = (
  kind: Effect["kind"],
  field: EffectPayloadKey,
  payload: NonNullable<Effect[EffectPayloadKey]>,
): Effect =>
  ({
    kind,
    ...effectNullPayloads,
    [field]: payload,
  }) as Effect;

export const validDamageEffectFixture = makeEffectFixture("damage", "damage", {
  amount: bounds.effectVocabulary.verbs.damage.amount.min,
});

export const validHealEffectFixture = makeEffectFixture("heal", "heal", {
  amount: bounds.effectVocabulary.verbs.heal.amount.min,
});

export const validApplyStatusEffectFixture = makeEffectFixture(
  "apply_status",
  "applyStatus",
  {
    status: "burn",
    duration: bounds.statusVocabulary.durationTurns.burn.min,
  },
);

export const validCureStatusEffectFixture = makeEffectFixture(
  "cure_status",
  "cureStatus",
  {
    status: "all",
  },
);

export const validBuffStatEffectFixture = makeEffectFixture(
  "buff_stat",
  "buffStat",
  {
    stat: "ATK",
    magnitude: bounds.effectVocabulary.verbs.buffStat.magnitudeAbs.min,
    duration: bounds.effectVocabulary.verbs.buffStat.durationTurns.min,
  },
);

export const validNutritionEffectFixture = makeEffectFixture(
  "nutrition",
  "nutrition",
  {
    fullness: bounds.effectVocabulary.verbs.nutrition.fullness.min,
  },
);

export const validTeleportSelfEffectFixture = makeEffectFixture(
  "teleport_self",
  "teleportSelf",
  {},
);

export const validTeleportTargetEffectFixture = makeEffectFixture(
  "teleport_target",
  "teleportTarget",
  {},
);

export const validBlinkEffectFixture = makeEffectFixture("blink", "blink", {
  distanceTiles: bounds.effectVocabulary.verbs.blink.distanceTiles.min,
});

export const validKnockbackEffectFixture = makeEffectFixture(
  "knockback",
  "knockback",
  {
    pushTiles: bounds.effectVocabulary.verbs.knockback.pushTiles.min,
    collisionDamage:
      bounds.effectVocabulary.verbs.knockback.collisionDamage.min,
  },
);

export const validRevealEffectFixture = makeEffectFixture("reveal", "reveal", {
  target: "map",
});

export const validIdentifyEffectFixture = makeEffectFixture(
  "identify",
  "identify",
  {
    mode: "carried_item",
    carriedItemId: "item-1",
    category: null,
  },
);

export const validEnchantEffectFixture = makeEffectFixture(
  "enchant",
  "enchant",
  {
    target: "weapon",
    bonus: bounds.effectVocabulary.verbs.enchant.bonus,
  },
);

export const validSummonEffectFixture = makeEffectFixture("summon", "summon", {
  count: bounds.effectVocabulary.verbs.summon.count.min,
  rosterEntityId: "enemy-roster-1",
});

export const validTransformEffectFixture = makeEffectFixture(
  "transform",
  "transform",
  {
    rosterEntityId: "enemy-roster-1",
  },
);

export const validDigEffectFixture = makeEffectFixture("dig", "dig", {
  lengthTiles: bounds.effectVocabulary.verbs.dig.lengthTiles.min,
});

export const validEffectFixtures = [
  validDamageEffectFixture,
  validHealEffectFixture,
  validApplyStatusEffectFixture,
  validCureStatusEffectFixture,
  validBuffStatEffectFixture,
  validNutritionEffectFixture,
  validTeleportSelfEffectFixture,
  validTeleportTargetEffectFixture,
  validBlinkEffectFixture,
  validKnockbackEffectFixture,
  validRevealEffectFixture,
  validIdentifyEffectFixture,
  validEnchantEffectFixture,
  validSummonEffectFixture,
  validTransformEffectFixture,
  validDigEffectFixture,
] as const;

export const makeTriggerFixture = (
  kind: Trigger["kind"],
  field: TriggerPayloadKey,
  payload: NonNullable<Trigger[TriggerPayloadKey]>,
): Trigger =>
  ({
    kind,
    ...triggerNullPayloads,
    [field]: payload,
  }) as Trigger;

export const validQuaffTriggerFixture = makeTriggerFixture("quaff", "quaff", {});

export const validReadTriggerFixture = makeTriggerFixture("read", "read", {});

export const validThrowHitTriggerFixture = makeTriggerFixture(
  "throw_hit",
  "throwHit",
  {},
);

export const validEquipPassiveTriggerFixture = makeTriggerFixture(
  "equip_passive",
  "equipPassive",
  {},
);

export const validOnHitTriggerFixture = makeTriggerFixture("on_hit", "onHit", {
  procChancePercent:
    bounds.effectVocabulary.triggers.procChancePercent.onHit.min,
});

export const validOnStruckTriggerFixture = makeTriggerFixture(
  "on_struck",
  "onStruck",
  {
    procChancePercent:
      bounds.effectVocabulary.triggers.procChancePercent.onStruck.min,
  },
);

export const validStepTriggerFixture = makeTriggerFixture("step", "step", {});

export const validUseTriggerFixture = makeTriggerFixture("use", "use", {
  charges: bounds.effectVocabulary.triggers.toolCharges.min,
});

export const validTriggerFixtures = [
  validQuaffTriggerFixture,
  validReadTriggerFixture,
  validThrowHitTriggerFixture,
  validEquipPassiveTriggerFixture,
  validOnHitTriggerFixture,
  validOnStruckTriggerFixture,
  validStepTriggerFixture,
  validUseTriggerFixture,
] as const;

export const makeTargetingFixture = (
  kind: TargetingShape["kind"],
  field: TargetingPayloadKey,
  payload: NonNullable<TargetingShape[TargetingPayloadKey]>,
): TargetingShape =>
  ({
    kind,
    ...targetingNullPayloads,
    [field]: payload,
  }) as TargetingShape;

export const validSelfTargetingFixture = makeTargetingFixture("self", "self", {});

export const validMeleeTargetingFixture = makeTargetingFixture(
  "melee",
  "melee",
  {},
);

export const validBoltTargetingFixture = makeTargetingFixture("bolt", "bolt", {
  rangeTiles: bounds.effectVocabulary.targetingShapes.boltRangeTiles.min,
});

export const validBurstTargetingFixture = makeTargetingFixture(
  "burst",
  "burst",
  {
    radiusTiles: bounds.effectVocabulary.targetingShapes.burstRadiusTiles.min,
    center: "self",
  },
);

export const validFloorTargetingFixture = makeTargetingFixture(
  "floor",
  "floor",
  {},
);

export const validTargetingFixtures = [
  validSelfTargetingFixture,
  validMeleeTargetingFixture,
  validBoltTargetingFixture,
  validBurstTargetingFixture,
  validFloorTargetingFixture,
] as const;

export const makeEffectBundleFixture = (
  effects: readonly Effect[],
  trigger: Trigger,
  targeting: TargetingShape,
): EffectBundle => ({
  effects: [...effects],
  trigger,
  targeting,
});

export const validEffectBundleFixture = makeEffectBundleFixture(
  [validDamageEffectFixture],
  validQuaffTriggerFixture,
  validSelfTargetingFixture,
);
