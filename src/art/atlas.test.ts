import { describe, expect, it } from "vitest";

import {
  FALLBACK_THEME_ID,
  GeneratedSpriteCatalog,
  parseGeneratedArtIndex,
  parseGeneratedSpriteRecord,
  populateAtlasFromGeneratedCatalog,
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

  it("loads generated sprite records into the atlas by themed key", () => {
    const atlas = new SpriteAtlasCache();
    const catalog = GeneratedSpriteCatalog.fromRecords([
      {
        version: "everdeep.art-generated.v1",
        themeId: "torchlit-limestone",
        entityId: "enemy.brute",
        seed: "art-batch-shallows",
        manifest: boxSprite()
      }
    ]);

    const entries = populateAtlasFromGeneratedCatalog(atlas, catalog);
    const key = spriteAtlasKey(
      "torchlit-limestone",
      "enemy.brute",
      "art-batch-shallows"
    );

    expect(entries).toHaveLength(1);
    expect(atlas.get(key)?.manifest).toEqual(boxSprite());
    expect(catalog.has("torchlit-limestone", "enemy.brute")).toBe(true);
    expect(catalog.has("torchlit-limestone", "actor.player")).toBe(false);
  });

  it("parses generated art index and sprite records", () => {
    const record = {
      version: "everdeep.art-generated.v1",
      themeId: "ferrous-fungal-middle",
      entityId: "enemy.caster",
      seed: "art-batch-middle",
      manifest: boxSprite()
    };
    const parsedRecord = parseGeneratedSpriteRecord(record);
    expect(parsedRecord.ok).toBe(true);

    const parsedIndex = parseGeneratedArtIndex({
      version: "everdeep.art-generated-index.v1",
      themes: [
        {
          themeId: "ferrous-fungal-middle",
          seed: "art-batch-middle",
          sprites: [{ entityId: "enemy.caster", path: "ferrous-fungal-middle/enemy.caster.json" }]
        }
      ]
    });
    expect(parsedIndex.ok).toBe(true);

    if (!parsedIndex.ok || !parsedRecord.ok) {
      throw new Error("expected generated art fixtures to parse");
    }

    const catalog = GeneratedSpriteCatalog.fromIndex(parsedIndex.index, (path) => {
      if (path === "ferrous-fungal-middle/enemy.caster.json") {
        return record;
      }

      throw new Error(`unexpected generated sprite path: ${path}`);
    });

    expect(catalog.seedForTheme("ferrous-fungal-middle")).toBe("art-batch-middle");
    expect(
      parseSpriteAtlasKey(
        serializeSpriteAtlasKey(
          catalog.get("ferrous-fungal-middle", "enemy.caster")!.atlasKey
        )
      )
    ).toEqual({
      themeId: "ferrous-fungal-middle",
      entityId: "enemy.caster",
      seed: "art-batch-middle"
    });
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
