import {
  MAX_PALETTE_COLORS,
  MIN_FILLED_RATIO,
  formatSpriteValidationErrors,
  rasterizeSpriteManifest,
  spriteManifestStats,
  validateSpriteManifest,
  type SpriteManifest,
} from "../art/sprite-manifest.js";
import type {
  ArtGauntletReport,
  ArtGauntletStage,
  ArtGauntletStageReport,
} from "./types.js";

const NORMAL_PALETTE_MAX = 6;
const SIGNATURE_PALETTE_MAX = 8;

export type RunArtGauntletOptions = {
  readonly role?: string;
  readonly scale?: number;
};

export const runArtGauntlet = (
  candidate: unknown,
  options: RunArtGauntletOptions = {},
): ArtGauntletReport => {
  const stages: ArtGauntletStageReport[] = [];
  const validated = validateSpriteManifest(candidate);

  if (!validated.ok) {
    return reject("schema", formatSpriteValidationErrors(validated.errors), [
      ...stages,
      {
        stage: "schema",
        ok: false,
        details: validated.errors.map(
          (error) => `${error.path}: ${error.message}`,
        ),
      },
    ]);
  }

  const manifest = validated.manifest;
  stages.push({ stage: "schema", ok: true, details: [] });

  const palette = checkPaletteBudget(manifest, options.role);
  stages.push(palette);
  if (!palette.ok) {
    return reject("palette", palette.details.join("; "), stages);
  }

  try {
    rasterizeSpriteManifest(manifest, { scale: options.scale ?? 1 });
    stages.push({ stage: "render", ok: true, details: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stages.push({ stage: "render", ok: false, details: [message] });
    return reject("render", message, stages);
  }

  const readability = checkReadability(manifest);
  stages.push(readability);
  if (!readability.ok) {
    return reject("readability", readability.details.join("; "), stages);
  }

  return { ok: true, manifest, stages };
};

const checkPaletteBudget = (
  manifest: SpriteManifest,
  role: string | undefined,
): ArtGauntletStageReport => {
  const max =
    role === "signature" || role === "boss"
      ? SIGNATURE_PALETTE_MAX
      : NORMAL_PALETTE_MAX;

  if (manifest.palette.length > MAX_PALETTE_COLORS) {
    return {
      stage: "palette",
      ok: false,
      details: [`palette exceeds hard max ${MAX_PALETTE_COLORS}`],
    };
  }

  if (manifest.palette.length > max) {
    return {
      stage: "palette",
      ok: false,
      details: [
        `palette has ${manifest.palette.length} colors; ${role ?? "normal"} max is ${max}`,
      ],
    };
  }

  return { stage: "palette", ok: true, details: [] };
};

const checkReadability = (
  manifest: SpriteManifest,
): ArtGauntletStageReport => {
  const stats = spriteManifestStats(manifest);
  const details: string[] = [];

  if (stats.filledRatio < MIN_FILLED_RATIO) {
    details.push(
      `filled ratio ${stats.filledRatio.toFixed(3)} below ${MIN_FILLED_RATIO}`,
    );
  }

  if (stats.occupiedRows < 3) {
    details.push(`occupied rows ${stats.occupiedRows} below 3`);
  }

  if (stats.occupiedColumns < 3) {
    details.push(`occupied columns ${stats.occupiedColumns} below 3`);
  }

  if (stats.visibleColorCount < 2) {
    details.push(`visible colors ${stats.visibleColorCount} below 2`);
  }

  return {
    stage: "readability",
    ok: details.length === 0,
    details,
  };
};

const reject = (
  rejectedAt: ArtGauntletStage,
  reason: string,
  stages: readonly ArtGauntletStageReport[],
): ArtGauntletReport => ({
  ok: false,
  rejectedAt,
  reason,
  stages,
});
