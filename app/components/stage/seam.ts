import type { GameState } from "@engine/state";

import type {
  GridOverlayMarker,
  GridViewModel,
} from "@/components/grid/model";

/**
 * Frozen render seam (phase63-v1).
 *
 * App wiring passes `StageProps` to either the DOM grid (`surface: "dom"`) or the
 * Pixi canvas stage (`surface: "pixi"`). Both surfaces consume the same
 * `GridViewModel` produced from `GameState`; neither mutates engine state.
 */
export const STAGE_RENDER_SEAM_VERSION = "phase63-v1" as const;

export type StageSurface = "dom" | "pixi";

/** Props the app layer hands to any stage renderer. */
export type StageProps = {
  readonly state: GameState | null;
  readonly markers?: readonly GridOverlayMarker[];
  readonly glyphSizeRem?: number;
};

/** Renderer selection at the seam boundary. */
export type StageRendererProps = StageProps & {
  readonly surface?: StageSurface;
};

/** Pure canvas draw input — shared by Pixi and headless tests. */
export type StageCanvasInput = {
  readonly model: GridViewModel;
  readonly glyphSizeRem?: number;
};
