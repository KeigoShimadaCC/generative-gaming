import {
  rasterizeSpriteManifest,
  type RasterizedSprite,
  type SpriteManifest
} from "./sprite-manifest.js";

export const FALLBACK_THEME_ID = "fallback";

export type SpriteAtlasThemeId = string | typeof FALLBACK_THEME_ID;

export type SpriteAtlasKey = {
  readonly themeId: SpriteAtlasThemeId;
  readonly entityId: string;
  readonly seed: string;
};

export type SpriteAtlasEntry = {
  readonly key: SpriteAtlasKey;
  readonly keyString: string;
  readonly manifest: SpriteManifest;
  readonly raster: RasterizedSprite;
};

export const spriteAtlasKey = (
  themeId: SpriteAtlasThemeId,
  entityId: string,
  seed: string
): SpriteAtlasKey => ({ themeId, entityId, seed });

export const serializeSpriteAtlasKey = (key: SpriteAtlasKey): string =>
  [key.themeId, key.entityId, key.seed].map(encodeKeyPart).join("|");

export const parseSpriteAtlasKey = (keyString: string): SpriteAtlasKey => {
  const parts = keyString.split("|");
  if (parts.length !== 3) {
    throw new Error(`invalid sprite atlas key: ${keyString}`);
  }

  const [themeId, entityId, seed] = parts.map(decodeKeyPart);
  if (
    themeId === undefined ||
    entityId === undefined ||
    seed === undefined ||
    themeId.length === 0 ||
    entityId.length === 0 ||
    seed.length === 0
  ) {
    throw new Error(`invalid sprite atlas key: ${keyString}`);
  }

  return { themeId, entityId, seed };
};

export class SpriteAtlasCache {
  readonly #entries = new Map<string, SpriteAtlasEntry>();

  get size(): number {
    return this.#entries.size;
  }

  has(key: SpriteAtlasKey): boolean {
    return this.#entries.has(serializeSpriteAtlasKey(key));
  }

  get(key: SpriteAtlasKey): SpriteAtlasEntry | null {
    return this.#entries.get(serializeSpriteAtlasKey(key)) ?? null;
  }

  set(
    key: SpriteAtlasKey,
    manifest: SpriteManifest,
    options: { readonly scale?: number } = {}
  ): SpriteAtlasEntry {
    const keyString = serializeSpriteAtlasKey(key);
    const entry = {
      key,
      keyString,
      manifest,
      raster: rasterizeSpriteManifest(manifest, options)
    } as const satisfies SpriteAtlasEntry;

    this.#entries.set(keyString, entry);

    return entry;
  }

  getOrSet(
    key: SpriteAtlasKey,
    manifest: SpriteManifest,
    options: { readonly scale?: number } = {}
  ): SpriteAtlasEntry {
    const existing = this.get(key);

    return existing ?? this.set(key, manifest, options);
  }

  entries(): readonly SpriteAtlasEntry[] {
    return [...this.#entries.values()].sort((left, right) =>
      left.keyString.localeCompare(right.keyString)
    );
  }

  clear(): void {
    this.#entries.clear();
  }
}

const encodeKeyPart = (part: string): string => encodeURIComponent(part);

const decodeKeyPart = (part: string): string => decodeURIComponent(part);
