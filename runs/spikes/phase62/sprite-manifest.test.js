import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MIN_FILLED_RATIO,
  parseSpriteManifestJson,
  renderSpriteToPng,
  validateSpriteManifest,
} from "./sprite-manifest.js";

const root = new URL(".", import.meta.url).pathname;
const exampleFiles = [
  "examples/cave-slug.sprite.json",
  "examples/stone-floor.sprite.json",
];

const loadExample = (exampleFile) => {
  const parsed = parseSpriteManifestJson(
    readFileSync(join(root, exampleFile), "utf8"),
  );
  if (!parsed.ok) {
    throw new Error(JSON.stringify(parsed.errors, null, 2));
  }
  return parsed.manifest;
};

describe("phase62 sprite manifest contract", () => {
  it.each(exampleFiles)("validates and renders %s", (exampleFile) => {
    const manifest = loadExample(exampleFile);
    const totalPixels = manifest.w * manifest.h;
    const filledPixels = manifest.px
      .flat()
      .filter((paletteIndex) => paletteIndex > 0).length;

    expect(filledPixels / totalPixels).toBeGreaterThanOrEqual(
      MIN_FILLED_RATIO,
    );

    const png = renderSpriteToPng(manifest, { scale: 8 });
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.length).toBeGreaterThan(100);
  });

  it("rejects malformed or unreadable manifests", () => {
    expect(validateSpriteManifest({ w: 16, h: 16, palette: [], px: [] }).ok)
      .toBe(false);
    expect(
      validateSpriteManifest({
        w: 16,
        h: 16,
        palette: ["#ffffff", "#000000"],
        px: Array.from({ length: 16 }, () => Array(16).fill(0)),
      }).ok,
    ).toBe(false);
    expect(
      validateSpriteManifest({
        w: 16,
        h: 16,
        palette: ["#ffffff", "#000000"],
        px: Array.from({ length: 16 }, (_, y) =>
          Array.from({ length: 16 }, (_, x) => (x === y ? 9 : 0)),
        ),
      }).ok,
    ).toBe(false);
  });
});
