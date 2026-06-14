import { describe, expect, it } from "vitest";

import {
  parseSpriteAtlasKey,
  serializeSpriteAtlasKey,
  SpriteAtlasCache,
} from "../art/atlas.js";
import { createArtDirector } from "../art/art-director.js";
import { MemoryArtifactFs } from "../harness/artifacts/fs.js";
import { AmbientArtDirector } from "./director.js";
import type {
  ArtDirectorProviderResult,
  ArtDirectorSpriteProvider,
} from "./types.js";
import type { SpriteManifest } from "../art/sprite-manifest.js";
import type { ArtDirectorBatchRequest } from "../art/art-director.js";

describe("AmbientArtDirector", () => {
  it("is exported through the phase-65 ArtDirector seam", () => {
    const director = createArtDirector({
      provider: new QueueSpriteProvider([providerSuccess(boxSprite())]),
      mode: "fallback",
    });

    expect(director).toBeInstanceOf(AmbientArtDirector);
  });

  it("passes accepted sprites through the Art Gauntlet into the seeded atlas once", async () => {
    const fs = new MemoryArtifactFs();
    const atlas = new SpriteAtlasCache();
    const provider = new QueueSpriteProvider([providerSuccess(boxSprite())]);
    const director = new AmbientArtDirector({
      provider,
      atlas,
      artifacts: { fs, rootDir: "runs/art-test", runId: "run-art" },
      now: () => "2026-06-14T00:00:00.000Z",
    });

    const first = await director.generateSprites(batchRequest());
    const second = await director.generateSprites(batchRequest());

    expect(provider.calls).toHaveLength(1);
    expect(first.accepted).toHaveLength(1);
    expect(first.rejected).toHaveLength(0);
    expect(second.accepted).toHaveLength(1);
    expect(atlas.size).toBe(1);

    const accepted = first.accepted[0];
    if (accepted === undefined) {
      throw new Error("expected accepted sprite");
    }

    expect(accepted.atlasKey).toEqual({
      themeId: "torchlit-limestone",
      entityId: "enemy.brute",
      seed: "seed-85",
    });
    expect(parseSpriteAtlasKey(serializeSpriteAtlasKey(accepted.atlasKey))).toEqual(
      accepted.atlasKey,
    );
    expect(atlas.get(accepted.atlasKey)?.manifest).toEqual(boxSprite());
    expect(second.accepted[0]?.sourceArtifactPath).toBe(
      accepted.sourceArtifactPath,
    );

    const artifact = JSON.parse(
      fs.readFile(accepted.sourceArtifactPath),
    ) as ArtAttemptRecord;
    expect(artifact.recordType).toBe("artdirector-attempt");
    expect(artifact.outcome.kind).toBe("accepted");
    expect(artifact.gauntlet?.ok).toBe(true);
    expect(artifact.provider.ok).toBe(true);
  });

  it("records rejected attempts and leaves fallback resolution to the existing resolver path", async () => {
    const fs = new MemoryArtifactFs();
    const atlas = new SpriteAtlasCache();
    const provider = new QueueSpriteProvider([
      {
        ok: false,
        error: {
          code: "timeout",
          message: "process timed out after 45000ms; killed=true",
        },
        raw: "",
        usage: { latencyMs: 45_000, tokens: null },
      },
    ]);
    const director = new AmbientArtDirector({
      provider,
      atlas,
      artifacts: { fs, rootDir: "runs/art-test", runId: "run-art" },
      now: () => "2026-06-14T00:00:01.000Z",
    });

    const result = await director.generateSprites(batchRequest());

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toEqual([
      {
        entityId: "enemy.brute",
        fallbackSpriteId: "enemy.brute",
        reason: "process timed out after 45000ms; killed=true",
        sourceArtifactPath:
          "runs/art-test/run-art/torchlit-limestone/enemy.brute/seed-85/attempt-0.json",
      },
    ]);
    expect(atlas.size).toBe(0);

    const rejectedPath = result.rejected[0]?.sourceArtifactPath;
    if (rejectedPath === null || rejectedPath === undefined) {
      throw new Error("expected rejected artifact path");
    }
    const artifact = JSON.parse(fs.readFile(rejectedPath)) as ArtAttemptRecord;
    expect(artifact.outcome.kind).toBe("rejected");
    if (artifact.outcome.kind !== "rejected") {
      throw new Error("expected rejected art artifact");
    }
    expect(artifact.outcome.reason).toContain("timed out");
    expect(artifact.provider.ok).toBe(false);
  });

  it("isolates artifact write failures to the affected sprite", async () => {
    const fs = new FailFirstWriteFs();
    const atlas = new SpriteAtlasCache();
    const provider = new QueueSpriteProvider([
      providerSuccess(boxSprite()),
      providerSuccess(boxSprite()),
    ]);
    const director = new AmbientArtDirector({
      provider,
      atlas,
      artifacts: { fs, rootDir: "runs/art-test", runId: "run-art" },
      now: () => "2026-06-14T00:00:02.000Z",
    });

    const result = await director.generateSprites({
      ...batchRequest(),
      sprites: [
        ...batchRequest().sprites,
        {
          entityId: "enemy.caster",
          role: "enemy",
          size: 16,
          fallbackSpriteId: "enemy.caster",
          prompt: "a candlelit cave caster with a hood",
          paletteHint: ["#151a14", "#89965d", "#c7a55a"],
        },
      ],
    });

    expect(provider.calls).toHaveLength(2);
    expect(result.accepted.map((sprite) => sprite.entityId)).toEqual([
      "enemy.caster",
    ]);
    expect(result.rejected).toEqual([
      {
        entityId: "enemy.brute",
        fallbackSpriteId: "enemy.brute",
        reason: "artifact write failed: simulated artifact write failure",
        sourceArtifactPath: null,
      },
    ]);
    expect(atlas.size).toBe(1);

    const acceptedPath = result.accepted[0]?.sourceArtifactPath;
    if (acceptedPath === undefined) {
      throw new Error("expected second sprite artifact path");
    }
    expect(JSON.parse(fs.readFile(acceptedPath)) as ArtAttemptRecord).toMatchObject({
      entityId: "enemy.caster",
      outcome: { kind: "accepted" },
    });
  });

  it("honors ART=fallback mode without calling the provider", async () => {
    const provider = new QueueSpriteProvider([providerSuccess(boxSprite())]);
    const director = new AmbientArtDirector({
      provider,
      mode: "fallback",
      artifacts: { fs: new MemoryArtifactFs(), rootDir: "runs/art-test" },
    });

    const result = await director.generateSprites(batchRequest());

    expect(provider.calls).toHaveLength(0);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toEqual([
      {
        entityId: "enemy.brute",
        fallbackSpriteId: "enemy.brute",
        reason: "ART=fallback",
        sourceArtifactPath: null,
      },
    ]);
  });
});

class QueueSpriteProvider implements ArtDirectorSpriteProvider {
  readonly #calls: string[] = [];

  get calls(): readonly string[] {
    return this.#calls;
  }

  constructor(private readonly results: readonly ArtDirectorProviderResult[]) {}

  async generateSprite(prompt: string): Promise<ArtDirectorProviderResult> {
    this.#calls.push(prompt);
    const result = this.results[this.#calls.length - 1];
    if (result === undefined) {
      throw new Error("unexpected provider call");
    }

    return result;
  }
}

class FailFirstWriteFs extends MemoryArtifactFs {
  private failed = false;

  override writeNewFile(path: string, contents: string): void {
    if (!this.failed && path.endsWith(".json")) {
      this.failed = true;
      throw new Error("simulated artifact write failure");
    }

    super.writeNewFile(path, contents);
  }
}

type ArtAttemptRecord = {
  readonly recordType: string;
  readonly entityId?: string;
  readonly provider: { readonly ok: boolean };
  readonly gauntlet: { readonly ok: boolean } | null;
  readonly outcome:
    | { readonly kind: "accepted"; readonly atlasKey: string }
    | {
        readonly kind: "rejected";
        readonly fallbackSpriteId: string;
        readonly reason: string;
      };
};

const batchRequest = (): ArtDirectorBatchRequest => ({
  themeId: "torchlit-limestone",
  seed: "seed-85",
  sprites: [
    {
      entityId: "enemy.brute",
      role: "enemy",
      size: 16,
      fallbackSpriteId: "enemy.brute",
      prompt: "a squat cave slug with two eye stalks",
      paletteHint: ["#151a14", "#89965d", "#c7a55a"],
    },
  ],
});

const providerSuccess = (
  manifest: SpriteManifest,
): ArtDirectorProviderResult => ({
  ok: true,
  raw: JSON.stringify(manifest),
  manifest,
  usage: { latencyMs: 12, tokens: null },
});

const boxSprite = (): SpriteManifest => ({
  w: 16,
  h: 16,
  palette: ["#ffffff", "#000000"],
  px: Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) =>
      x >= 4 && x <= 11 && y >= 4 && y <= 11
        ? x === 4 || x === 11 || y === 4 || y === 11
          ? 2
          : 1
        : 0,
    ),
  ),
});
