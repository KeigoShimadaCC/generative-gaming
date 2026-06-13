"use client";

import { useEffect, useMemo, useRef } from "react";

import { createGridViewModel } from "@/components/grid/model";
import type { GameState } from "@engine/state";

import styles from "./Minimap.module.css";
import {
  createMinimapViewModel,
  type MinimapMark,
  type MinimapViewModel,
} from "./model";

type MinimapRegionProps = {
  readonly state: GameState | null;
  readonly className?: string;
};

type MinimapFrameProps = {
  readonly model: MinimapViewModel | null;
};

const MAX_CANVAS_PX = 112;
const MARK_COLORS: Readonly<Record<MinimapMark, string>> = {
  unseen: "#0a0d12",
  wall: "#1a2230",
  "floor-visible": "#4a6078",
  "floor-remembered": "#2f3d4f",
  player: "#ffe680",
  stairs: "#79d39f",
  hoard: "#d9c96c",
};

export function MinimapRegion({ state, className }: MinimapRegionProps) {
  const model = useMemo(() => {
    if (state === null) {
      return null;
    }

    return createMinimapViewModel(createGridViewModel(state));
  }, [state]);

  return (
    <section
      className={[styles.region, className].filter(Boolean).join(" ")}
      aria-label="Minimap"
      data-testid="minimap"
    >
      <MinimapFrame model={model} />
    </section>
  );
}

export function MinimapFrame({ model }: MinimapFrameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null || model === null) {
      return;
    }

    paintMinimap(canvas, model);
  }, [model]);

  if (model === null) {
    return <div className={styles.empty}>No map</div>;
  }

  const pixelSize = Math.max(
    1,
    Math.floor(
      MAX_CANVAS_PX / Math.max(model.width, model.height),
    ),
  );

  return (
    <div
      className={styles.frame}
      role="img"
      aria-label={model.description}
    >
      <div className={styles.header}>
        <span className={styles.label}>Map</span>
      </div>
      <div className={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          width={model.width * pixelSize}
          height={model.height * pixelSize}
          aria-hidden="true"
          data-testid="minimap-canvas"
        />
      </div>
    </div>
  );
}

const paintMinimap = (
  canvas: HTMLCanvasElement,
  model: MinimapViewModel,
): void => {
  const context = canvas.getContext("2d");

  if (context === null) {
    return;
  }

  const pixelSize = Math.max(
    1,
    Math.floor(
      MAX_CANVAS_PX / Math.max(model.width, model.height),
    ),
  );

  canvas.width = model.width * pixelSize;
  canvas.height = model.height * pixelSize;
  context.imageSmoothingEnabled = false;

  for (const cell of model.cells) {
    context.fillStyle = MARK_COLORS[cell.mark];
    context.fillRect(
      cell.x * pixelSize,
      cell.y * pixelSize,
      pixelSize,
      pixelSize,
    );
  }
};
