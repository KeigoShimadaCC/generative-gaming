import { readFileSync, writeFileSync } from "node:fs";

import {
  parseSpriteManifestJson,
  renderSpriteToPng,
} from "./sprite-manifest.js";

const [inputPath, outputPath] = process.argv.slice(2);

if (inputPath === undefined || outputPath === undefined) {
  console.error(
    "usage: node runs/spikes/phase62/render-one.js <sprite.json> <out.png>",
  );
  process.exit(2);
}

const parsed = parseSpriteManifestJson(readFileSync(inputPath, "utf8"));
if (!parsed.ok) {
  console.error(
    parsed.errors
      .map((error) => `${error.path}: ${error.message}`)
      .join("\n"),
  );
  process.exit(1);
}

writeFileSync(outputPath, renderSpriteToPng(parsed.manifest, { scale: 8 }));
console.log(`${inputPath} -> ${outputPath}`);
