import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  FALLBACK_SPRITE_IDS,
  fallbackSpriteById,
  parseFallbackSpriteSet
} from "./fallback.js";
import {
  rasterizeSpriteManifest,
  spriteManifestStats
} from "./sprite-manifest.js";

const FALLBACK_INDEX_URL = new URL(
  "../../content/art/fallback/index.json",
  import.meta.url
);

describe("curated fallback sprite set", () => {
  it("validates and rasterizes every Old Stock sprite manifest", () => {
    const parsed = parseFallbackSpriteSet(
      JSON.parse(readFileSync(FALLBACK_INDEX_URL, "utf8"))
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error(parsed.errors.join("\n"));
    }

    const { spriteSet } = parsed;
    expect(spriteSet.sprites).toHaveLength(FALLBACK_SPRITE_IDS.length);
    expect(fallbackSpriteById(spriteSet, "feature.hoard").manifest.w).toBe(24);

    const rasterized = spriteSet.sprites.map((sprite) => ({
      sprite,
      raster: rasterizeSpriteManifest(sprite.manifest),
      stats: spriteManifestStats(sprite.manifest)
    }));

    expect(rasterized.every(({ stats }) => stats.filledPixels > 0)).toBe(true);
    expect(
      rasterized
        .filter(({ sprite }) => sprite.role === "enemy")
        .map(({ sprite }) => sprite.id)
    ).toEqual(["enemy.brute", "enemy.skirmisher", "enemy.caster"]);
    expect(
      rasterized
        .filter(({ sprite }) => sprite.role === "item")
        .map(({ sprite }) => sprite.id)
    ).toEqual(["item.gear", "item.consumable", "item.treasure"]);

    const totalBytes = rasterized.reduce(
      (sum, { raster }) => sum + raster.pixels.byteLength,
      0
    );
    console.info(
      `curated fallback sprites validated=${spriteSet.sprites.length} rasterized=${rasterized.length} rgbaBytes=${totalBytes}`
    );
  });
});
