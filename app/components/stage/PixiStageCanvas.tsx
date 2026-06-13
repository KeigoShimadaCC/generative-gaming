"use client";

import { useEffect, useRef } from "react";
import { Application, Graphics } from "pixi.js";

import type { StageDrawList } from "./draw-list";
import styles from "./PixiStage.module.css";

type PixiStageCanvasProps = {
  readonly drawList: StageDrawList;
};

export default function PixiStageCanvas({ drawList }: PixiStageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const graphicsRef = useRef<Graphics | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const host = hostRef.current;

    if (host === null) {
      return;
    }

    let disposed = false;
    const app = new Application();
    appRef.current = app;

    void (async () => {
      await app.init({
        width: drawList.canvasWidth,
        height: drawList.canvasHeight,
        background: 0x0d1117,
        antialias: false,
        resolution: 1,
        autoDensity: true,
      });

      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }

      host.replaceChildren(app.canvas);
      const graphics = new Graphics();
      graphicsRef.current = graphics;
      app.stage.addChild(graphics);
      paintDrawList(graphics, drawList);
    })();

    return () => {
      disposed = true;
      graphicsRef.current = null;
      app.destroy(true, { children: true });
      appRef.current = null;
      host.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    const graphics = graphicsRef.current;

    if (app === null || graphics === null) {
      return;
    }

    app.renderer.resize(drawList.canvasWidth, drawList.canvasHeight);
    paintDrawList(graphics, drawList);
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

const paintDrawList = (graphics: Graphics, drawList: StageDrawList): void => {
  graphics.clear();

  for (const rect of drawList.rects) {
    graphics.rect(rect.x, rect.y, rect.width, rect.height);
    graphics.fill({ color: rect.fillColor, alpha: rect.alpha });

    if (rect.borderWidth > 0) {
      graphics.stroke({
        color: rect.borderColor,
        width: rect.borderWidth,
        alpha: rect.borderAlpha * rect.alpha,
      });
    }
  }
};
