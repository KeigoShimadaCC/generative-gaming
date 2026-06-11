import { z } from "zod";

import { bounds } from "../../config/index.js";
import { boundedInt, enforceActivePayload, nonEmptyString } from "../common.js";
import { StatusApplicationSchema, STATUS_IDS } from "./statuses.js";

export const EFFECT_VERB_IDS = bounds.effectVocabulary.closedVerbList;

export const EffectVerbKindSchema = z.enum(EFFECT_VERB_IDS);

export type EffectVerbKind = z.infer<typeof EffectVerbKindSchema>;

const CURE_STATUS_TARGETS = [
  ...STATUS_IDS,
  bounds.effectVocabulary.verbs.cureStatus.allKeyword,
] as const;

export const CureStatusTargetSchema = z.enum(CURE_STATUS_TARGETS);

export const BuffStatSchema = z.enum(bounds.effectVocabulary.verbs.buffStat.stats);

export const RevealTargetKindSchema = z.enum(
  bounds.effectVocabulary.verbs.reveal.targetKinds,
);

export const EnchantTargetKindSchema = z.enum(["weapon", "armor"]);

export const IdentifyModeSchema = z.enum(["carried_item", "category"]);

export const EmptyEffectPayloadSchema = z.strictObject({});

export const DamageEffectPayloadSchema = z.strictObject({
  amount: boundedInt(bounds.effectVocabulary.verbs.damage.amount),
});

export const HealEffectPayloadSchema = z.strictObject({
  amount: boundedInt(bounds.effectVocabulary.verbs.heal.amount),
});

export const ApplyStatusEffectPayloadSchema = StatusApplicationSchema;

export const CureStatusEffectPayloadSchema = z.strictObject({
  status: CureStatusTargetSchema,
});

export const BuffStatEffectPayloadSchema = z
  .strictObject({
    stat: BuffStatSchema,
    magnitude: z.number().int(),
    duration: boundedInt(bounds.effectVocabulary.verbs.buffStat.durationTurns),
  })
  .superRefine((payload, ctx) => {
    const magnitudeBounds = bounds.effectVocabulary.verbs.buffStat.magnitudeAbs;
    const absMagnitude = Math.abs(payload.magnitude);

    if (
      absMagnitude < magnitudeBounds.min ||
      absMagnitude > magnitudeBounds.max
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["magnitude"],
        message: `magnitude absolute value must be ${magnitudeBounds.min}-${magnitudeBounds.max}`,
      });
    }
  });

export const NutritionEffectPayloadSchema = z.strictObject({
  fullness: boundedInt(bounds.effectVocabulary.verbs.nutrition.fullness),
});

export const BlinkEffectPayloadSchema = z.strictObject({
  distanceTiles: boundedInt(
    bounds.effectVocabulary.verbs.blink.distanceTiles,
  ),
});

export const KnockbackEffectPayloadSchema = z.strictObject({
  pushTiles: boundedInt(bounds.effectVocabulary.verbs.knockback.pushTiles),
  collisionDamage: boundedInt(
    bounds.effectVocabulary.verbs.knockback.collisionDamage,
  ),
});

export const RevealEffectPayloadSchema = z.strictObject({
  target: RevealTargetKindSchema,
});

export const IdentifyEffectPayloadSchema = z
  .strictObject({
    mode: IdentifyModeSchema,
    carriedItemId: nonEmptyString.nullable(),
    category: nonEmptyString.nullable(),
  })
  .superRefine((payload, ctx) => {
    if (payload.mode === "carried_item" && payload.carriedItemId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["carriedItemId"],
        message: "carried item identify mode requires carriedItemId",
      });
    }

    if (payload.mode === "carried_item" && payload.category !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["category"],
        message: "category must be null for carried item identify mode",
      });
    }

    if (payload.mode === "category" && payload.category === null) {
      ctx.addIssue({
        code: "custom",
        path: ["category"],
        message: "category identify mode requires category",
      });
    }

    if (payload.mode === "category" && payload.carriedItemId !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["carriedItemId"],
        message: "carriedItemId must be null for category identify mode",
      });
    }
  });

export const EnchantEffectPayloadSchema = z.strictObject({
  target: EnchantTargetKindSchema,
  bonus: z.literal(bounds.effectVocabulary.verbs.enchant.bonus),
});

export const SummonEffectPayloadSchema = z.strictObject({
  count: boundedInt(bounds.effectVocabulary.verbs.summon.count),
  rosterEntityId: nonEmptyString,
});

export const TransformEffectPayloadSchema = z.strictObject({
  rosterEntityId: nonEmptyString,
});

export const DigEffectPayloadSchema = z.strictObject({
  lengthTiles: boundedInt(bounds.effectVocabulary.verbs.dig.lengthTiles),
});

const EFFECT_PAYLOAD_KEYS = [
  "damage",
  "heal",
  "applyStatus",
  "cureStatus",
  "buffStat",
  "nutrition",
  "teleportSelf",
  "teleportTarget",
  "blink",
  "knockback",
  "reveal",
  "identify",
  "enchant",
  "summon",
  "transform",
  "dig",
] as const;

const EFFECT_PAYLOAD_FIELD_BY_KIND = {
  damage: "damage",
  heal: "heal",
  apply_status: "applyStatus",
  cure_status: "cureStatus",
  buff_stat: "buffStat",
  nutrition: "nutrition",
  teleport_self: "teleportSelf",
  teleport_target: "teleportTarget",
  blink: "blink",
  knockback: "knockback",
  reveal: "reveal",
  identify: "identify",
  enchant: "enchant",
  summon: "summon",
  transform: "transform",
  dig: "dig",
} as const satisfies Record<EffectVerbKind, (typeof EFFECT_PAYLOAD_KEYS)[number]>;

// Provider-facing: required nullable payload fields avoid a root union.
export const EffectSchema = z
  .strictObject({
    kind: EffectVerbKindSchema,
    damage: DamageEffectPayloadSchema.nullable(),
    heal: HealEffectPayloadSchema.nullable(),
    applyStatus: ApplyStatusEffectPayloadSchema.nullable(),
    cureStatus: CureStatusEffectPayloadSchema.nullable(),
    buffStat: BuffStatEffectPayloadSchema.nullable(),
    nutrition: NutritionEffectPayloadSchema.nullable(),
    teleportSelf: EmptyEffectPayloadSchema.nullable(),
    teleportTarget: EmptyEffectPayloadSchema.nullable(),
    blink: BlinkEffectPayloadSchema.nullable(),
    knockback: KnockbackEffectPayloadSchema.nullable(),
    reveal: RevealEffectPayloadSchema.nullable(),
    identify: IdentifyEffectPayloadSchema.nullable(),
    enchant: EnchantEffectPayloadSchema.nullable(),
    summon: SummonEffectPayloadSchema.nullable(),
    transform: TransformEffectPayloadSchema.nullable(),
    dig: DigEffectPayloadSchema.nullable(),
  })
  .superRefine((effect, ctx) => {
    enforceActivePayload(
      effect,
      ctx,
      EFFECT_PAYLOAD_KEYS,
      EFFECT_PAYLOAD_FIELD_BY_KIND[effect.kind],
    );
  });

export type Effect = z.infer<typeof EffectSchema>;
