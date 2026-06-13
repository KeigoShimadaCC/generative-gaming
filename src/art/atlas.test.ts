import { describe, expect, it } from "vitest";

import {
  FALLBACK_THEME_ID,
  parseSpriteAtlasKey,
  serializeSpriteAtlasKey,
  SpriteAtlasCache,
  spriteAtlasKey
} from "./atlas.js";
import type { SpriteManifest } from "./sprite-manifest.js";

describe("sprite atlas cache", () => {
  it("serializes seeded atlas keys deterministically", () => {
    const key = spriteAtlasKey(FALLBACK_THEME_ID, "enemy.brute", "seed:a|b c");
    const keyString = serializeSpriteAtlasKey(key);

    expect(keyString).toBe("fallback|enemy.brute|seed%3Aa%7Cb%20c");
    expect(parseSpriteAtlasKey(keyString)).toEqual(key);
  });

  it("stores rasterized sprites under the full theme/entity/seed key", () => {
    const atlas = new SpriteAtlasCache();
    const fallbackKey = spriteAtlasKey(
      FALLBACK_THEME_ID,
      "terrain.floor",
      "seed-1"
    );
    const generatedKey = spriteAtlasKey(
      "moss-cavern",
      "terrain.floor",
      "seed-1"
    );

    const fallback = atlas.set(fallbackKey, boxSprite());
    const generated = atlas.set(generatedKey, boxSprite(), { scale: 2 });

    expect(atlas.size).toBe(2);
    expect(atlas.get(fallbackKey)).toBe(fallback);
    expect(atlas.get(generatedKey)).toBe(generated);
    expect(fallback.raster.width).toBe(16);
    expect(generated.raster.width).toBe(32);
    expect(atlas.entries().map((entry) => entry.keyString)).toEqual([
      "fallback|terrain.floor|seed-1",
      "moss-cavern|terrain.floor|seed-1"
    ]);
  });
});

const boxSprite = (): SpriteManifest => ({
  w: 16,
  h: 16,
  palette: ["#ffffff", "#000000"],
  px: Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) =>
      x >= 4 && x <= 11 && y >= 4 && y <= 11 ? (x === 4 ? 2 : 1) : 0
    )
  )
});
