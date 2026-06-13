"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createGridViewModel,
  type GridRenderCursor,
} from "@/components/grid/model";

import {
  createStageAnimationPlan,
  type StageAnimationPlan,
  type StageMotionPreference,
} from "./animation";
import { StageA11yMirror } from "./a11y-mirror";
import type { StageCameraState } from "./camera";
import {
  createStageDrawList,
  type StageDrawList,
} from "./draw-list";
import styles from "./PixiStage.module.css";
import type { StageProps } from "./seam";

const PixiStageCanvas = dynamic(() => import("./PixiStageCanvas"), {
  ssr: false,
  loading: () => <div className={styles.empty}>Loading canvas…</div>,
});

export function PixiStage({ state, markers = [] }: StageProps) {
  const cursorRef = useRef<GridRenderCursor | undefined>(undefined);
  const cameraRef = useRef<StageCameraState | undefined>(undefined);
  const previousFrameRef = useRef<{
    readonly state: NonNullable<StageProps["state"]>;
    readonly drawList: StageDrawList;
  } | null>(null);
  const motionPreference = useStageMotionPreference();
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
  const animationPlan = useMemo<StageAnimationPlan | null>(() => {
    if (state === null || drawList === null) {
      previousFrameRef.current = null;
      return null;
    }

    const previousFrame = previousFrameRef.current;
    const plan = createStageAnimationPlan({
      previousState: previousFrame?.state ?? null,
      previousDrawList: previousFrame?.drawList ?? null,
      state,
      drawList,
      motionPreference,
    });

    previousFrameRef.current = { state, drawList };

    return plan;
  }, [drawList, motionPreference, state]);

  if (
    model === null ||
    drawList === null ||
    animationPlan === null ||
    model.width === 0 ||
    model.height === 0
  ) {
    return (
      <div className={styles.stage} data-testid="pixi-stage">
        <div className={styles.empty}>No floor grid</div>
      </div>
    );
  }

  return (
    <div className={styles.stage} data-testid="pixi-stage">
      <PixiStageCanvas drawList={drawList} animationPlan={animationPlan} />
      <StageA11yMirror model={model} />
    </div>
  );
}

const useStageMotionPreference = (): StageMotionPreference => {
  const [preference, setPreference] = useState<StageMotionPreference>("full");

  useEffect(() => {
    setPreference(stageMotionPreferenceFromWindow());
  }, []);

  return preference;
};

const stageMotionPreferenceFromWindow = (): StageMotionPreference => {
  const searchParams = new URLSearchParams(window.location?.search ?? "");
  const motion = searchParams.get("motion") ?? searchParams.get("stageMotion");
  const reducedMotion = searchParams.get("reducedMotion");

  if (
    motion === "off" ||
    motion === "reduced" ||
    motion === "snap" ||
    reducedMotion === "1" ||
    reducedMotion === "true"
  ) {
    return "reduced";
  }

  if (motion === "on" || motion === "full" || reducedMotion === "0") {
    return "full";
  }

  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    ? "reduced"
    : "full";
};
