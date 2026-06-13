import { deflateSync } from "node:zlib";

export const SPRITE_MANIFEST_VERSION = "everdeep.sprite-manifest.v1";
export const ALLOWED_SIZES = [16, 24];
export const MAX_PALETTE_COLORS = 15;
export const MIN_FILLED_RATIO = 0.08;

const HEX_RGB = /^#[0-9a-f]{6}$/;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value =
      value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

export const parseSpriteManifestJson = (text) => {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          path: "<json>",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  return validateSpriteManifest(value);
};

export const validateSpriteManifest = (value) => {
  const errors = [];

  if (!isPlainObject(value)) {
    return {
      ok: false,
      errors: [{ path: "<root>", message: "manifest must be an object" }],
    };
  }

  const allowedKeys = new Set(["w", "h", "palette", "px"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push({
        path: key,
        message: "unknown field; v1 sprite manifests are strict",
      });
    }
  }

  const { w, h, palette, px } = value;
  if (!Number.isInteger(w) || !ALLOWED_SIZES.includes(w)) {
    errors.push({
      path: "w",
      message: `w must be one of ${ALLOWED_SIZES.join(", ")}`,
    });
  }
  if (!Number.isInteger(h) || !ALLOWED_SIZES.includes(h)) {
    errors.push({
      path: "h",
      message: `h must be one of ${ALLOWED_SIZES.join(", ")}`,
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
        message: `palette must contain 1-${MAX_PALETTE_COLORS} colors`,
      });
    }

    const seenColors = new Set();
    palette.forEach((color, index) => {
      if (typeof color !== "string" || !HEX_RGB.test(color)) {
        errors.push({
          path: `palette[${index}]`,
          message: "palette colors must be lowercase #rrggbb strings",
        });
        return;
      }
      if (seenColors.has(color)) {
        errors.push({
          path: `palette[${index}]`,
          message: "duplicate palette color",
        });
      }
      seenColors.add(color);
    });
  }

  let filled = 0;
  const usedColors = new Set();
  const occupiedRows = new Set();
  const occupiedColumns = new Set();
  const width = Number.isInteger(w) ? w : null;
  const height = Number.isInteger(h) ? h : null;
  const maxIndex = Array.isArray(palette) ? palette.length : 0;

  if (!Array.isArray(px)) {
    errors.push({ path: "px", message: "px must be a row-major matrix" });
  } else {
    if (height !== null && px.length !== height) {
      errors.push({
        path: "px",
        message: `px must contain exactly ${height} rows`,
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
          message: `row must contain exactly ${width} columns`,
        });
      }

      row.forEach((cell, x) => {
        if (!Number.isInteger(cell)) {
          errors.push({
            path: `px[${y}][${x}]`,
            message: "palette index must be an integer",
          });
          return;
        }
        if (cell < 0 || cell > maxIndex) {
          errors.push({
            path: `px[${y}][${x}]`,
            message: `palette index must be between 0 and ${maxIndex}`,
          });
          return;
        }
        if (cell > 0) {
          filled += 1;
          usedColors.add(cell);
          occupiedRows.add(y);
          occupiedColumns.add(x);
        }
      });
    });
  }

  if (width !== null && height !== null && Array.isArray(px)) {
    const totalPixels = width * height;
    const filledRatio = filled / totalPixels;
    if (filled === 0) {
      errors.push({
        path: "px",
        message: "sprite must contain at least one non-transparent pixel",
      });
    } else if (filledRatio < MIN_FILLED_RATIO) {
      errors.push({
        path: "px",
        message: `sprite must fill at least ${Math.round(
          MIN_FILLED_RATIO * 100,
        )}% of pixels`,
      });
    }
    if (filled > 0 && occupiedRows.size < 3) {
      errors.push({
        path: "px",
        message: "non-transparent pixels must occupy at least 3 rows",
      });
    }
    if (filled > 0 && occupiedColumns.size < 3) {
      errors.push({
        path: "px",
        message: "non-transparent pixels must occupy at least 3 columns",
      });
    }
    if (filled > 0 && usedColors.size < 2) {
      errors.push({
        path: "px",
        message: "sprite must use at least 2 visible palette colors",
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, manifest: value };
};

export const renderSpriteToRgba = (manifest, options = {}) => {
  const scale = options.scale ?? 1;
  if (!Number.isInteger(scale) || scale < 1 || scale > 32) {
    throw new Error("scale must be an integer from 1 to 32");
  }

  const validated = validateSpriteManifest(manifest);
  if (!validated.ok) {
    throw new Error(
      `invalid sprite manifest: ${validated.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join("; ")}`,
    );
  }

  const width = manifest.w * scale;
  const height = manifest.h * scale;
  const rgba = Buffer.alloc(width * height * 4);
  const colors = manifest.palette.map(parseHexRgb);

  for (let sourceY = 0; sourceY < manifest.h; sourceY += 1) {
    for (let sourceX = 0; sourceX < manifest.w; sourceX += 1) {
      const paletteIndex = manifest.px[sourceY][sourceX];
      if (paletteIndex === 0) {
        continue;
      }

      const [red, green, blue] = colors[paletteIndex - 1];
      for (let offsetY = 0; offsetY < scale; offsetY += 1) {
        for (let offsetX = 0; offsetX < scale; offsetX += 1) {
          const targetX = sourceX * scale + offsetX;
          const targetY = sourceY * scale + offsetY;
          const offset = (targetY * width + targetX) * 4;
          rgba[offset] = red;
          rgba[offset + 1] = green;
          rgba[offset + 2] = blue;
          rgba[offset + 3] = 255;
        }
      }
    }
  }

  return { width, height, rgba };
};

export const renderSpriteToPng = (manifest, options = {}) => {
  const { width, height, rgba } = renderSpriteToRgba(manifest, options);
  const scanlineWidth = width * 4 + 1;
  const scanlines = Buffer.alloc(scanlineWidth * height);

  for (let y = 0; y < height; y += 1) {
    const scanlineOffset = y * scanlineWidth;
    scanlines[scanlineOffset] = 0;
    rgba.copy(
      scanlines,
      scanlineOffset + 1,
      y * width * 4,
      (y + 1) * width * 4,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

const isPlainObject = (value) =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const parseHexRgb = (hex) => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const pngChunk = (type, data) => {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);

  return Buffer.concat([length, typeBytes, data, checksum]);
};

const crc32 = (buffer) => {
  let checksum = 0xffffffff;
  for (const byte of buffer) {
    checksum = CRC_TABLE[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
};
