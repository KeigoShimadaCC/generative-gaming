import { z } from "zod";

import { bounds } from "../../config/index.js";
import { nonEmptyString } from "../common.js";

export const DepthBandSchema = z.enum(["shallows", "middle", "lowest"]);

export type DepthBand = z.infer<typeof DepthBandSchema>;

export const OriginTagSchema = z.enum(["made", "old_stock", "kept"]);

export const EntityNameSchema = nonEmptyString.max(
  bounds.directorManifest.textCaps.nameMaxChars,
);

export const DescriptionDialogueTextSchema = nonEmptyString.max(
  bounds.directorManifest.textCaps.descriptionDialogueLineMaxChars,
);

export const NarrationLineSchema = nonEmptyString.max(
  bounds.directorManifest.textCaps.narrationLineMaxChars,
);

export const ItemCategorySchema = z.enum([
  "weapon",
  "armor",
  "charm",
  "draught",
  "note",
  "throwable",
  "food",
  "tool",
  "key_item",
  "coin",
]);

export type ItemCategory = z.infer<typeof ItemCategorySchema>;
