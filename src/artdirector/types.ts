import type { SpriteManifest, SpriteSize } from "../art/sprite-manifest.js";
import type { HexColor } from "../art/sprite-manifest.js";

export type ArtDirectorFailureCode =
  | "timeout"
  | "process_error"
  | "parse_fail"
  | "validate_fail";

export type ArtDirectorProviderUsage = {
  readonly latencyMs: number;
  readonly tokens?: null;
};

export type ArtDirectorProviderError = {
  readonly code: ArtDirectorFailureCode;
  readonly message: string;
  readonly details?: readonly string[];
};

export type ArtDirectorProviderSuccess = {
  readonly ok: true;
  readonly raw: string;
  readonly manifest: SpriteManifest;
  readonly usage: ArtDirectorProviderUsage;
};

export type ArtDirectorProviderFailure = {
  readonly ok: false;
  readonly error: ArtDirectorProviderError;
  readonly raw?: string;
  readonly usage: ArtDirectorProviderUsage;
};

export type ArtDirectorProviderResult =
  | ArtDirectorProviderSuccess
  | ArtDirectorProviderFailure;

export type ArtDirectorGenerateOptions = {
  readonly timeoutMs?: number;
};

export interface ArtDirectorSpriteProvider {
  generateSprite(
    prompt: string,
    options?: ArtDirectorGenerateOptions,
  ): Promise<ArtDirectorProviderResult>;
}

export type ArtDirectorPromptInput = {
  readonly themeId: string;
  readonly entityId: string;
  readonly entityPrompt: string;
  readonly role: string;
  readonly size: SpriteSize;
  readonly paletteHint: readonly HexColor[];
};

export type ArtGauntletStage =
  | "schema"
  | "palette"
  | "render"
  | "readability";

export type ArtGauntletStageReport = {
  readonly stage: ArtGauntletStage;
  readonly ok: boolean;
  readonly details: readonly string[];
};

export type ArtGauntletReport =
  | {
      readonly ok: true;
      readonly manifest: SpriteManifest;
      readonly stages: readonly ArtGauntletStageReport[];
    }
  | {
      readonly ok: false;
      readonly rejectedAt: ArtGauntletStage;
      readonly reason: string;
      readonly stages: readonly ArtGauntletStageReport[];
    };

export const artProviderFailure = (
  code: ArtDirectorFailureCode,
  message: string,
  usage: ArtDirectorProviderUsage,
  raw?: string,
  details?: readonly string[],
): ArtDirectorProviderFailure => ({
  ok: false,
  error: {
    code,
    message,
    ...(details === undefined ? {} : { details }),
  },
  ...(raw === undefined ? {} : { raw }),
  usage,
});
