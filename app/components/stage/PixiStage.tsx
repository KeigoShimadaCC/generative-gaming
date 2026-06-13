"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef } from "react";

import {
  createGridViewModel,
  type GridRenderCursor,
} from "@/components/grid/model";

import { StageA11yMirror } from "./a11y-mirror";
import type { StageCameraState } from "./camera";
import { createStageDrawList } from "./draw-list";
import styles from "./PixiStage.module.css";
import type { StageProps } from "./seam";

const PixiStageCanvas = dynamic(() => import("./PixiStageCanvas"), {
  ssr: false,
  loading: () => <div className={styles.empty}>Loading canvas…</div>,
});

export function PixiStage({ state, markers = [] }: StageProps) {
  const cursorRef = useRef<GridRenderCursor | undefined>(undefined);
  const cameraRef = useRef<StageCameraState | undefined>(undefined);
  const model = useMemo(() => {
    if (state === null) {
      return null;
    }

    const nextModel = createGridViewModel(state, cursorRef.current, markers);
    cursorRef.current = nextModel.cursor;

    return nextModel;
  }, [state, markers]);

  const drawList = useMemo(
    () => {
      if (model === null || state === null) {
        return null;
      }

      const nextDrawList = createStageDrawList(model, {
        state,
        previousCamera: cameraRef.current,
      });
      cameraRef.current = nextDrawList.camera;

      return nextDrawList;
    },
    [model, state],
  );

  if (model === null || drawList === null || model.width === 0 || model.height === 0) {
    return (
      <div className={styles.stage} data-testid="pixi-stage">
        <div className={styles.empty}>No floor grid</div>
      </div>
    );
  }

  return (
    <div className={styles.stage} data-testid="pixi-stage">
      <PixiStageCanvas drawList={drawList} />
      <StageA11yMirror model={model} />
    </div>
  );
}
