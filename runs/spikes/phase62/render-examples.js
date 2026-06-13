import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import {
  parseSpriteManifestJson,
  renderSpriteToPng,
} from "./sprite-manifest.js";

const root = new URL(".", import.meta.url).pathname;
const exampleFiles = [
  "examples/cave-slug.sprite.json",
  "examples/stone-floor.sprite.json",
];

for (const exampleFile of exampleFiles) {
  const sourcePath = join(root, exampleFile);
  const parsed = parseSpriteManifestJson(readFileSync(sourcePath, "utf8"));
  if (!parsed.ok) {
    throw new Error(
      `${exampleFile}: ${parsed.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join("; ")}`,
    );
  }

  const outputName = basename(exampleFile, ".sprite.json");
  const outputPath = join(root, `${outputName}.png`);
  writeFileSync(outputPath, renderSpriteToPng(parsed.manifest, { scale: 8 }));
  console.log(`${exampleFile} -> ${outputPath}`);
}
