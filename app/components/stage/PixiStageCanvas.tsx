"use client";

import { useEffect, useRef } from "react";
import {
  Application,
  Container,
  Graphics,
  Sprite,
  type Texture,
} from "pixi.js";

import type {
  StageDrawList,
  StageSpriteDraw,
} from "./draw-list";
import styles from "./PixiStage.module.css";
import {
  destroyStageTextures,
  ensureStageTextures,
  type StageTextureMap,
} from "./sprite-layer";

type PixiStageCanvasProps = {
  readonly drawList: StageDrawList;
};

const safelyDestroyApplication = (app: Application): void => {
  if (!app.renderer) {
    return;
  }

  try {
    app.destroy(true, { children: true });
  } catch {
    // Half-initialized Pixi apps may throw if ResizePlugin teardown is missing.
  }
};

export default function PixiStageCanvas({ drawList }: PixiStageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const texturesRef = useRef<StageTextureMap>(new Map());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const host = hostRef.current;

    if (host === null) {
      return;
    }

    let cancelled = false;
    const app = new Application();
    appRef.current = app;

    void (async () => {
      await app.init({
        width: drawList.canvasWidth,
        height: drawList.canvasHeight,
        background: 0x030509,
        antialias: false,
        resolution: 1,
        autoDensity: true,
      });

      if (cancelled) {
        safelyDestroyApplication(app);
        return;
      }

      host.replaceChildren(app.canvas);
      const world = new Container();
      worldRef.current = world;
      app.stage.addChild(world);
      paintDrawList(world, texturesRef.current, drawList);
    })();

    return () => {
      cancelled = true;
      worldRef.current = null;
      destroyStageTextures(texturesRef.current);
      safelyDestroyApplication(app);
      appRef.current = null;
      host.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;

    if (app === null || world === null) {
      return;
    }

    app.renderer.resize(drawList.canvasWidth, drawList.canvasHeight);
    paintDrawList(world, texturesRef.current, drawList);
  }, [drawList]);

  return (
    <div
      className={styles.canvasHost}
      ref={hostRef}
      data-testid="pixi-stage-canvas-host"
      aria-hidden="true"
    />
  );
}

const paintDrawList = (
  world: Container,
  textures: StageTextureMap,
  drawList: StageDrawList,
): void => {
  ensureStageTextures(drawList, textures);
  clearWorld(world);

  world.scale.set(drawList.camera.zoom);
  world.position.set(drawList.camera.transformX, drawList.camera.transformY);

  const terrainLayer = new Container();
  const wallOverlayLayer = new Graphics();
  const glowLayer = new Graphics();
  const entityLayer = new Container();
  const fogLayer = new Graphics();

  for (const sprite of drawList.sprites.filter(
    (entry) => entry.layer === "terrain",
  )) {
    terrainLayer.addChild(spriteForDraw(sprite, textures));
  }

  for (const overlay of drawList.tileOverlays) {
    wallOverlayLayer.rect(overlay.x, overlay.y, overlay.width, overlay.height);
    wallOverlayLayer.fill({
      color: overlay.fillColor,
      alpha: overlay.alpha,
    });
  }

  for (const glow of drawList.glows) {
    glowLayer.circle(glow.x, glow.y, glow.radius);
    glowLayer.fill({ color: glow.fillColor, alpha: glow.alpha });
  }

  for (const sprite of drawList.sprites.filter(
    (entry) => entry.layer === "entity",
  )) {
    entityLayer.addChild(spriteForDraw(sprite, textures));
  }

  for (const fog of drawList.fog) {
    if (fog.alpha <= 0) {
      continue;
    }

    fogLayer.rect(fog.x, fog.y, fog.width, fog.height);
    fogLayer.fill({ color: fog.fillColor, alpha: fog.alpha });
  }

  world.addChild(terrainLayer);
  world.addChild(wallOverlayLayer);
  world.addChild(glowLayer);
  world.addChild(entityLayer);
  world.addChild(fogLayer);
};

const spriteForDraw = (
  draw: StageSpriteDraw,
  textures: ReadonlyMap<string, Texture>,
): Sprite => {
  const texture = textures.get(draw.atlasKeyString);

  if (texture === undefined) {
    throw new Error(`missing texture for ${draw.atlasKeyString}`);
  }

  const sprite = new Sprite({ texture, roundPixels: true });
  sprite.x = draw.x;
  sprite.y = draw.y;
  sprite.width = draw.width;
  sprite.height = draw.height;
  sprite.alpha = draw.alpha;
  sprite.tint = draw.tint;

  return sprite;
};

const clearWorld = (world: Container): void => {
  const removed = world.removeChildren();

  for (const child of removed) {
    child.destroy({ children: true });
  }
};
