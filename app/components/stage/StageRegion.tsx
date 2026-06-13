"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { GridRegion } from "@/components/grid";

import styles from "./PixiStage.module.css";
import type { StageProps, StageSurface } from "./seam";

const STAGE_SURFACE_QUERY_PARAM = "stage";

const PixiStage = dynamic(
  () => import("./PixiStage").then((module) => module.PixiStage),
  {
    ssr: false,
    loading: () => <div className={styles.empty}>Loading canvas…</div>,
  },
);

type StageRegionProps = StageProps & {
  readonly className?: string;
};

export function StageRegion({ className, ...stageProps }: StageRegionProps) {
  const surface = useStageSurface();

  if (surface === "dom") {
    return <GridRegion className={className} {...stageProps} />;
  }

  return (
    <section
      className={className}
      aria-label="The grid"
      data-testid="game-grid-region"
    >
      <PixiStage {...stageProps} />
    </section>
  );
}

const stageSurfaceFromEnv = (): StageSurface => {
  if (process.env.NEXT_PUBLIC_STAGE_SURFACE === "dom") {
    return "dom";
  }

  return "pixi";
};

const stageSurfaceFromWindow = (): StageSurface => {
  const param = new URLSearchParams(window.location?.search ?? "").get(
    STAGE_SURFACE_QUERY_PARAM,
  );

  if (param === "dom") {
    return "dom";
  }

  if (param === "pixi") {
    return "pixi";
  }

  return stageSurfaceFromEnv();
};

const useStageSurface = (): StageSurface => {
  const [surface, setSurface] = useState<StageSurface>(stageSurfaceFromEnv);

  useEffect(() => {
    setSurface(stageSurfaceFromWindow());
  }, []);

  return surface;
};
