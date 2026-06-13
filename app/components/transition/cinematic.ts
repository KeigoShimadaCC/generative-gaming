import { depthBandForDepth, type GameState } from "@engine/state";

import type { FloorTransitionPresentation } from "./model";

type DepthBand = GameState["run"]["band"];

export type BandPresentation = {
  readonly band: DepthBand;
  readonly label: string;
  readonly accent: string;
  readonly glow: string;
  readonly ink: string;
};

const BAND_PRESENTATION: Readonly<Record<DepthBand, Omit<BandPresentation, "band">>> = {
  shallows: {
    label: "The Shallows",
    accent: "#ffc878",
    glow: "rgba(255, 200, 120, 0.35)",
    ink: "rgba(255, 200, 120, 0.18)",
  },
  middle: {
    label: "The Middle Deep",
    accent: "#8ed4c7",
    glow: "rgba(142, 212, 199, 0.32)",
    ink: "rgba(142, 212, 199, 0.16)",
  },
  lowest: {
    label: "The Lowest Deep",
    accent: "#ff8a62",
    glow: "rgba(255, 106, 69, 0.34)",
    ink: "rgba(255, 106, 69, 0.18)",
  },
};

const FLAVOR_LABELS: Readonly<Record<string, string>> = {
  open: "Open Halls",
  warren: "Twisted Warren",
  halls: "Long Halls",
  ring: "Ring Chambers",
  sanctum: "Sealed Sanctum",
};

export const bandForDepth = (depth: number): DepthBand => depthBandForDepth(depth);

export const bandPresentationForDepth = (depth: number): BandPresentation => {
  const band = bandForDepth(depth);
  return { band, ...BAND_PRESENTATION[band] };
};

export const bandPresentationFromState = (
  state: GameState | null,
  fallbackDepth: number,
): BandPresentation => {
  if (state !== null) {
    return { band: state.run.band, ...BAND_PRESENTATION[state.run.band] };
  }

  return bandPresentationForDepth(fallbackDepth);
};

export type FloorThemeReveal = {
  readonly headline: string;
  readonly subtitle: string | null;
  readonly signature: boolean;
  readonly themeNameAvailable: boolean;
};

export const floorThemeRevealFromState = (
  state: GameState | null,
  fallbackDepth: number,
): FloorThemeReveal => {
  const band = bandPresentationFromState(state, fallbackDepth);
  const director = directorRecord(state);
  const themeName = themeNameFromDirector(director);
  const flavor = layoutFlavorFromDirector(director);
  const signature = signatureFromDirector(director);

  if (themeName !== null) {
    return {
      headline: themeName,
      subtitle: flavor === null ? band.label : `${band.label} · ${flavor}`,
      signature,
      themeNameAvailable: true,
    };
  }

  const flavorLabel = flavor === null ? null : humanizeFlavor(flavor);

  return {
    headline: flavorLabel ?? band.label,
    subtitle:
      flavorLabel === null
        ? `Floor ${state?.run.depth ?? fallbackDepth}`
        : `${band.label} · Floor ${state?.run.depth ?? fallbackDepth}`,
    signature,
    themeNameAvailable: false,
  };
};

export type CinematicCopy = {
  readonly authoringHeadline: string;
  readonly authoringSubline: string;
  readonly depthCue: string;
  readonly arrivalEyebrow: string;
  readonly screenReaderSummary: string;
};

export const cinematicCopy = ({
  presentation,
  band,
  depth,
  introLine,
  theme,
}: {
  readonly presentation: FloorTransitionPresentation;
  readonly band: BandPresentation;
  readonly depth: number;
  readonly introLine: string;
  readonly theme: FloorThemeReveal;
}): CinematicCopy => {
  if (presentation.phase === "arrival") {
    const arrivalEyebrow = theme.signature
      ? "A signature floor takes form"
      : "The new floor arrives";

    return {
      authoringHeadline: "",
      authoringSubline: "",
      depthCue: "",
      arrivalEyebrow,
      screenReaderSummary: `${arrivalEyebrow}. ${theme.headline}. ${introLine}`,
    };
  }

  const authoringHeadline = presentation.awaitingFloor
    ? "The deep is being written…"
    : "The next chamber is ready";

  const authoringSubline = presentation.awaitingFloor
    ? "Ink and stone reshape themselves into a floor only you will walk."
    : "The unseen author finishes the last line.";

  return {
    authoringHeadline,
    authoringSubline,
    depthCue: `Floor ${depth} · ${band.label}`,
    arrivalEyebrow: "",
    screenReaderSummary: `${authoringHeadline} ${authoringSubline} ${depthCueFor(depth, band.label)}`,
  };
};

const depthCueFor = (depth: number, bandLabel: string): string =>
  `Floor ${depth}, ${bandLabel}.`;

const humanizeFlavor = (flavor: string): string =>
  FLAVOR_LABELS[flavor] ??
  flavor
    .split(/[-_]/g)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const directorRecord = (state: GameState | null): Record<string, unknown> | null => {
  if (state === null) {
    return null;
  }

  const knowledge = state.floor.geometry.opaque?.knowledge;
  if (!isRecord(knowledge)) {
    return null;
  }

  const director = knowledge.director;
  return isRecord(director) ? director : null;
};

const themeNameFromDirector = (
  director: Record<string, unknown> | null,
): string | null => {
  if (director === null) {
    return null;
  }

  for (const key of ["themeName", "theme", "themeId", "floorTheme", "visualTheme"]) {
    const value = director[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return humanizeThemeName(value);
    }
  }

  const metadata = director.metadata;
  if (isRecord(metadata)) {
    for (const key of ["themeName", "theme", "themeId"]) {
      const value = metadata[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return humanizeThemeName(value);
      }
    }
  }

  return null;
};

const layoutFlavorFromDirector = (
  director: Record<string, unknown> | null,
): string | null => {
  if (director === null) {
    return null;
  }

  const params = director.params;
  if (isRecord(params) && typeof params.flavor === "string") {
    return params.flavor;
  }

  return null;
};

const signatureFromDirector = (director: Record<string, unknown> | null): boolean => {
  if (director === null) {
    return false;
  }

  const metadata = director.metadata;
  return isRecord(metadata) && metadata.signature === true;
};

const humanizeThemeName = (value: string): string =>
  value.includes("-") || value.includes("_") ? humanizeFlavor(value) : value;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
