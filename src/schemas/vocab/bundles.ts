import { z } from "zod";

import { bounds } from "../../config/index.js";
import { EffectSchema } from "./effects.js";
import { TargetingShapeSchema } from "./targeting.js";
import { TriggerSchema } from "./triggers.js";

// Provider-facing: composed object, not a root union.
export const EffectBundleSchema = z.strictObject({
  effects: z
    .array(EffectSchema)
    .min(bounds.effectVocabulary.effectsPerBundle.min)
    .max(bounds.effectVocabulary.effectsPerBundle.max),
  trigger: TriggerSchema,
  targeting: TargetingShapeSchema,
});

export type EffectBundle = z.infer<typeof EffectBundleSchema>;
