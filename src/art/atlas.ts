import {
  formatSpriteValidationErrors,
  rasterizeSpriteManifest,
  validateSpriteManifest,
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

export const GENERATED_ART_VERSION = "everdeep.art-generated.v1";
export const GENERATED_ART_INDEX_VERSION = "everdeep.art-generated-index.v1";

export type GeneratedSpriteRecord = {
  readonly version: typeof GENERATED_ART_VERSION;
  readonly themeId: string;
  readonly entityId: string;
  readonly seed: string;
  readonly manifest: SpriteManifest;
};

export type GeneratedArtIndexTheme = {
  readonly themeId: string;
  readonly seed: string;
  readonly sprites: readonly {
    readonly entityId: string;
    readonly path: string;
  }[];
};

export type GeneratedArtIndex = {
  readonly version: typeof GENERATED_ART_INDEX_VERSION;
  readonly themes: readonly GeneratedArtIndexTheme[];
};

export type GeneratedSpriteCatalogEntry = {
  readonly record: GeneratedSpriteRecord;
  readonly atlasKey: SpriteAtlasKey;
};

export type GeneratedArtIndexValidationResult =
  | { readonly ok: true; readonly index: GeneratedArtIndex }
  | { readonly ok: false; readonly errors: readonly string[] };

export type GeneratedSpriteRecordValidationResult =
  | { readonly ok: true; readonly record: GeneratedSpriteRecord }
  | { readonly ok: false; readonly errors: readonly string[] };

export const parseGeneratedArtIndex = (
  value: unknown
): GeneratedArtIndexValidationResult => {
  const errors: string[] = [];

  if (!isPlainObject(value)) {
    return { ok: false, errors: ["<root>: generated art index must be an object"] };
  }

  if (value.version !== GENERATED_ART_INDEX_VERSION) {
    errors.push(
      `version: expected ${GENERATED_ART_INDEX_VERSION}, got ${String(value.version)}`
    );
  }

  if (!Array.isArray(value.themes)) {
    errors.push("themes: must be an array");
  }

  const themes: GeneratedArtIndexTheme[] = [];

  if (Array.isArray(value.themes)) {
    value.themes.forEach((theme, index) => {
      if (!isPlainObject(theme)) {
        errors.push(`themes[${index}]: theme must be an object`);
        return;
      }

      const themeId = theme.themeId;
      const seed = theme.seed;

      if (typeof themeId !== "string" || themeId.length === 0) {
        errors.push(`themes[${index}].themeId: must be a non-empty string`);
        return;
      }

      if (themeId === FALLBACK_THEME_ID) {
        errors.push(
          `themes[${index}].themeId: generated themes cannot use ${FALLBACK_THEME_ID}`
        );
        return;
      }

      if (typeof seed !== "string" || seed.length === 0) {
        errors.push(`themes[${index}].seed: must be a non-empty string`);
        return;
      }

      if (!Array.isArray(theme.sprites)) {
        errors.push(`themes[${index}].sprites: must be an array`);
        return;
      }

      const sprites: GeneratedArtIndexTheme["sprites"][number][] = [];
      const seen = new Set<string>();

      theme.sprites.forEach((sprite, spriteIndex) => {
        if (!isPlainObject(sprite)) {
          errors.push(
            `themes[${index}].sprites[${spriteIndex}]: sprite must be an object`
          );
          return;
        }

        const entityId = sprite.entityId;
        const path = sprite.path;

        if (typeof entityId !== "string" || entityId.length === 0) {
          errors.push(
            `themes[${index}].sprites[${spriteIndex}].entityId: must be a non-empty string`
          );
          return;
        }

        if (seen.has(entityId)) {
          errors.push(
            `themes[${index}].sprites[${spriteIndex}].entityId: duplicate ${entityId}`
          );
          return;
        }
        seen.add(entityId);

        if (typeof path !== "string" || path.length === 0) {
          errors.push(
            `themes[${index}].sprites[${spriteIndex}].path: must be a non-empty string`
          );
          return;
        }

        sprites.push({ entityId, path });
      });

      themes.push({ themeId, seed, sprites });
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    index: {
      version: GENERATED_ART_INDEX_VERSION,
      themes
    }
  };
};

export const parseGeneratedSpriteRecord = (
  value: unknown
): GeneratedSpriteRecordValidationResult => {
  const errors: string[] = [];

  if (!isPlainObject(value)) {
    return { ok: false, errors: ["<root>: generated sprite must be an object"] };
  }

  if (value.version !== GENERATED_ART_VERSION) {
    errors.push(
      `version: expected ${GENERATED_ART_VERSION}, got ${String(value.version)}`
    );
  }

  const themeId = value.themeId;
  const entityId = value.entityId;
  const seed = value.seed;

  if (typeof themeId !== "string" || themeId.length === 0) {
    errors.push("themeId: must be a non-empty string");
  } else if (themeId === FALLBACK_THEME_ID) {
    errors.push(`themeId: generated sprites cannot use ${FALLBACK_THEME_ID}`);
  }

  if (typeof entityId !== "string" || entityId.length === 0) {
    errors.push("entityId: must be a non-empty string");
  }

  if (typeof seed !== "string" || seed.length === 0) {
    errors.push("seed: must be a non-empty string");
  }

  const validated = validateSpriteManifest(value.manifest);
  if (!validated.ok) {
    errors.push(
      `manifest: ${formatSpriteValidationErrors(validated.errors)}`
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (
    typeof themeId !== "string" ||
    typeof entityId !== "string" ||
    typeof seed !== "string" ||
    !validated.ok
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    record: {
      version: GENERATED_ART_VERSION,
      themeId,
      entityId,
      seed,
      manifest: validated.manifest
    }
  };
};

export class GeneratedSpriteCatalog {
  readonly #entries = new Map<string, GeneratedSpriteCatalogEntry>();
  readonly #themeSeeds = new Map<string, string>();

  static empty(): GeneratedSpriteCatalog {
    return new GeneratedSpriteCatalog();
  }

  static fromRecords(
    records: readonly GeneratedSpriteRecord[]
  ): GeneratedSpriteCatalog {
    const catalog = new GeneratedSpriteCatalog();

    for (const record of records) {
      catalog.add(record);
    }

    return catalog;
  }

  static fromIndex(
    index: GeneratedArtIndex,
    loadRecord: (path: string) => unknown
  ): GeneratedSpriteCatalog {
    const catalog = new GeneratedSpriteCatalog();

    for (const theme of index.themes) {
      catalog.#themeSeeds.set(theme.themeId, theme.seed);

      for (const sprite of theme.sprites) {
        const parsed = parseGeneratedSpriteRecord(loadRecord(sprite.path));
        if (!parsed.ok) {
          throw new Error(
            `invalid generated sprite ${sprite.path}: ${parsed.errors.join("; ")}`
          );
        }

        if (parsed.record.themeId !== theme.themeId) {
          throw new Error(
            `generated sprite ${sprite.path}: themeId ${parsed.record.themeId} does not match index theme ${theme.themeId}`
          );
        }

        if (parsed.record.entityId !== sprite.entityId) {
          throw new Error(
            `generated sprite ${sprite.path}: entityId ${parsed.record.entityId} does not match index entity ${sprite.entityId}`
          );
        }

        catalog.add(parsed.record);
      }
    }

    return catalog;
  }

  get size(): number {
    return this.#entries.size;
  }

  themeIds(): readonly string[] {
    return [...this.#themeSeeds.keys()].sort();
  }

  has(themeId: string, entityId: string): boolean {
    return this.#entries.has(catalogKey(themeId, entityId));
  }

  get(themeId: string, entityId: string): GeneratedSpriteCatalogEntry | null {
    return this.#entries.get(catalogKey(themeId, entityId)) ?? null;
  }

  seedForTheme(themeId: string): string | null {
    return this.#themeSeeds.get(themeId) ?? null;
  }

  entries(): readonly GeneratedSpriteCatalogEntry[] {
    return [...this.#entries.values()].sort((left, right) =>
      serializeSpriteAtlasKey(left.atlasKey).localeCompare(
        serializeSpriteAtlasKey(right.atlasKey)
      )
    );
  }

  add(record: GeneratedSpriteRecord): void {
    this.#themeSeeds.set(record.themeId, record.seed);
    const atlasKey = spriteAtlasKey(record.themeId, record.entityId, record.seed);
    this.#entries.set(catalogKey(record.themeId, record.entityId), {
      record,
      atlasKey
    });
  }
}

export const populateAtlasFromGeneratedCatalog = (
  atlas: SpriteAtlasCache,
  catalog: GeneratedSpriteCatalog,
  options: { readonly scale?: number } = {}
): readonly SpriteAtlasEntry[] =>
  catalog.entries().map((entry) =>
    atlas.getOrSet(entry.atlasKey, entry.record.manifest, options)
  );

const encodeKeyPart = (part: string): string => encodeURIComponent(part);

const decodeKeyPart = (part: string): string => decodeURIComponent(part);

const catalogKey = (themeId: string, entityId: string): string =>
  `${themeId}|${entityId}`;

const isPlainObject = (
  value: unknown
): value is { readonly [key: string]: unknown } =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
