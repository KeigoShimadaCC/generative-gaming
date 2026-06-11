import { z } from "zod";

import { bounds } from "../../config/index.js";
import { boundedInt, enforceActivePayload } from "../common.js";

export const TRIGGER_IDS = bounds.effectVocabulary.triggers.closedList;

export const TriggerKindSchema = z.enum(TRIGGER_IDS);

export type TriggerKind = z.infer<typeof TriggerKindSchema>;

export const EmptyTriggerPayloadSchema = z.strictObject({});

export const OnHitTriggerPayloadSchema = z.strictObject({
  procChancePercent: boundedInt(
    bounds.effectVocabulary.triggers.procChancePercent.onHit,
  ),
});

export const OnStruckTriggerPayloadSchema = z.strictObject({
  procChancePercent: boundedInt(
    bounds.effectVocabulary.triggers.procChancePercent.onStruck,
  ),
});

export const UseTriggerPayloadSchema = z.strictObject({
  charges: boundedInt(bounds.effectVocabulary.triggers.toolCharges),
});

const TRIGGER_PAYLOAD_KEYS = [
  "quaff",
  "read",
  "throwHit",
  "equipPassive",
  "onHit",
  "onStruck",
  "step",
  "use",
] as const;

const TRIGGER_PAYLOAD_FIELD_BY_KIND = {
  quaff: "quaff",
  read: "read",
  throw_hit: "throwHit",
  equip_passive: "equipPassive",
  on_hit: "onHit",
  on_struck: "onStruck",
  step: "step",
  use: "use",
} as const satisfies Record<TriggerKind, (typeof TRIGGER_PAYLOAD_KEYS)[number]>;

// Provider-facing: required nullable payload fields avoid a root union.
export const TriggerSchema = z
  .strictObject({
    kind: TriggerKindSchema,
    quaff: EmptyTriggerPayloadSchema.nullable(),
    read: EmptyTriggerPayloadSchema.nullable(),
    throwHit: EmptyTriggerPayloadSchema.nullable(),
    equipPassive: EmptyTriggerPayloadSchema.nullable(),
    onHit: OnHitTriggerPayloadSchema.nullable(),
    onStruck: OnStruckTriggerPayloadSchema.nullable(),
    step: EmptyTriggerPayloadSchema.nullable(),
    use: UseTriggerPayloadSchema.nullable(),
  })
  .superRefine((trigger, ctx) => {
    enforceActivePayload(
      trigger,
      ctx,
      TRIGGER_PAYLOAD_KEYS,
      TRIGGER_PAYLOAD_FIELD_BY_KIND[trigger.kind],
    );
  });

export type Trigger = z.infer<typeof TriggerSchema>;

export const isTriggerKind = (
  trigger: Trigger,
  kind: TriggerKind,
): boolean => trigger.kind === kind;
