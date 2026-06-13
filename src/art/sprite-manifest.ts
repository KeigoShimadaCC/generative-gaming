export const SPRITE_MANIFEST_VERSION = "everdeep.sprite-manifest.v1";

export const ALLOWED_SPRITE_SIZES = [16, 24] as const;
export const MAX_PALETTE_COLORS = 15;
export const MIN_FILLED_RATIO = 0.08;

export type SpriteSize = (typeof ALLOWED_SPRITE_SIZES)[number];
export type HexColor = `#${string}`;

export type SpriteManifest = {
  readonly w: SpriteSize;
  readonly h: SpriteSize;
  readonly palette: readonly HexColor[];
  readonly px: readonly (readonly number[])[];
};

export type SpriteValidationError = {
  readonly path: string;
  readonly message: string;
};

export type SpriteValidationResult =
  | {
      readonly ok: true;
      readonly manifest: SpriteManifest;
    }
  | {
      readonly ok: false;
      readonly errors: readonly SpriteValidationError[];
    };

export type RasterizedSprite = {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly pixels: Uint8ClampedArray;
};

export type SpriteManifestStats = {
  readonly totalPixels: number;
  readonly filledPixels: number;
  readonly filledRatio: number;
  readonly visibleColorCount: number;
  readonly occupiedRows: number;
  readonly occupiedColumns: number;
};

const HEX_RGB = /^#[0-9a-f]{6}$/;

export const parseSpriteManifestJson = (
  text: string
): SpriteValidationResult => {
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          path: "<json>",
          message: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }

  return validateSpriteManifest(value);
};

export const validateSpriteManifest = (
  value: unknown
): SpriteValidationResult => {
  const errors: SpriteValidationError[] = [];

  if (!isPlainObject(value)) {
    return {
      ok: false,
      errors: [{ path: "<root>", message: "manifest must be an object" }]
    };
  }

  const allowedKeys = new Set(["w", "h", "palette", "px"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push({
        path: key,
        message: "unknown field; v1 sprite manifests are strict"
      });
    }
  }

  const w = value.w;
  const h = value.h;
  const palette = value.palette;
  const px = value.px;

  if (!Number.isInteger(w) || !isAllowedSize(w)) {
    errors.push({
      path: "w",
      message: `w must be one of ${ALLOWED_SPRITE_SIZES.join(", ")}`
    });
  }

  if (!Number.isInteger(h) || !isAllowedSize(h)) {
    errors.push({
      path: "h",
      message: `h must be one of ${ALLOWED_SPRITE_SIZES.join(", ")}`
    });
  }

  if (Number.isInteger(w) && Number.isInteger(h) && w !== h) {
    errors.push({ path: "h", message: "w and h must match" });
  }

  if (!Array.isArray(palette)) {
    errors.push({ path: "palette", message: "palette must be an array" });
  } else {
    if (palette.length < 1 || palette.length > MAX_PALETTE_COLORS) {
      errors.push({
        path: "palette",
        message: `palette must contain 1-${MAX_PALETTE_COLORS} colors`
      });
    }

    const seenColors = new Set<string>();
    palette.forEach((color, index) => {
      if (typeof color !== "string" || !HEX_RGB.test(color)) {
        errors.push({
          path: `palette[${index}]`,
          message: "palette colors must be lowercase #rrggbb strings"
        });
        return;
      }

      if (seenColors.has(color)) {
        errors.push({
          path: `palette[${index}]`,
          message: "duplicate palette color"
        });
      }

      seenColors.add(color);
    });
  }

  const width = isAllowedSize(w) ? w : null;
  const height = isAllowedSize(h) ? h : null;
  const maxIndex = Array.isArray(palette) ? palette.length : 0;

  if (!Array.isArray(px)) {
    errors.push({ path: "px", message: "px must be a row-major matrix" });
  } else {
    if (height !== null && px.length !== height) {
      errors.push({
        path: "px",
        message: `px must contain exactly ${height} rows`
      });
    }

    px.forEach((row, y) => {
      if (!Array.isArray(row)) {
        errors.push({ path: `px[${y}]`, message: "row must be an array" });
        return;
      }

      if (width !== null && row.length !== width) {
        errors.push({
          path: `px[${y}]`,
          message: `row must contain exactly ${width} columns`
        });
      }

      row.forEach((cell, x) => {
        if (!Number.isInteger(cell)) {
          errors.push({
            path: `px[${y}][${x}]`,
            message: "palette index must be an integer"
          });
          return;
        }

        if (cell < 0 || cell > maxIndex) {
          errors.push({
            path: `px[${y}][${x}]`,
            message: `palette index must be between 0 and ${maxIndex}`
          });
        }
      });
    });
  }

  if (width !== null && height !== null && Array.isArray(px)) {
    const stats = spriteManifestStatsForShape(width, height, px);

    if (stats.filledPixels === 0) {
      errors.push({
        path: "px",
        message: "sprite must contain at least one non-transparent pixel"
      });
    } else if (stats.filledRatio < MIN_FILLED_RATIO) {
      errors.push({
        path: "px",
        message: `sprite must fill at least ${Math.round(
          MIN_FILLED_RATIO * 100
        )}% of pixels`
      });
    }

    if (stats.filledPixels > 0 && stats.occupiedRows < 3) {
      errors.push({
        path: "px",
        message: "non-transparent pixels must occupy at least 3 rows"
      });
    }

    if (stats.filledPixels > 0 && stats.occupiedColumns < 3) {
      errors.push({
        path: "px",
        message: "non-transparent pixels must occupy at least 3 columns"
      });
    }

    if (stats.filledPixels > 0 && stats.visibleColorCount < 2) {
      errors.push({
        path: "px",
        message: "sprite must use at least 2 visible palette colors"
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, manifest: value as SpriteManifest };
};

export const formatSpriteValidationErrors = (
  errors: readonly SpriteValidationError[]
): string =>
  errors.map((error) => `${error.path}: ${error.message}`).join("; ");

export const spriteManifestStats = (
  manifest: SpriteManifest
): SpriteManifestStats =>
  spriteManifestStatsForShape(manifest.w, manifest.h, manifest.px);

export const rasterizeSpriteManifest = (
  manifest: SpriteManifest,
  options: { readonly scale?: number } = {}
): RasterizedSprite => {
  const scale = options.scale ?? 1;

  if (!Number.isInteger(scale) || scale < 1 || scale > 32) {
    throw new Error("scale must be an integer from 1 to 32");
  }

  const validated = validateSpriteManifest(manifest);
  if (!validated.ok) {
    throw new Error(
      `invalid sprite manifest: ${formatSpriteValidationErrors(
        validated.errors
      )}`
    );
  }

  const width = manifest.w * scale;
  const height = manifest.h * scale;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const colors = manifest.palette.map(parseHexRgb);

  for (let sourceY = 0; sourceY < manifest.h; sourceY += 1) {
    const row = manifest.px[sourceY];
    if (row === undefined) {
      throw new Error(`missing sprite row ${sourceY}`);
    }

    for (let sourceX = 0; sourceX < manifest.w; sourceX += 1) {
      const paletteIndex = row[sourceX] ?? 0;
      if (paletteIndex === 0) {
        continue;
      }

      const color = colors[paletteIndex - 1];
      if (color === undefined) {
        throw new Error(`missing palette color ${paletteIndex}`);
      }

      for (let offsetY = 0; offsetY < scale; offsetY += 1) {
        for (let offsetX = 0; offsetX < scale; offsetX += 1) {
          const targetX = sourceX * scale + offsetX;
          const targetY = sourceY * scale + offsetY;
          const targetOffset = (targetY * width + targetX) * 4;
          pixels[targetOffset] = color.red;
          pixels[targetOffset + 1] = color.green;
          pixels[targetOffset + 2] = color.blue;
          pixels[targetOffset + 3] = 255;
        }
      }
    }
  }

  return { width, height, scale, pixels };
};

const isAllowedSize = (value: unknown): value is SpriteSize =>
  value === 16 || value === 24;

const isPlainObject = (
  value: unknown
): value is { readonly [key: string]: unknown } =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const spriteManifestStatsForShape = (
  width: number,
  height: number,
  px: readonly unknown[]
): SpriteManifestStats => {
  let filledPixels = 0;
  const visibleColors = new Set<number>();
  const occupiedRows = new Set<number>();
  const occupiedColumns = new Set<number>();

  px.forEach((row, y) => {
    if (!Array.isArray(row)) {
      return;
    }

    row.forEach((cell, x) => {
      if (Number.isInteger(cell) && cell > 0) {
        filledPixels += 1;
        visibleColors.add(cell);
        occupiedRows.add(y);
        occupiedColumns.add(x);
      }
    });
  });

  const totalPixels = width * height;

  return {
    totalPixels,
    filledPixels,
    filledRatio: filledPixels / totalPixels,
    visibleColorCount: visibleColors.size,
    occupiedRows: occupiedRows.size,
    occupiedColumns: occupiedColumns.size
  };
};

const parseHexRgb = (
  hex: HexColor
): { readonly red: number; readonly green: number; readonly blue: number } => ({
  red: Number.parseInt(hex.slice(1, 3), 16),
  green: Number.parseInt(hex.slice(3, 5), 16),
  blue: Number.parseInt(hex.slice(5, 7), 16)
});
