import type { MapDepthBand } from "../map/index.js";

export const LAYOUT_FLAVORS = [
  "open",
  "warren",
  "halls",
  "ring",
  "sanctum",
] as const;

export type LayoutFlavor = (typeof LAYOUT_FLAVORS)[number];

export type RoomCountRange = {
  readonly min: number;
  readonly max: number;
};

export type PlacementMode = "scatter" | "ring" | "sanctum";

export type CorridorStyle = "direct" | "twisty" | "long";

export type FlavorProfile = {
  readonly placementMode: PlacementMode;
  readonly corridorStyle: CorridorStyle;
  readonly roomWidthMin: number;
  readonly roomWidthMax: number;
  readonly roomHeightMin: number;
  readonly roomHeightMax: number;
  readonly roomPadding: number;
  readonly roomCountBias: "low" | "mid" | "high";
  readonly doorChancePercent: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const scaleByGrid = (
  gridWidth: number,
  gridHeight: number,
  widthFactor: number,
  heightFactor: number,
): { width: number; height: number } => {
  const maxW = clamp(Math.floor(gridWidth * widthFactor), 3, gridWidth - 4);
  const maxH = clamp(Math.floor(gridHeight * heightFactor), 3, gridHeight - 4);

  return { width: maxW, height: maxH };
};

export const flavorProfile = (
  flavor: LayoutFlavor,
  gridWidth: number,
  gridHeight: number,
): FlavorProfile => {
  const shortSide = Math.min(gridWidth, gridHeight);

  switch (flavor) {
    case "open": {
      const cap = scaleByGrid(gridWidth, gridHeight, 0.34, 0.3);
      return {
        placementMode: "scatter",
        corridorStyle: "direct",
        roomWidthMin: clamp(Math.floor(shortSide * 0.16), 5, cap.width),
        roomWidthMax: cap.width,
        roomHeightMin: clamp(Math.floor(shortSide * 0.14), 4, cap.height),
        roomHeightMax: cap.height,
        roomPadding: 2,
        roomCountBias: "low",
        doorChancePercent: 25,
      };
    }
    case "warren": {
      const cap = scaleByGrid(gridWidth, gridHeight, 0.18, 0.16);
      return {
        placementMode: "scatter",
        corridorStyle: "twisty",
        roomWidthMin: 3,
        roomWidthMax: clamp(cap.width, 4, 6),
        roomHeightMin: 3,
        roomHeightMax: clamp(cap.height, 4, 6),
        roomPadding: 1,
        roomCountBias: "high",
        doorChancePercent: 55,
      };
    }
    case "halls": {
      const cap = scaleByGrid(gridWidth, gridHeight, 0.24, 0.2);
      return {
        placementMode: "scatter",
        corridorStyle: "long",
        roomWidthMin: clamp(Math.floor(shortSide * 0.14), 4, cap.width),
        roomWidthMax: cap.width,
        roomHeightMin: clamp(Math.floor(shortSide * 0.12), 4, cap.height),
        roomHeightMax: cap.height,
        roomPadding: 2,
        roomCountBias: "mid",
        doorChancePercent: 35,
      };
    }
    case "ring": {
      const cap = scaleByGrid(gridWidth, gridHeight, 0.2, 0.18);
      return {
        placementMode: "ring",
        corridorStyle: "direct",
        roomWidthMin: clamp(Math.floor(shortSide * 0.12), 4, cap.width),
        roomWidthMax: cap.width,
        roomHeightMin: clamp(Math.floor(shortSide * 0.1), 4, cap.height),
        roomHeightMax: cap.height,
        roomPadding: 2,
        roomCountBias: "mid",
        doorChancePercent: 40,
      };
    }
    case "sanctum": {
      const cap = scaleByGrid(gridWidth, gridHeight, 0.16, 0.14);
      return {
        placementMode: "sanctum",
        corridorStyle: "direct",
        roomWidthMin: 3,
        roomWidthMax: clamp(cap.width, 4, 6),
        roomHeightMin: 3,
        roomHeightMax: clamp(cap.height, 4, 6),
        roomPadding: 1,
        roomCountBias: "low",
        doorChancePercent: 30,
      };
    }
  }
};

export type FloorBandOrSize = MapDepthBand | { readonly width: number; readonly height: number };

export type FloorParams = {
  readonly bandOrSize: FloorBandOrSize;
  readonly roomCountRange: RoomCountRange;
  readonly flavor: LayoutFlavor;
  readonly seed: string;
};

export const resolveRoomCount = (
  range: RoomCountRange,
  bias: FlavorProfile["roomCountBias"],
  roll: number,
): number => {
  const span = range.max - range.min;
  if (span <= 0) {
    return range.min;
  }

  const biasedRoll =
    bias === "low"
      ? Math.floor(roll * 0.45 * (span + 1))
      : bias === "high"
        ? Math.floor((0.55 + roll * 0.45) * (span + 1))
        : Math.floor((0.25 + roll * 0.5) * (span + 1));

  return clamp(range.min + biasedRoll, range.min, range.max);
};
