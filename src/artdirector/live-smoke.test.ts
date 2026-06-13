import { describe, expect, it } from "vitest";

import { SpriteAtlasCache } from "../art/atlas.js";
import { AmbientArtDirector } from "./director.js";

const liveSmoke =
  (
    globalThis as {
      readonly process?: {
        readonly env?: { readonly ARTDIRECTOR_LIVE?: string };
      };
    }
  ).process?.env?.ARTDIRECTOR_LIVE === "1";

const liveIt = liveSmoke ? it : it.skip;

describe("ArtDirector live smoke", () => {
  liveIt(
    "@artdirector-live generates a fresh themed sprite into the atlas",
    async () => {
      const atlas = new SpriteAtlasCache();
      const director = new AmbientArtDirector({
        atlas,
        mode: "generate",
        timeoutMs: 60_000,
        artifacts: {
          rootDir: "runs/artdirector-live-smoke",
          runId: "artdirector-live-smoke",
        },
      });

      const result = await director.generateSprites({
        themeId: "ferrous-fungal-middle",
        seed: "artdirector-live-smoke-seed",
        sprites: [
          {
            entityId: "enemy.caster",
            role: "enemy",
            size: 16,
            fallbackSpriteId: "enemy.caster",
            prompt:
              "a hunched fungal iron cave caster with a bright spore lantern",
            paletteHint: ["#101417", "#2f4d4d", "#7b4f8f", "#d0a04a"],
          },
        ],
      });

      expect(result.rejected).toEqual([]);
      expect(result.accepted).toHaveLength(1);

      const accepted = result.accepted[0];
      if (accepted === undefined) {
        throw new Error("expected accepted ArtDirector sprite");
      }

      const entry = atlas.get(accepted.atlasKey);
      expect(entry).not.toBeNull();
      expect(entry?.raster.width).toBe(16);
      expect(entry?.raster.height).toBe(16);
      expect(entry?.raster.pixels.length).toBe(16 * 16 * 4);
      expect(accepted.sourceArtifactPath).toContain(
        "runs/artdirector-live-smoke",
      );
    },
    70_000,
  );
});
