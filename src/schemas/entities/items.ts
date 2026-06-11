import { z } from "zod";

import { bounds, config } from "../../config/index.js";
import {
  boundedInt,
  enforceActivePayload,
  glyphSchema,
  nonEmptyString,
} from "../common.js";
import { EffectBundleSchema, type EffectBundle } from "../vocab/index.js";
import {
  DepthBandSchema,
  EntityNameSchema,
  ItemCategorySchema,
  type DepthBand,
  type ItemCategory,
} from "./common.js";

export const ItemValueSchema = z
  .strictObject({
    band: DepthBandSchema,
    coin: z.number().int(),
  })
  .superRefine((value, ctx) => {
    const valueBounds = config.itemsEconomy.valueBandsCoin[value.band];

    if (value.coin < valueBounds.min) {
      ctx.addIssue({
        code: "custom",
        path: ["coin"],
        message: `${value.band} item value must be at least ${valueBounds.min}`,
      });
    }

    if (value.coin > valueBounds.max) {
      ctx.addIssue({
        code: "custom",
        path: ["coin"],
        message: `${value.band} item value must be at most ${valueBounds.max}`,
      });
    }
  });

export const WeaponOnHitProcSchema = z
  .strictObject({
    chancePercent: boundedInt(
      bounds.effectVocabulary.triggers.procChancePercent.onHit,
    ),
    bundle: EffectBundleSchema,
  })
  .superRefine((proc, ctx) => {
    enforceProcBundle(proc.bundle, "on_hit", proc.chancePercent, ctx);
  });

export const ArmorOnStruckProcSchema = z
  .strictObject({
    chancePercent: boundedInt(
      bounds.effectVocabulary.triggers.procChancePercent.onStruck,
    ),
    bundle: EffectBundleSchema,
  })
  .superRefine((proc, ctx) => {
    enforceProcBundle(proc.bundle, "on_struck", proc.chancePercent, ctx);
  });

export const WeaponItemPayloadSchema = z.strictObject({
  attackBonus: boundedInt(bounds.itemsEconomy.weaponAtkBonus),
  cursed: z.boolean(),
  onHit: WeaponOnHitProcSchema.nullable(),
});

export const ArmorItemPayloadSchema = z.strictObject({
  defenseBonus: boundedInt(bounds.itemsEconomy.armorDefBonus),
  cursed: z.boolean(),
  onStruck: ArmorOnStruckProcSchema.nullable(),
});

export const CharmItemPayloadSchema = z
  .strictObject({
    passive: EffectBundleSchema,
    cursed: z.boolean(),
  })
  .superRefine((payload, ctx) => {
    enforceCharmPassive(payload.passive, ctx);
  });

export const DraughtItemPayloadSchema = z.strictObject({
  effect: EffectBundleSchema,
});

export const NoteItemPayloadSchema = z.strictObject({
  effect: EffectBundleSchema,
});

export const ThrowableItemPayloadSchema = z.strictObject({
  effect: EffectBundleSchema,
});

export const FoodItemPayloadSchema = z.strictObject({
  effect: EffectBundleSchema,
});

export const ToolItemPayloadSchema = z.strictObject({
  effect: EffectBundleSchema,
});

export const KeyItemPayloadSchema = z.strictObject({
  questHookId: nonEmptyString.nullable(),
});

export const CoinItemPayloadSchema = z.strictObject({});

const ITEM_PAYLOAD_KEYS = [
  "weapon",
  "armor",
  "charm",
  "draught",
  "note",
  "throwable",
  "food",
  "tool",
  "keyItem",
  "coin",
] as const;

const ITEM_PAYLOAD_FIELD_BY_KIND = {
  weapon: "weapon",
  armor: "armor",
  charm: "charm",
  draught: "draught",
  note: "note",
  throwable: "throwable",
  food: "food",
  tool: "tool",
  key_item: "keyItem",
  coin: "coin",
} as const satisfies Record<ItemCategory, (typeof ITEM_PAYLOAD_KEYS)[number]>;

// Provider-facing: required nullable payload fields avoid a root union.
export const ItemDefinitionSchema = z
  .strictObject({
    id: nonEmptyString,
    name: EntityNameSchema,
    glyph: glyphSchema,
    kind: ItemCategorySchema,
    value: ItemValueSchema,
    weapon: WeaponItemPayloadSchema.nullable(),
    armor: ArmorItemPayloadSchema.nullable(),
    charm: CharmItemPayloadSchema.nullable(),
    draught: DraughtItemPayloadSchema.nullable(),
    note: NoteItemPayloadSchema.nullable(),
    throwable: ThrowableItemPayloadSchema.nullable(),
    food: FoodItemPayloadSchema.nullable(),
    tool: ToolItemPayloadSchema.nullable(),
    keyItem: KeyItemPayloadSchema.nullable(),
    coin: CoinItemPayloadSchema.nullable(),
  })
  .superRefine((item, ctx) => {
    enforceActivePayload(
      item,
      ctx,
      ITEM_PAYLOAD_KEYS,
      ITEM_PAYLOAD_FIELD_BY_KIND[item.kind],
    );
  });

export type ItemDefinition = z.infer<typeof ItemDefinitionSchema>;

const enforceProcBundle = (
  bundle: EffectBundle,
  triggerKind: "on_hit" | "on_struck",
  chancePercent: number,
  ctx: z.RefinementCtx,
): void => {
  if (bundle.trigger.kind !== triggerKind) {
    ctx.addIssue({
      code: "custom",
      path: ["bundle", "trigger", "kind"],
      message: `proc bundle trigger must be ${triggerKind}`,
    });
    return;
  }

  const triggerChancePercent =
    triggerKind === "on_hit"
      ? bundle.trigger.onHit?.procChancePercent
      : bundle.trigger.onStruck?.procChancePercent;

  if (triggerChancePercent !== chancePercent) {
    ctx.addIssue({
      code: "custom",
      path: ["bundle", "trigger"],
      message: "proc chancePercent must match bundle trigger chance",
    });
  }
};

const enforceCharmPassive = (
  passive: EffectBundle,
  ctx: z.RefinementCtx,
): void => {
  if (passive.effects.length !== bounds.itemsEconomy.charmEquipPassiveEffects) {
    ctx.addIssue({
      code: "custom",
      path: ["passive", "effects"],
      message: `charm passive must contain exactly ${bounds.itemsEconomy.charmEquipPassiveEffects} effect`,
    });
  }

  if (passive.trigger.kind !== "equip_passive") {
    ctx.addIssue({
      code: "custom",
      path: ["passive", "trigger", "kind"],
      message: "charm passive trigger must be equip_passive",
    });
  }
};

export const itemValueBoundsForBand = (band: DepthBand) =>
  config.itemsEconomy.valueBandsCoin[band];
