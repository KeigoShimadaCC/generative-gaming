import { Texture } from "pixi.js";

import fallbackArtJson from "../../../content/art/fallback/index.json" with { type: "json" };
// eslint-disable-next-line no-restricted-imports -- Phase 66-71 brief requires building Pixi textures from the phase-65 atlas cache.
import {
  SpriteAtlasCache,
  type SpriteAtlasEntry,
} from "../../../src/art/atlas.js";
// eslint-disable-next-line no-restricted-imports -- Phase 66-71 brief requires consuming the curated phase-65 fallback art set.
import {
  fallbackSpriteById,
  parseFallbackSpriteSet,
} from "../../../src/art/fallback.js";

import type { StageDrawList } from "./draw-list";

export type StageTextureMap = Map<string, Texture>;

const parsedFallback = parseFallbackSpriteSet(fallbackArtJson);

if (!parsedFallback.ok) {
  throw new Error(
    `invalid fallback art set: ${parsedFallback.errors.join("; ")}`,
  );
}

const FALLBACK_SPRITE_SET = parsedFallback.spriteSet;

export const ensureStageTextures = (
  drawList: StageDrawList,
  textures: StageTextureMap,
): StageTextureMap => {
  const atlas = new SpriteAtlasCache();

  for (const sprite of drawList.sprites) {
    if (textures.has(sprite.atlasKeyString)) {
      continue;
    }

    const fallback = fallbackSpriteById(FALLBACK_SPRITE_SET, sprite.spriteId);
    const entry = atlas.set(sprite.atlasKey, fallback.manifest);
    textures.set(sprite.atlasKeyString, textureFromAtlasEntry(entry));
  }

  return textures;
};

export const destroyStageTextures = (textures: StageTextureMap): void => {
  for (const texture of textures.values()) {
    texture.destroy(true);
  }

  textures.clear();
};

const textureFromAtlasEntry = (entry: SpriteAtlasEntry): Texture => {
  const canvas = document.createElement("canvas");
  canvas.width = entry.raster.width;
  canvas.height = entry.raster.height;

  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error(`2D canvas unavailable for sprite ${entry.keyString}`);
  }

  context.imageSmoothingEnabled = false;
  const pixels = new Uint8ClampedArray(
    new ArrayBuffer(entry.raster.pixels.byteLength),
  );
  pixels.set(entry.raster.pixels);
  context.putImageData(new ImageData(pixels, entry.raster.width, entry.raster.height), 0, 0);

  const texture = Texture.from(canvas, true);
  texture.source.scaleMode = "nearest";
  texture.label = entry.keyString;

  return texture;
};
