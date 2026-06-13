import {
  nodeArtifactFsAdapter,
  trimTrailingSlash,
  type ArtifactFsAdapter,
} from "../harness/artifacts/fs.js";
import { hashPrompt } from "../harness/artifacts/hash.js";
import { serializeSpriteAtlasKey, type SpriteAtlasKey } from "../art/atlas.js";
import type { FallbackSpriteId } from "../art/fallback.js";
import type {
  ArtDirectorProviderResult,
  ArtGauntletReport,
} from "./types.js";

export type ArtDirectorArtifactOptions = {
  readonly rootDir?: string;
  readonly fs?: ArtifactFsAdapter;
  readonly runId?: string;
};

export type ArtDirectorAttemptOutcome =
  | {
      readonly kind: "accepted";
      readonly atlasKey: string;
    }
  | {
      readonly kind: "rejected";
      readonly fallbackSpriteId: FallbackSpriteId;
      readonly reason: string;
    };

export type WriteArtDirectorAttemptInput = {
  readonly themeId: string;
  readonly entityId: string;
  readonly seed: string;
  readonly prompt: string;
  readonly providerResult: ArtDirectorProviderResult;
  readonly gauntlet: ArtGauntletReport | null;
  readonly atlasKey: SpriteAtlasKey;
  readonly fallbackSpriteId: FallbackSpriteId;
  readonly outcome: ArtDirectorAttemptOutcome;
  readonly createdAt: string;
};

export const writeArtDirectorAttemptArtifact = (
  input: WriteArtDirectorAttemptInput,
  options: ArtDirectorArtifactOptions = {},
): string => {
  const rootDir = trimTrailingSlash(options.rootDir ?? "runs/artdirector");
  const fs = options.fs ?? nodeArtifactFsAdapter;
  const runId = safePathPart(options.runId ?? `art-${input.seed}`);
  const dir = `${rootDir}/${runId}/${safePathPart(input.themeId)}/${safePathPart(
    input.entityId,
  )}/${safePathPart(input.seed)}`;
  fs.makeDir(dir);

  const path = nextAttemptPath(fs, dir);
  const record = {
    recordType: "artdirector-attempt",
    version: "everdeep.artdirector-attempt.v1",
    themeId: input.themeId,
    entityId: input.entityId,
    seed: input.seed,
    promptHash: hashPrompt(input.prompt),
    prompt: input.prompt,
    atlasKey: serializeSpriteAtlasKey(input.atlasKey),
    fallbackSpriteId: input.fallbackSpriteId,
    provider: providerSnapshot(input.providerResult),
    gauntlet: input.gauntlet,
    outcome: input.outcome,
    createdAt: input.createdAt,
  };

  fs.writeNewFile(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
};

const providerSnapshot = (result: ArtDirectorProviderResult) => {
  if (result.ok) {
    return {
      ok: true,
      usage: result.usage,
      raw: result.raw,
      manifest: result.manifest,
    };
  }

  return {
    ok: false,
    usage: result.usage,
    raw: result.raw ?? "",
    error: result.error,
  };
};

const nextAttemptPath = (fs: ArtifactFsAdapter, dir: string): string => {
  let attemptIndex = 0;
  while (fs.fileExists(`${dir}/attempt-${attemptIndex}.json`)) {
    attemptIndex += 1;
  }

  return `${dir}/attempt-${attemptIndex}.json`;
};

const safePathPart = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
