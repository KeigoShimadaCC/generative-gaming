import { FALLBACK_THEME_ID } from "./atlas.js";
import {
  formatSpriteValidationErrors,
  validateSpriteManifest,
  type SpriteManifest
} from "./sprite-manifest.js";

export const FALLBACK_SPRITE_SET_VERSION = "everdeep.art-fallback.v1";

export const FALLBACK_SPRITE_IDS = [
  "terrain.floor",
  "terrain.wall",
  "terrain.door",
  "terrain.stairs_down",
  "terrain.entrance",
  "terrain.water",
  "trap.hidden",
  "trap.revealed",
  "actor.player",
  "enemy.brute",
  "enemy.skirmisher",
  "enemy.caster",
  "item.gear",
  "item.consumable",
  "item.treasure",
  "npc.keeper",
  "feature.hoard"
] as const;

export type FallbackSpriteId = (typeof FALLBACK_SPRITE_IDS)[number];

export type FallbackSpriteRole =
  | "terrain"
  | "trap"
  | "player"
  | "enemy"
  | "item"
  | "npc"
  | "feature";

export type FallbackSpriteRecord = {
  readonly id: FallbackSpriteId;
  readonly role: FallbackSpriteRole;
  readonly label: string;
  readonly manifest: SpriteManifest;
};

export type FallbackSpriteSet = {
  readonly version: typeof FALLBACK_SPRITE_SET_VERSION;
  readonly themeId: typeof FALLBACK_THEME_ID;
  readonly sprites: readonly FallbackSpriteRecord[];
};

export type FallbackSpriteSetValidationResult =
  | {
      readonly ok: true;
      readonly spriteSet: FallbackSpriteSet;
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    };

export const parseFallbackSpriteSet = (
  value: unknown
): FallbackSpriteSetValidationResult => {
  const errors: string[] = [];

  if (!isPlainObject(value)) {
    return { ok: false, errors: ["<root>: fallback set must be an object"] };
  }

  if (value.version !== FALLBACK_SPRITE_SET_VERSION) {
    errors.push(
      `version: expected ${FALLBACK_SPRITE_SET_VERSION}, got ${String(
        value.version
      )}`
    );
  }

  if (value.themeId !== FALLBACK_THEME_ID) {
    errors.push(`themeId: expected ${FALLBACK_THEME_ID}`);
  }

  if (!Array.isArray(value.sprites)) {
    errors.push("sprites: must be an array");
  }

  const seen = new Set<string>();
  const sprites: FallbackSpriteRecord[] = [];

  if (Array.isArray(value.sprites)) {
    value.sprites.forEach((sprite, index) => {
      if (!isPlainObject(sprite)) {
        errors.push(`sprites[${index}]: sprite must be an object`);
        return;
      }

      const id = sprite.id;
      const role = sprite.role;
      const label = sprite.label;

      if (!isFallbackSpriteId(id)) {
        errors.push(`sprites[${index}].id: unknown fallback sprite id`);
        return;
      }

      if (seen.has(id)) {
        errors.push(`sprites[${index}].id: duplicate fallback sprite id ${id}`);
        return;
      }
      seen.add(id);

      if (!isFallbackSpriteRole(role)) {
        errors.push(`sprites[${index}].role: unknown fallback sprite role`);
        return;
      }

      if (typeof label !== "string" || label.length === 0) {
        errors.push(`sprites[${index}].label: label must be non-empty`);
        return;
      }

      const validated = validateSpriteManifest(sprite.manifest);
      if (!validated.ok) {
        errors.push(
          `sprites[${index}].manifest: ${formatSpriteValidationErrors(
            validated.errors
          )}`
        );
        return;
      }

      sprites.push({
        id,
        role,
        label,
        manifest: validated.manifest
      });
    });
  }

  for (const requiredId of FALLBACK_SPRITE_IDS) {
    if (!seen.has(requiredId)) {
      errors.push(`sprites: missing required fallback sprite ${requiredId}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    spriteSet: {
      version: FALLBACK_SPRITE_SET_VERSION,
      themeId: FALLBACK_THEME_ID,
      sprites
    }
  };
};

export const fallbackSpriteById = (
  spriteSet: FallbackSpriteSet,
  id: FallbackSpriteId
): FallbackSpriteRecord => {
  const sprite = spriteSet.sprites.find((candidate) => candidate.id === id);

  if (sprite === undefined) {
    throw new Error(`missing fallback sprite ${id}`);
  }

  return sprite;
};

export const fallbackSpritesById = (
  spriteSet: FallbackSpriteSet
): ReadonlyMap<FallbackSpriteId, FallbackSpriteRecord> =>
  new Map(spriteSet.sprites.map((sprite) => [sprite.id, sprite]));

const FALLBACK_SPRITE_ID_SET = new Set<string>(FALLBACK_SPRITE_IDS);

const FALLBACK_SPRITE_ROLES = [
  "terrain",
  "trap",
  "player",
  "enemy",
  "item",
  "npc",
  "feature"
] as const satisfies readonly FallbackSpriteRole[];

const FALLBACK_SPRITE_ROLE_SET = new Set<string>(FALLBACK_SPRITE_ROLES);

const isFallbackSpriteId = (value: unknown): value is FallbackSpriteId =>
  typeof value === "string" && FALLBACK_SPRITE_ID_SET.has(value);

const isFallbackSpriteRole = (value: unknown): value is FallbackSpriteRole =>
  typeof value === "string" && FALLBACK_SPRITE_ROLE_SET.has(value);

const isPlainObject = (
  value: unknown
): value is { readonly [key: string]: unknown } =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
