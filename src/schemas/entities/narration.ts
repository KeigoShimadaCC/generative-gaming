import { z } from "zod";

import { config } from "../../config/index.js";
import { nonEmptyString } from "../common.js";
import { NarrationLineSchema } from "./common.js";

export const ObservationBeatSchema = z.strictObject({
  id: nonEmptyString,
  triggerTag: nonEmptyString,
  text: NarrationLineSchema,
});

// Provider-facing: structural and text caps come from the config bounds.
export const NarrationBeatsSchema = z.strictObject({
  floorIntro: NarrationLineSchema,
  observations: z
    .array(ObservationBeatSchema)
    .max(config.directorManifest.narrationBeats.triggeredObservationLinesMax),
});

export type NarrationBeats = z.infer<typeof NarrationBeatsSchema>;
