import {
  formatSpriteValidationErrors,
  validateSpriteManifest,
} from "../art/sprite-manifest.js";
import { extractFirstJsonObject } from "./json.js";
import {
  artProviderFailure,
  type ArtDirectorProviderResult,
  type ArtDirectorProviderUsage,
} from "./types.js";

const ZERO_USAGE: ArtDirectorProviderUsage = {
  latencyMs: 0,
  tokens: null,
};

export const parseArtDirectorSpriteManifest = (
  raw: string,
  usage: ArtDirectorProviderUsage = ZERO_USAGE,
): ArtDirectorProviderResult => {
  const extracted = extractFirstJsonObject(raw);
  if (!extracted.ok) {
    return artProviderFailure("parse_fail", extracted.message, usage, raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted.json);
  } catch (error) {
    return artProviderFailure(
      "parse_fail",
      error instanceof Error ? `invalid JSON: ${error.message}` : "invalid JSON",
      usage,
      raw,
    );
  }

  const validated = validateSpriteManifest(parsed);
  if (!validated.ok) {
    return artProviderFailure(
      "validate_fail",
      "sprite manifest output did not match everdeep.sprite-manifest.v1",
      usage,
      raw,
      [formatSpriteValidationErrors(validated.errors)],
    );
  }

  return {
    ok: true,
    raw,
    manifest: validated.manifest,
    usage,
  };
};
