import { describe, expect, it } from "vitest";

import {
  MIN_FILLED_RATIO,
  rasterizeSpriteManifest,
  spriteManifestStats,
  validateSpriteManifest,
  type SpriteManifest
} from "./sprite-manifest.js";

describe("sprite manifest v1", () => {
  it("validates and rasterizes readable 16x16 manifests", () => {
    const manifest = boxSprite();
    const validated = validateSpriteManifest(manifest);

    expect(validated.ok).toBe(true);
    if (!validated.ok) {
      throw new Error("manifest should validate");
    }

    const stats = spriteManifestStats(validated.manifest);
    expect(stats.filledRatio).toBeGreaterThanOrEqual(MIN_FILLED_RATIO);
    expect(stats.visibleColorCount).toBe(2);
    expect(stats.occupiedRows).toBeGreaterThanOrEqual(3);
    expect(stats.occupiedColumns).toBeGreaterThanOrEqual(3);

    const raster = rasterizeSpriteManifest(validated.manifest, { scale: 2 });
    expect(raster.width).toBe(32);
    expect(raster.height).toBe(32);
    expect(raster.pixels).toHaveLength(32 * 32 * 4);
    expect([
      ...raster.pixels.slice((10 * 32 + 10) * 4, (10 * 32 + 10) * 4 + 4)
    ]).toEqual([255, 255, 255, 255]);
  });

  it("rejects non-contract fields and unreadable sprites", () => {
    expect(
      validateSpriteManifest({
        ...boxSprite(),
        version: "not-in-v1"
      }).ok
    ).toBe(false);

    expect(
      validateSpriteManifest({
        w: 16,
        h: 16,
        palette: ["#ffffff", "#000000"],
        px: Array.from({ length: 16 }, () => Array(16).fill(0))
      }).ok
    ).toBe(false);

    expect(
      validateSpriteManifest({
        w: 16,
        h: 16,
        palette: ["#FFFFFF", "#000000"],
        px: Array.from({ length: 16 }, (_, y) =>
          Array.from({ length: 16 }, (_, x) =>
            x >= 4 && x <= 11 && y >= 4 && y <= 11 ? 1 : 0
          )
        )
      }).ok
    ).toBe(false);
  });
});

const boxSprite = (): SpriteManifest => ({
  w: 16,
  h: 16,
  palette: ["#ffffff", "#000000"],
  px: Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => {
      if (x < 4 || x > 11 || y < 4 || y > 11) {
        return 0;
      }

      return x === 4 || x === 11 || y === 4 || y === 11 ? 2 : 1;
    })
  )
});
