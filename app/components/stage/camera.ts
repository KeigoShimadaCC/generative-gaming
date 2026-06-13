export type StageCameraState = {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly zoom: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly targetScrollX: number;
  readonly targetScrollY: number;
  readonly transformX: number;
  readonly transformY: number;
};

export type StageCameraInput = {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly cellSize: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly previous?: StageCameraState;
  readonly zoom?: number;
  readonly lerp?: number;
};

export const DEFAULT_STAGE_VIEWPORT_WIDTH = 640;
export const DEFAULT_STAGE_VIEWPORT_HEIGHT = 416;

const TARGET_VISIBLE_COLUMNS = 16;
const TARGET_VISIBLE_ROWS = 10;
const MIN_ZOOM = 1;
const MAX_ZOOM = 2;
const DEFAULT_LERP = 0.35;

export const resolveStageCamera = (
  input: StageCameraInput,
): StageCameraState => {
  const viewportWidth = Math.max(
    1,
    input.viewportWidth ?? DEFAULT_STAGE_VIEWPORT_WIDTH,
  );
  const viewportHeight = Math.max(
    1,
    input.viewportHeight ?? DEFAULT_STAGE_VIEWPORT_HEIGHT,
  );
  const worldWidth = Math.max(1, input.worldWidth);
  const worldHeight = Math.max(1, input.worldHeight);
  const zoom = input.zoom ?? chooseZoom(viewportWidth, viewportHeight, input.cellSize);
  const viewportWorldWidth = viewportWidth / zoom;
  const viewportWorldHeight = viewportHeight / zoom;
  const maxScrollX = Math.max(0, worldWidth - viewportWorldWidth);
  const maxScrollY = Math.max(0, worldHeight - viewportWorldHeight);
  const targetScrollX = clamp(input.targetX - viewportWorldWidth / 2, 0, maxScrollX);
  const targetScrollY = clamp(input.targetY - viewportWorldHeight / 2, 0, maxScrollY);
  const lerpAmount = clamp(input.lerp ?? DEFAULT_LERP, 0, 1);
  const canLerp =
    input.previous !== undefined &&
    input.previous.worldWidth === worldWidth &&
    input.previous.worldHeight === worldHeight &&
    input.previous.viewportWidth === viewportWidth &&
    input.previous.viewportHeight === viewportHeight &&
    input.previous.zoom === zoom;
  const scrollX = canLerp
    ? clamp(lerp(input.previous.scrollX, targetScrollX, lerpAmount), 0, maxScrollX)
    : targetScrollX;
  const scrollY = canLerp
    ? clamp(lerp(input.previous.scrollY, targetScrollY, lerpAmount), 0, maxScrollY)
    : targetScrollY;
  const scaledWorldWidth = worldWidth * zoom;
  const scaledWorldHeight = worldHeight * zoom;

  return {
    viewportWidth,
    viewportHeight,
    worldWidth,
    worldHeight,
    zoom,
    scrollX,
    scrollY,
    targetScrollX,
    targetScrollY,
    transformX:
      scaledWorldWidth <= viewportWidth
        ? (viewportWidth - scaledWorldWidth) / 2
        : -scrollX * zoom,
    transformY:
      scaledWorldHeight <= viewportHeight
        ? (viewportHeight - scaledWorldHeight) / 2
        : -scrollY * zoom,
  };
};

const chooseZoom = (
  viewportWidth: number,
  viewportHeight: number,
  cellSize: number,
): number =>
  clamp(
    Math.min(
      viewportWidth / (TARGET_VISIBLE_COLUMNS * cellSize),
      viewportHeight / (TARGET_VISIBLE_ROWS * cellSize),
    ),
    MIN_ZOOM,
    MAX_ZOOM,
  );

const lerp = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
