import type { SpriteAtlasKey } from "./atlas.js";
import type { FallbackSpriteId, FallbackSpriteRole } from "./fallback.js";
import type {
  HexColor,
  SpriteManifest,
  SpriteSize
} from "./sprite-manifest.js";

export type ArtDirectorSpriteRole = FallbackSpriteRole | "signature" | "boss";

export type ArtDirectorSpriteRequest = {
  readonly entityId: string;
  readonly role: ArtDirectorSpriteRole;
  readonly size: SpriteSize;
  readonly fallbackSpriteId: FallbackSpriteId;
  readonly prompt: string;
  readonly paletteHint: readonly HexColor[];
};

export type ArtDirectorBatchRequest = {
  readonly themeId: string;
  readonly seed: string;
  readonly sprites: readonly ArtDirectorSpriteRequest[];
};

export type ArtDirectorAcceptedSprite = {
  readonly entityId: string;
  readonly atlasKey: SpriteAtlasKey;
  readonly manifest: SpriteManifest;
  readonly sourceArtifactPath: string;
};

export type ArtDirectorRejectedSprite = {
  readonly entityId: string;
  readonly fallbackSpriteId: FallbackSpriteId;
  readonly reason: string;
  readonly sourceArtifactPath: string | null;
};

export type ArtDirectorBatchResult = {
  readonly accepted: readonly ArtDirectorAcceptedSprite[];
  readonly rejected: readonly ArtDirectorRejectedSprite[];
};

/**
 * Seam only. A future provider writes sprite-manifest v1 data, the Art Gauntlet
 * validates/rasterizes it, and accepted manifests enter the atlas under
 * (themeId, entityId, seed). Rejections continue through fallback sprites.
 */
export interface ArtDirector {
  generateSprites(
    request: ArtDirectorBatchRequest,
    options?: { readonly signal?: AbortSignal }
  ): Promise<ArtDirectorBatchResult>;
}

export {
  AmbientArtDirector,
  createAmbientArtDirector as createArtDirector
} from "../artdirector/director.js";
export type {
  AmbientArtDirectorOptions as CreateArtDirectorOptions,
  ArtDirectorMode
} from "../artdirector/director.js";
