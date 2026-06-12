import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const WORLD_HARD_CANON_HEADING = "## 10. Hard Canon";

export const extractWorldHardCanonSection = (worldMd: string): string => {
  const start = worldMd.indexOf(WORLD_HARD_CANON_HEADING);
  if (start === -1) {
    throw new Error("WORLD.md is missing the Hard Canon section");
  }

  return worldMd.slice(start).trimEnd();
};

export const fingerprintText = (text: string): string => {
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
};

export const readRepoWorldHardCanonSection = (): string => {
  const worldPath = fileURLToPath(new URL("../../../WORLD.md", import.meta.url));
  return extractWorldHardCanonSection(readFileSync(worldPath, "utf8"));
};
