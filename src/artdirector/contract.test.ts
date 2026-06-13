import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { runArtGauntlet } from "./gauntlet.js";
import { parseArtDirectorSpriteManifest } from "./parse.js";

const liveSlugPath = new URL(
  "../../runs/spikes/phase62/ai-live-slug.sprite.json",
  import.meta.url,
);

describe("ArtDirector live-output contract", () => {
  it("accepts the captured live cave slug through parser and Art Gauntlet", () => {
    const raw = readFileSync(liveSlugPath, "utf8");
    const parsed = parseArtDirectorSpriteManifest(raw);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }

    const report = runArtGauntlet(parsed.manifest, { role: "enemy" });

    expect(report.ok).toBe(true);
    if (!report.ok) {
      throw new Error(report.reason);
    }

    expect(report.stages.map((stage) => `${stage.stage}:${stage.ok}`)).toEqual([
      "schema:true",
      "palette:true",
      "render:true",
      "readability:true",
    ]);
  });

  it("extracts JSON from wrapper text and rejects malformed adversarial output", () => {
    const wrapped = [
      "Here is the manifest:",
      "```json",
      readFileSync(liveSlugPath, "utf8"),
      "```",
    ].join("\n");

    expect(parseArtDirectorSpriteManifest(wrapped).ok).toBe(true);

    const noJson = parseArtDirectorSpriteManifest("I cannot draw that.");
    expect(noJson.ok).toBe(false);
    if (!noJson.ok) {
      expect(noJson.error.code).toBe("parse_fail");
      expect(noJson.error.message).toBe("no JSON object found");
    }

    const badPalette = parseArtDirectorSpriteManifest(
      JSON.stringify({
        w: 16,
        h: 16,
        palette: ["#FFFFFF", "#000000"],
        px: Array.from({ length: 16 }, (_, y) =>
          Array.from({ length: 16 }, (_, x) =>
            x >= 4 && x <= 11 && y >= 4 && y <= 11 ? 1 : 0,
          ),
        ),
      }),
    );

    expect(badPalette.ok).toBe(false);
    if (!badPalette.ok) {
      expect(badPalette.error.code).toBe("validate_fail");
      expect(badPalette.error.details?.join("\n")).toContain(
        "palette[0]: palette colors must be lowercase #rrggbb strings",
      );
    }
  });

  it("rejects adversarial gauntlet candidates that are structurally valid but off contract", () => {
    const oversizedNormalPalette = {
      w: 16,
      h: 16,
      palette: [
        "#010101",
        "#111111",
        "#222222",
        "#333333",
        "#444444",
        "#555555",
        "#666666",
      ],
      px: Array.from({ length: 16 }, (_, y) =>
        Array.from({ length: 16 }, (_, x) =>
          x >= 4 && x <= 11 && y >= 4 && y <= 11
            ? ((x + y) % 7) + 1
            : 0,
        ),
      ),
    };

    const report = runArtGauntlet(oversizedNormalPalette, { role: "enemy" });

    expect(report.ok).toBe(false);
    if (!report.ok) {
      expect(report.rejectedAt).toBe("palette");
      expect(report.reason).toContain("enemy max is 6");
    }
  });
});
