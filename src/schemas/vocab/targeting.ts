import { z } from "zod";

import { bounds } from "../../config/index.js";
import { boundedInt, enforceActivePayload } from "../common.js";

export const TARGETING_SHAPE_IDS = bounds.effectVocabulary.targetingShapes.closedList;

export const TargetingShapeKindSchema = z.enum(TARGETING_SHAPE_IDS);

export type TargetingShapeKind = z.infer<typeof TargetingShapeKindSchema>;

export const BurstCenterSchema = z.enum(
  bounds.effectVocabulary.targetingShapes.burstCenters,
);

export const EmptyTargetingPayloadSchema = z.strictObject({});

export const BoltTargetingPayloadSchema = z.strictObject({
  rangeTiles: boundedInt(bounds.effectVocabulary.targetingShapes.boltRangeTiles),
});

export const BurstTargetingPayloadSchema = z.strictObject({
  radiusTiles: boundedInt(
    bounds.effectVocabulary.targetingShapes.burstRadiusTiles,
  ),
  center: BurstCenterSchema,
});

const TARGETING_PAYLOAD_KEYS = [
  "self",
  "melee",
  "bolt",
  "burst",
  "floor",
] as const;

const TARGETING_PAYLOAD_FIELD_BY_KIND = {
  self: "self",
  melee: "melee",
  bolt: "bolt",
  burst: "burst",
  floor: "floor",
} as const satisfies Record<
  TargetingShapeKind,
  (typeof TARGETING_PAYLOAD_KEYS)[number]
>;

// Provider-facing: required nullable payload fields avoid a root union.
export const TargetingShapeSchema = z
  .strictObject({
    kind: TargetingShapeKindSchema,
    self: EmptyTargetingPayloadSchema.nullable(),
    melee: EmptyTargetingPayloadSchema.nullable(),
    bolt: BoltTargetingPayloadSchema.nullable(),
    burst: BurstTargetingPayloadSchema.nullable(),
    floor: EmptyTargetingPayloadSchema.nullable(),
  })
  .superRefine((targeting, ctx) => {
    enforceActivePayload(
      targeting,
      ctx,
      TARGETING_PAYLOAD_KEYS,
      TARGETING_PAYLOAD_FIELD_BY_KIND[targeting.kind],
    );
  });

export type TargetingShape = z.infer<typeof TargetingShapeSchema>;
