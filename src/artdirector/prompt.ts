import type { HexColor } from "../art/sprite-manifest.js";
import type { ArtDirectorPromptInput } from "./types.js";

export const buildArtDirectorPrompt = (
  input: ArtDirectorPromptInput,
): string =>
  [
    "You are the ArtDirector for Everdeep, a turn-based mystery-dungeon roguelike.",
    "Generate one compact sprite manifest as code/data, not raster art.",
    "",
    "Inputs:",
    `- Theme: ${input.themeId}.`,
    `- Entity role: ${input.role}.`,
    `- Entity id: ${input.entityId}.`,
    `- Entity description: ${input.entityPrompt}.`,
    `- Dimensions: ${input.size}x${input.size}.`,
    `- Palette constraint: ${paletteConstraint(input.paletteHint)}.`,
    "",
    "Return ONLY one JSON object with this exact strict shape:",
    '{"w":16,"h":16,"palette":["#rrggbb"],"px":[[0]]}',
    "",
    "Contract:",
    "- w and h must both be either 16 or 24 and must match.",
    "- Use the requested dimensions unless the request explicitly says otherwise.",
    "- palette contains 1-15 visible colors as lowercase #rrggbb strings.",
    "- Do not include transparency in the palette; px index 0 is transparent.",
    "- px is a row-major matrix with exactly h rows and exactly w integers per row.",
    "- Every px value must be an integer from 0 through palette.length.",
    "- The sprite must be readable at 16x16: strong silhouette, at least 8% non-transparent pixels, at least 3 occupied rows and 3 occupied columns, and at least 2 visible palette colors.",
    "- Normal sprites should use 3-6 visible colors; signature or boss sprites may use up to 8; hard maximum is 15.",
    "- Avoid text, gradients, anti-aliasing, comments, markdown fences, trailing commas, extra keys, or explanations.",
    "",
    "Art direction:",
    "- Make the sprite recognizable from its silhouette before color detail.",
    "- Use transparent background around entities; terrain may fill the tile edge-to-edge.",
    "- Use a darker outline and one brighter highlight color.",
    "- Keep features chunky; single-pixel details should support the silhouette, not carry the read.",
  ].join("\n");

const paletteConstraint = (paletteHint: readonly HexColor[]): string => {
  if (paletteHint.length === 0) {
    return "3-6 visible colors, lowercase hex only, high silhouette contrast";
  }

  return [
    "3-6 visible colors, lowercase hex only, high silhouette contrast",
    `suggested colors: ${paletteHint.join(", ")}`,
  ].join("; ");
};
