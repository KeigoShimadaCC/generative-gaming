import { z } from "zod";

import { bounds } from "../../config/index.js";
import {
  boundedInt,
  enforceActivePayload,
  glyphSchema,
  nonEmptyString,
} from "../common.js";
import { EffectBundleSchema } from "../vocab/index.js";
import {
  DepthBandSchema,
  EntityNameSchema,
  OriginTagSchema,
  type DepthBand,
} from "./common.js";

export const EnemyStatBlockSchema = z
  .strictObject({
    band: DepthBandSchema,
    hp: z.number().int(),
    attack: z.number().int(),
    defense: z.number().int(),
    xpYield: z.number().int(),
  })
  .superRefine((stats, ctx) => {
    const statBounds = bounds.enemyDesign.statBudgetsByBand[stats.band];

    enforceStatBound(ctx, ["hp"], stats.hp, statBounds.hp);
    enforceStatBound(ctx, ["attack"], stats.attack, statBounds.attack);
    enforceStatBound(ctx, ["defense"], stats.defense, statBounds.defense);
    enforceStatBound(ctx, ["xpYield"], stats.xpYield, statBounds.xpYield);
  });

export type EnemyStatBlock = z.infer<typeof EnemyStatBlockSchema>;

export const BEHAVIOR_IDS =
  bounds.enemyDesign.behaviorVocabulary.closedList;

export const BehaviorKindSchema = z.enum(BEHAVIOR_IDS);

export type BehaviorKind = z.infer<typeof BehaviorKindSchema>;

export const EmptyBehaviorPayloadSchema = z.strictObject({});

export const KeepRangeBehaviorPayloadSchema = z.strictObject({
  distanceTiles: boundedInt(
    bounds.enemyDesign.behaviorVocabulary.parameters.keepRangeDistanceTiles,
  ),
});

export const FleeLowHpBehaviorPayloadSchema = z.strictObject({
  thresholdPercent: boundedInt(
    bounds.enemyDesign.behaviorVocabulary.parameters.fleeLowHpThresholdPercent,
  ),
});

export const PackHunterBehaviorPayloadSchema = z.strictObject({
  allyCount: boundedInt({
    min: bounds.enemyDesign.behaviorVocabulary.parameters.packHunter.allyCountMin,
    max: bounds.enemyDesign.behaviorVocabulary.parameters.packHunter.allyCountMax,
  }),
});

export const AmbusherBehaviorPayloadSchema = z.strictObject({
  wakeRadiusTiles: boundedInt(
    bounds.enemyDesign.behaviorVocabulary.parameters.ambusherWakeRadiusTiles,
  ),
});

export const TerritorialBehaviorPayloadSchema = z.strictObject({
  radiusTiles: boundedInt(
    bounds.enemyDesign.behaviorVocabulary.parameters.territorialRadiusTiles,
  ),
});

export const GuardBehaviorPayloadSchema = z.strictObject({
  tetherId: nonEmptyString,
  tetherRadiusTiles: boundedInt(
    bounds.enemyDesign.behaviorVocabulary.parameters.guardTetherRadiusTiles,
  ),
});

export const CasterBehaviorPayloadSchema = z.strictObject({
  cooldownTurns: boundedInt(
    bounds.enemyDesign.behaviorVocabulary.parameters.casterCooldownTurns,
  ),
});

const BEHAVIOR_PAYLOAD_KEYS = [
  "approachMelee",
  "keepRange",
  "fleeLowHp",
  "packHunter",
  "ambusher",
  "territorial",
  "guard",
  "patrol",
  "thief",
  "caster",
  "bodyguard",
  "mimic",
] as const;

const BEHAVIOR_PAYLOAD_FIELD_BY_KIND = {
  approach_melee: "approachMelee",
  keep_range: "keepRange",
  flee_low_hp: "fleeLowHp",
  pack_hunter: "packHunter",
  ambusher: "ambusher",
  territorial: "territorial",
  guard: "guard",
  patrol: "patrol",
  thief: "thief",
  caster: "caster",
  bodyguard: "bodyguard",
  mimic: "mimic",
} as const satisfies Record<
  BehaviorKind,
  (typeof BEHAVIOR_PAYLOAD_KEYS)[number]
>;

// Provider-facing: required nullable payload fields avoid a root union.
export const BehaviorSchema = z
  .strictObject({
    kind: BehaviorKindSchema,
    approachMelee: EmptyBehaviorPayloadSchema.nullable(),
    keepRange: KeepRangeBehaviorPayloadSchema.nullable(),
    fleeLowHp: FleeLowHpBehaviorPayloadSchema.nullable(),
    packHunter: PackHunterBehaviorPayloadSchema.nullable(),
    ambusher: AmbusherBehaviorPayloadSchema.nullable(),
    territorial: TerritorialBehaviorPayloadSchema.nullable(),
    guard: GuardBehaviorPayloadSchema.nullable(),
    patrol: EmptyBehaviorPayloadSchema.nullable(),
    thief: EmptyBehaviorPayloadSchema.nullable(),
    caster: CasterBehaviorPayloadSchema.nullable(),
    bodyguard: EmptyBehaviorPayloadSchema.nullable(),
    mimic: EmptyBehaviorPayloadSchema.nullable(),
  })
  .superRefine((behavior, ctx) => {
    enforceActivePayload(
      behavior,
      ctx,
      BEHAVIOR_PAYLOAD_KEYS,
      BEHAVIOR_PAYLOAD_FIELD_BY_KIND[behavior.kind],
    );
  });

export type Behavior = z.infer<typeof BehaviorSchema>;

// Provider-facing: abilities are effect bundles; behavior parameters remain bounded.
export const EnemyDefinitionSchema = z.strictObject({
  id: nonEmptyString,
  name: EntityNameSchema,
  glyph: glyphSchema,
  origin: OriginTagSchema,
  stats: EnemyStatBlockSchema,
  behaviors: z
    .array(BehaviorSchema)
    .min(bounds.enemyDesign.behaviorsPerEnemy.min)
    .max(bounds.enemyDesign.behaviorsPerEnemy.max),
  abilities: z
    .array(EffectBundleSchema)
    .min(bounds.enemyDesign.abilitiesPerEnemy.min)
    .max(bounds.enemyDesign.abilitiesPerEnemy.max),
});

export type EnemyDefinition = z.infer<typeof EnemyDefinitionSchema>;

const enforceStatBound = (
  ctx: z.RefinementCtx,
  path: string[],
  value: number,
  range: { readonly min: number; readonly max: number },
): void => {
  if (value < range.min) {
    ctx.addIssue({
      code: "custom",
      path,
      message: `must be at least ${range.min}`,
    });
  }

  if (value > range.max) {
    ctx.addIssue({
      code: "custom",
      path,
      message: `must be at most ${range.max}`,
    });
  }
};

export const enemyStatBoundsForBand = (band: DepthBand) =>
  bounds.enemyDesign.statBudgetsByBand[band];
