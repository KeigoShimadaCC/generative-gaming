import type { GameState } from "@engine/state";

export const READY_THEATER_MS = 1_400;
export const ARRIVAL_RITUAL_MS = 2_000;
export const STAIRS_CAP_MS = 8_000;

export type FloorControllerState = "ready" | "in_flight" | "none";
export type ServedFloorSource = "generated" | "fallback";

export type FloorTransitionPhase = "descending" | "arrival";

export type FloorTransitionState = {
  readonly phase: FloorTransitionPhase;
  readonly depth: number;
  readonly whisper: string;
  readonly controllerState: FloorControllerState;
  readonly startedAtMs: number;
  readonly floorReady: boolean;
  readonly readyAtMs: number | null;
  readonly servedSource: ServedFloorSource | null;
  readonly arrivalStartedAtMs: number | null;
  readonly playableAtMs: number | null;
};

export type FloorTransitionPresentation = {
  readonly phase: FloorTransitionPhase;
  readonly floorLabel: string;
  readonly whisper: string;
  readonly shimmerVisible: boolean;
  readonly shimmerPercent: number;
  readonly awaitingFloor: boolean;
  readonly skipEnabled: boolean;
  readonly arrivalProgress: number;
  readonly entrancePulse: boolean;
};

export type TransitionLatencySample = {
  readonly runId: string;
  readonly fromDepth: number;
  readonly toDepth: number;
  readonly stairsToPlayableMs: number;
  readonly controllerState: FloorControllerState;
  readonly servedSource: ServedFloorSource;
  readonly recordedAtMs: number;
};

export const createDescendingTransition = ({
  depth,
  whisper,
  controllerState,
  startedAtMs,
}: {
  readonly depth: number;
  readonly whisper: string;
  readonly controllerState: FloorControllerState;
  readonly startedAtMs: number;
}): FloorTransitionState => ({
  phase: "descending",
  depth,
  whisper,
  controllerState,
  startedAtMs,
  floorReady: false,
  readyAtMs: null,
  servedSource: null,
  arrivalStartedAtMs: null,
  playableAtMs: null,
});

export const markTransitionFloorReady = (
  transition: FloorTransitionState,
  readyAtMs: number,
  servedSource: ServedFloorSource,
): FloorTransitionState => ({
  ...transition,
  floorReady: true,
  readyAtMs,
  servedSource,
});

export const startArrivalRitual = (
  transition: FloorTransitionState,
  arrivalStartedAtMs: number,
): FloorTransitionState => ({
  ...transition,
  phase: "arrival",
  floorReady: true,
  arrivalStartedAtMs,
  playableAtMs: arrivalStartedAtMs + ARRIVAL_RITUAL_MS,
});

export const transitionPresentation = (
  transition: FloorTransitionState,
  nowMs: number,
): FloorTransitionPresentation => {
  const elapsed = Math.max(0, nowMs - transition.startedAtMs);
  const arrivalElapsed =
    transition.arrivalStartedAtMs === null
      ? 0
      : Math.max(0, nowMs - transition.arrivalStartedAtMs);

  return {
    phase: transition.phase,
    floorLabel: `Floor ${transition.depth}`,
    whisper: transition.whisper,
    shimmerVisible:
      transition.phase === "descending" &&
      transition.controllerState === "in_flight" &&
      !transition.floorReady,
    shimmerPercent:
      transition.controllerState === "in_flight"
        ? Math.min(100, Math.round((elapsed / STAIRS_CAP_MS) * 100))
        : 0,
    awaitingFloor:
      transition.phase === "descending" &&
      transition.controllerState !== "ready" &&
      !transition.floorReady,
    skipEnabled:
      transition.phase === "descending" && transition.floorReady,
    arrivalProgress:
      transition.phase === "arrival"
        ? Math.min(1, arrivalElapsed / ARRIVAL_RITUAL_MS)
        : 0,
    entrancePulse: transition.phase === "arrival" && arrivalElapsed < 900,
  };
};

export const transitionPresentationForSource = (
  source: ServedFloorSource,
): FloorTransitionPresentation => {
  const transition = markTransitionFloorReady(
    createDescendingTransition({
      depth: 2,
      whisper: "The Deep lowers its voice.",
      controllerState: "in_flight",
      startedAtMs: 0,
    }),
    500,
    source,
  );

  return transitionPresentation(transition, 500);
};

export const shouldAutoEnterFloor = (
  transition: FloorTransitionState,
  nowMs: number,
): boolean => {
  if (transition.phase !== "descending" || !transition.floorReady) {
    return false;
  }

  if (transition.controllerState !== "ready") {
    return true;
  }

  return nowMs - transition.startedAtMs >= READY_THEATER_MS;
};

export const shouldResumePlay = (
  transition: FloorTransitionState,
  nowMs: number,
): boolean =>
  transition.phase === "arrival" &&
  transition.playableAtMs !== null &&
  nowMs >= transition.playableAtMs;

export const fallbackWhisperForDepth = (depth: number): string => {
  const lines = [
    "Stone remembers the last warm footprint.",
    "A lantern-breath thins below the stair.",
    "The Deep closes one room and opens another.",
    "Quiet dust gathers where names are unwritten.",
  ];

  return lines[Math.abs(depth) % lines.length] ?? "Stone remembers the last warm footprint.";
};

export const floorIntroFromState = (state: GameState | null): string => {
  if (state === null) {
    return fallbackWhisperForDepth(1);
  }

  const existingIntro = state.log.find(
    (event) =>
      event.type === "deep_narration" &&
      event.data.beatKind === "floor_intro" &&
      event.data.depth === state.run.depth,
  );
  if (existingIntro?.type === "deep_narration") {
    return existingIntro.data.text;
  }

  const director = directorRecord(state);
  const floorIntro = director?.narration?.floorIntro;

  return typeof floorIntro === "string" && floorIntro.length > 0
    ? floorIntro
    : fallbackWhisperForDepth(state.run.depth);
};

const directorRecord = (
  state: GameState,
):
  | {
      readonly narration?: {
        readonly floorIntro?: unknown;
      };
    }
  | null => {
  const knowledge = state.floor.geometry.opaque?.knowledge;
  if (!isRecord(knowledge)) {
    return null;
  }

  const director = knowledge.director;

  return isRecord(director) ? director : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
