import { z } from "zod";

import { bounds } from "../../config/index.js";
import { nonEmptyString } from "../common.js";
import { EffectBundleSchema, type EffectBundle } from "../vocab/index.js";
import { EntityNameSchema } from "./common.js";

export const TrapDefinitionSchema = z
  .strictObject({
    id: nonEmptyString,
    name: EntityNameSchema,
    hidden: z.literal(true),
    effectBundle: EffectBundleSchema,
  })
  .superRefine((trap, ctx) => {
    enforceStepTrap(trap.effectBundle, ctx);
  });

export type TrapDefinition = z.infer<typeof TrapDefinitionSchema>;

export const TrapDefinitionsForFloorSchema = z
  .array(TrapDefinitionSchema)
  .min(bounds.trapsNpcsQuests.traps.perFloor.min)
  .max(bounds.trapsNpcsQuests.traps.perFloor.max);

const enforceStepTrap = (
  effectBundle: EffectBundle,
  ctx: z.RefinementCtx,
): void => {
  if (effectBundle.trigger.kind !== "step") {
    ctx.addIssue({
      code: "custom",
      path: ["effectBundle", "trigger", "kind"],
      message: "trap effect bundle trigger must be step",
    });
  }
};
