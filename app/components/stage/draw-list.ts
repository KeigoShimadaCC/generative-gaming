import type { GameState } from "@engine/state";

import type {
  GridCellView,
  GridViewModel,
} from "@/components/grid/model";

// eslint-disable-next-line no-restricted-imports -- Phase 66-71 brief requires the stage seam to consume the phase-65 art atlas.
import {
  FALLBACK_THEME_ID,
  spriteAtlasKey,
  serializeSpriteAtlasKey,
  type SpriteAtlasKey,
} from "../../../src/art/atlas.js";
// eslint-disable-next-line no-restricted-imports -- Phase 66-71 brief requires sprite ids from the phase-65 fallback art set.
import type { FallbackSpriteId } from "../../../src/art/fallback.js";
// eslint-disable-next-line no-restricted-imports -- Phase 66-71 brief requires the stage draw-list to resolve sprites through src/art.
import {
  resolveSpriteForCell,
  resolveTerrainSpriteId,
} from "../../../src/art/resolver.js";

import {
  DEFAULT_STAGE_VIEWPORT_HEIGHT,
  DEFAULT_STAGE_VIEWPORT_WIDTH,
  resolveStageCamera,
  type StageCameraState,
} from "./camera";
import {
  createFogDraws,
  fogPaintForCell,
  multiplyTint,
  type StageFogDraw,
} from "./fog";
import {
  boundsForCell,
  wallPresentationForCell,
  type StageGridMetrics,
  type StageTileOverlayDraw,
} from "./tilemap";

export type StageSpriteLayer = "terrain" | "entity";

export type StageSpriteDraw = {
  readonly key: string;
  readonly cellKey: string;
  readonly layer: StageSpriteLayer;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly atlasKey: SpriteAtlasKey;
  readonly atlasKeyString: string;
  readonly spriteId: FallbackSpriteId;
  readonly reason: string;
  readonly alpha: number;
  readonly tint: number;
  readonly wallMask: number | null;
};

export type StageGlowDraw = {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly fillColor: number;
  readonly alpha: number;
};

export type StageSignatureHook = {
  readonly key: string;
  readonly cellKey: string;
  readonly featureId: string;
  readonly featureKind: string;
  readonly phase: "phase87-signature-invention";
};

export type StageDrawList = {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly gap: number;
  readonly padding: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly camera: StageCameraState;
  readonly sprites: readonly StageSpriteDraw[];
  readonly tileOverlays: readonly StageTileOverlayDraw[];
  readonly glows: readonly StageGlowDraw[];
  readonly fog: readonly StageFogDraw[];
  readonly signatureHooks: readonly StageSignatureHook[];
};

const DEFAULT_CELL_SIZE = 32;
const DEFAULT_GAP = 0;
const DEFAULT_PADDING = 0;
const ENTITY_INSET = 3;
const HOARD_SCALE = 1.25;

export type StageDrawListOptions = {
  readonly state: GameState;
  readonly cellSize?: number;
  readonly gap?: number;
  readonly padding?: number;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly zoom?: number;
  readonly cameraLerp?: number;
  readonly previousCamera?: StageCameraState;
};

/**
 * Pure function of `GridViewModel` + `GameState` -> Pixi draw instructions.
 * It uses the phase-65 art resolver/atlas key helpers; the painter only turns
 * these instructions into textures and shapes.
 */
export const createStageDrawList = (
  model: GridViewModel,
  options: StageDrawListOptions,
): StageDrawList => {
  const cellSize = options.cellSize ?? DEFAULT_CELL_SIZE;
  const gap = options.gap ?? DEFAULT_GAP;
  const padding = options.padding ?? DEFAULT_PADDING;
  const metrics = { cellSize, gap, padding } satisfies StageGridMetrics;
  const worldWidth =
    padding * 2 + model.width * cellSize + Math.max(0, model.width - 1) * gap;
  const worldHeight =
    padding * 2 + model.height * cellSize + Math.max(0, model.height - 1) * gap;
  const sprites: StageSpriteDraw[] = [];
  const tileOverlays: StageTileOverlayDraw[] = [];
  const glows: StageGlowDraw[] = [];
  const signatureHooks: StageSignatureHook[] = [];
  const playerCell = playerCellForModel(model);
  const playerBounds = boundsForCell(playerCell, metrics);
  const camera = resolveStageCamera({
    worldWidth,
    worldHeight,
    viewportWidth: options.viewportWidth ?? DEFAULT_STAGE_VIEWPORT_WIDTH,
    viewportHeight: options.viewportHeight ?? DEFAULT_STAGE_VIEWPORT_HEIGHT,
    cellSize,
    targetX: playerBounds.x + playerBounds.width / 2,
    targetY: playerBounds.y + playerBounds.height / 2,
    previous: options.previousCamera,
    zoom: options.zoom,
    lerp: options.cameraLerp,
  });

  for (const cell of model.cells) {
    const bounds = boundsForCell(cell, metrics);
    const fogPaint = fogPaintForCell(
      cell.fog,
      Math.hypot(cell.x - playerCell.x, cell.y - playerCell.y),
      { band: options.state.run.band },
    );
    const wallPresentation = wallPresentationForCell(model, cell, bounds);
    const terrainSprite = terrainSpriteForCell(options.state, cell);
    sprites.push({
      key: `${cell.key}:terrain:${terrainSprite.spriteId}`,
      cellKey: cell.key,
      layer: "terrain",
      ...bounds,
      atlasKey: terrainSprite.atlasKey,
      atlasKeyString: serializeSpriteAtlasKey(terrainSprite.atlasKey),
      spriteId: terrainSprite.spriteId,
      reason: terrainSprite.reason,
      alpha: fogPaint.spriteAlpha,
      tint: multiplyTint(wallPresentation.tint, fogPaint.spriteTint),
      wallMask: wallPresentation.mask,
    });
    tileOverlays.push(...wallPresentation.overlays);

    const entitySprite = entitySpriteForCell(options.state, cell, bounds, fogPaint);
    if (entitySprite !== null) {
      sprites.push(entitySprite);

      if (entitySprite.spriteId === "feature.hoard") {
        glows.push(hoardGlowForCell(options.state, cell, bounds));
      }
    }

    if (cell.featureKind !== "" && cell.featureKind !== "hoard") {
      signatureHooks.push({
        key: `${cell.key}:signature-hook`,
        cellKey: cell.key,
        featureId: cell.featureId,
        featureKind: cell.featureKind,
        phase: "phase87-signature-invention",
      });
    }
  }

  return {
    width: model.width,
    height: model.height,
    cellSize,
    gap,
    padding,
    worldWidth,
    worldHeight,
    canvasWidth: camera.viewportWidth,
    canvasHeight: camera.viewportHeight,
    camera,
    sprites,
    tileOverlays,
    glows,
    fog: createFogDraws(model, metrics, playerCell, {
      band: options.state.run.band,
    }),
    signatureHooks,
  };
};

const terrainSpriteForCell = (
  state: GameState,
  cell: GridCellView,
): {
  readonly atlasKey: SpriteAtlasKey;
  readonly spriteId: FallbackSpriteId;
  readonly reason: string;
} => {
  const spriteId = resolveTerrainSpriteId(cell.terrain);
  const atlasKey = spriteAtlasKey(FALLBACK_THEME_ID, spriteId, state.run.seed);

  return {
    atlasKey,
    spriteId,
    reason: cell.layer === "empty" ? "grid.empty" : `terrain.${cell.terrain}`,
  };
};

const entitySpriteForCell = (
  state: GameState,
  cell: GridCellView,
  bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  fogPaint: ReturnType<typeof fogPaintForCell>,
): StageSpriteDraw | null => {
  if (!shouldDrawEntitySprite(cell)) {
    return null;
  }

  const resolved = resolveSpriteForCell(state, cell);
  const size =
    resolved.spriteId === "feature.hoard"
      ? bounds.width * HOARD_SCALE
      : bounds.width - ENTITY_INSET * 2;
  const x = bounds.x + (bounds.width - size) / 2;
  const y = bounds.y + (bounds.height - size) / 2;

  return {
    key: `${cell.key}:entity:${resolved.spriteId}`,
    cellKey: cell.key,
    layer: "entity",
    x,
    y,
    width: size,
    height: size,
    atlasKey: resolved.atlasKey,
    atlasKeyString: serializeSpriteAtlasKey(resolved.atlasKey),
    spriteId: resolved.spriteId,
    reason: resolved.reason,
    alpha: fogPaint.spriteAlpha,
    tint: fogPaint.spriteTint,
    wallMask: null,
  };
};

const shouldDrawEntitySprite = (cell: GridCellView): boolean =>
  cell.layer === "player" ||
  cell.layer === "enemy" ||
  cell.layer === "npc" ||
  cell.layer === "item" ||
  cell.layer === "trap" ||
  cell.featureKind === "hoard";

const hoardGlowForCell = (
  state: GameState,
  cell: GridCellView,
  bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): StageGlowDraw => {
  const pulseStep = state.run.turn % 4;

  return {
    key: `${cell.key}:hoard-glow`,
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    radius: bounds.width * (0.68 + pulseStep * 0.025),
    fillColor: 0xffd27d,
    alpha: 0.18 + pulseStep * 0.015,
  };
};

const playerCellForModel = (model: GridViewModel): GridCellView =>
  model.cells.find((cell) => cell.layer === "player") ??
  model.cells[0] ?? {
    key: "0:0",
    x: 0,
    y: 0,
    glyph: " ",
    terrain: "floor",
    fog: "visible",
    layer: "empty",
    featureKind: "",
    featureId: "",
    hasItem: false,
    label: "empty",
    badge: "",
    shape: "none",
    markers: [],
    pulses: [],
    hitFlash: false,
    motion: null,
    renderKey: "",
  };
