import type {
  ArtDirector,
  ArtDirectorAcceptedSprite,
  ArtDirectorBatchRequest,
  ArtDirectorBatchResult,
  ArtDirectorRejectedSprite,
  ArtDirectorSpriteRequest,
} from "../art/art-director.js";
import {
  serializeSpriteAtlasKey,
  spriteAtlasKey,
  SpriteAtlasCache,
} from "../art/atlas.js";
import { buildArtDirectorPrompt } from "./prompt.js";
import { AmbientArtDirectorProvider } from "./provider.js";
import { runArtGauntlet } from "./gauntlet.js";
import {
  writeArtDirectorAttemptArtifact,
  type ArtDirectorArtifactOptions,
} from "./artifacts.js";
import type {
  ArtDirectorProviderResult,
  ArtDirectorSpriteProvider,
} from "./types.js";

export type ArtDirectorMode = "generate" | "fallback";

export type AmbientArtDirectorOptions = {
  readonly provider?: ArtDirectorSpriteProvider;
  readonly atlas?: SpriteAtlasCache;
  readonly mode?: ArtDirectorMode;
  readonly timeoutMs?: number;
  readonly artifacts?: ArtDirectorArtifactOptions;
  readonly now?: () => string;
};

export class AmbientArtDirector implements ArtDirector {
  private readonly provider: ArtDirectorSpriteProvider;
  private readonly atlas: SpriteAtlasCache;
  private readonly mode: ArtDirectorMode;
  private readonly timeoutMs: number | undefined;
  private readonly artifacts: ArtDirectorArtifactOptions | undefined;
  private readonly now: () => string;
  private readonly sourcePaths = new Map<string, string>();

  constructor(options: AmbientArtDirectorOptions = {}) {
    this.provider = options.provider ?? new AmbientArtDirectorProvider();
    this.atlas = options.atlas ?? new SpriteAtlasCache();
    this.mode = options.mode ?? artDirectorModeFromEnv();
    this.timeoutMs = options.timeoutMs;
    this.artifacts = options.artifacts;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async generateSprites(
    request: ArtDirectorBatchRequest,
  ): Promise<ArtDirectorBatchResult> {
    const accepted: ArtDirectorAcceptedSprite[] = [];
    const rejected: ArtDirectorRejectedSprite[] = [];

    for (const sprite of request.sprites) {
      const atlasKey = spriteAtlasKey(
        request.themeId,
        sprite.entityId,
        request.seed,
      );
      const atlasKeyString = serializeSpriteAtlasKey(atlasKey);
      const cached = this.atlas.get(atlasKey);
      if (cached !== null) {
        accepted.push({
          entityId: sprite.entityId,
          atlasKey,
          manifest: cached.manifest,
          sourceArtifactPath:
            this.sourcePaths.get(atlasKeyString) ?? "atlas-cache",
        });
        continue;
      }

      if (this.mode === "fallback") {
        rejected.push({
          entityId: sprite.entityId,
          fallbackSpriteId: sprite.fallbackSpriteId,
          reason: "ART=fallback",
          sourceArtifactPath: null,
        });
        continue;
      }

      const prompt = buildArtDirectorPrompt({
        themeId: request.themeId,
        entityId: sprite.entityId,
        entityPrompt: sprite.prompt,
        role: sprite.role,
        size: sprite.size,
        paletteHint: sprite.paletteHint,
      });
      const providerResult = await this.provider.generateSprite(prompt, {
        ...(this.timeoutMs === undefined ? {} : { timeoutMs: this.timeoutMs }),
      });
      const result = this.applyProviderResult({
        request,
        sprite,
        prompt,
        providerResult,
      });

      if (result.kind === "accepted") {
        accepted.push(result.accepted);
      } else {
        rejected.push(result.rejected);
      }
    }

    return { accepted, rejected };
  }

  private applyProviderResult({
    request,
    sprite,
    prompt,
    providerResult,
  }: {
    readonly request: ArtDirectorBatchRequest;
    readonly sprite: ArtDirectorSpriteRequest;
    readonly prompt: string;
    readonly providerResult: ArtDirectorProviderResult;
  }):
    | { readonly kind: "accepted"; readonly accepted: ArtDirectorAcceptedSprite }
    | { readonly kind: "rejected"; readonly rejected: ArtDirectorRejectedSprite } {
    const atlasKey = spriteAtlasKey(
      request.themeId,
      sprite.entityId,
      request.seed,
    );

    if (!providerResult.ok) {
      const write = this.tryWriteAttempt({
        request,
        sprite,
        prompt,
        providerResult,
        gauntlet: null,
        reason: providerResult.error.message,
      });
      return {
        kind: "rejected",
        rejected: {
          entityId: sprite.entityId,
          fallbackSpriteId: sprite.fallbackSpriteId,
          reason: write.ok
            ? providerResult.error.message
            : `${providerResult.error.message}; artifact write failed: ${write.reason}`,
          sourceArtifactPath: write.ok ? write.path : null,
        },
      };
    }

    const gauntlet = runArtGauntlet(providerResult.manifest, {
      role: sprite.role,
    });
    if (!gauntlet.ok) {
      const write = this.tryWriteAttempt({
        request,
        sprite,
        prompt,
        providerResult,
        gauntlet,
        reason: gauntlet.reason,
      });
      return {
        kind: "rejected",
        rejected: {
          entityId: sprite.entityId,
          fallbackSpriteId: sprite.fallbackSpriteId,
          reason: write.ok
            ? gauntlet.reason
            : `${gauntlet.reason}; artifact write failed: ${write.reason}`,
          sourceArtifactPath: write.ok ? write.path : null,
        },
      };
    }

    const write = this.tryWriteAttempt({
      request,
      sprite,
      prompt,
      providerResult,
      gauntlet,
      reason: null,
    });
    if (!write.ok) {
      return {
        kind: "rejected",
        rejected: {
          entityId: sprite.entityId,
          fallbackSpriteId: sprite.fallbackSpriteId,
          reason: `artifact write failed: ${write.reason}`,
          sourceArtifactPath: null,
        },
      };
    }

    const entry = this.atlas.getOrSet(atlasKey, gauntlet.manifest);
    this.sourcePaths.set(entry.keyString, write.path);

    return {
      kind: "accepted",
      accepted: {
        entityId: sprite.entityId,
        atlasKey,
        manifest: entry.manifest,
        sourceArtifactPath: write.path,
      },
    };
  }

  private tryWriteAttempt(
    input: Parameters<AmbientArtDirector["writeAttempt"]>[0],
  ): { readonly ok: true; readonly path: string } | { readonly ok: false; readonly reason: string } {
    try {
      return { ok: true, path: this.writeAttempt(input) };
    } catch (error) {
      return { ok: false, reason: errorMessage(error) };
    }
  }

  private writeAttempt({
    request,
    sprite,
    prompt,
    providerResult,
    gauntlet,
    reason,
  }: {
    readonly request: ArtDirectorBatchRequest;
    readonly sprite: ArtDirectorSpriteRequest;
    readonly prompt: string;
    readonly providerResult: ArtDirectorProviderResult;
    readonly gauntlet: ReturnType<typeof runArtGauntlet> | null;
    readonly reason: string | null;
  }): string {
    const atlasKey = spriteAtlasKey(
      request.themeId,
      sprite.entityId,
      request.seed,
    );
    return writeArtDirectorAttemptArtifact(
      {
        themeId: request.themeId,
        entityId: sprite.entityId,
        seed: request.seed,
        prompt,
        providerResult,
        gauntlet,
        atlasKey,
        fallbackSpriteId: sprite.fallbackSpriteId,
        outcome:
          reason === null
            ? {
                kind: "accepted",
                atlasKey: serializeSpriteAtlasKey(atlasKey),
              }
            : {
                kind: "rejected",
                fallbackSpriteId: sprite.fallbackSpriteId,
                reason,
              },
        createdAt: this.now(),
      },
      {
        ...this.artifacts,
        runId: this.artifacts?.runId ?? `art-${request.seed}`,
      },
    );
  }
}

export const createAmbientArtDirector = (
  options: AmbientArtDirectorOptions = {},
): AmbientArtDirector => new AmbientArtDirector(options);

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const artDirectorModeFromEnv = (): ArtDirectorMode => {
  const artMode = (
    globalThis as {
      readonly process?: { readonly env?: { readonly ART?: string } };
    }
  ).process?.env?.ART;

  return artMode === "fallback" ? "fallback" : "generate";
};
