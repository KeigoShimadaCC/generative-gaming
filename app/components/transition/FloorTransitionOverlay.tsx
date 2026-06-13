"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { useGameStore } from "@/store/game-store";

import {
  bandPresentationForDepth,
  bandPresentationFromState,
  cinematicCopy,
  floorThemeRevealFromState,
} from "./cinematic";
import styles from "./FloorTransitionOverlay.module.css";
import {
  transitionPresentation,
  type FloorTransitionState,
} from "./model";
import {
  transitionMotionPreferenceFromWindow,
  type TransitionMotionPreference,
} from "./motion";

type FloorTransitionOverlayProps = {
  readonly transition: FloorTransitionState | null;
  readonly onSkip: () => void;
};

export function FloorTransitionOverlay({
  transition,
  onSkip,
}: FloorTransitionOverlayProps) {
  const [nowMs, setNowMs] = useState(() => performanceNow());
  const [motionPreference, setMotionPreference] =
    useState<TransitionMotionPreference>("full");
  const introLine = useGameStore((state) => state.arrivalIntroLine);
  const gameState = useGameStore((state) => state.gameState);

  useEffect(() => {
    setMotionPreference(transitionMotionPreferenceFromWindow());
  }, []);

  useEffect(() => {
    if (transition === null) {
      return;
    }

    const id = window.setInterval(() => setNowMs(performanceNow()), 80);
    return () => window.clearInterval(id);
  }, [transition]);

  useEffect(() => {
    if (transition === null) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!transition.floorReady || transition.phase !== "descending") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onSkip();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [onSkip, transition]);

  const presentation = useMemo(
    () => (transition === null ? null : transitionPresentation(transition, nowMs)),
    [nowMs, transition],
  );

  const band = useMemo(() => {
    if (transition === null) {
      return bandPresentationForDepth(1);
    }

    return presentation?.phase === "arrival"
      ? bandPresentationFromState(gameState, transition.depth)
      : bandPresentationForDepth(transition.depth);
  }, [gameState, presentation?.phase, transition]);

  const theme = useMemo(
    () =>
      transition === null
        ? floorThemeRevealFromState(null, 1)
        : floorThemeRevealFromState(gameState, transition.depth),
    [gameState, transition],
  );

  const copy = useMemo(() => {
    if (presentation === null || transition === null) {
      return null;
    }

    const resolvedIntro =
      introLine ?? presentation.whisper ?? "The Deep opens another room.";

    return cinematicCopy({
      presentation,
      band,
      depth: transition.depth,
      introLine: resolvedIntro,
      theme,
    });
  }, [band, introLine, presentation, theme, transition]);

  if (
    transition === null ||
    presentation === null ||
    copy === null
  ) {
    return null;
  }

  const resolvedIntro =
    introLine ?? presentation.whisper ?? "The Deep opens another room.";
  const reducedMotion = motionPreference === "reduced";
  const overlayStyle = {
    "--gg-transition-accent": band.accent,
    "--gg-transition-glow": band.glow,
    "--gg-transition-ink": band.ink,
    "--gg-transition-shimmer": `${presentation.shimmerPercent}%`,
    "--gg-transition-arrival": presentation.arrivalProgress.toFixed(3),
  } as CSSProperties;

  return (
    <div
      className={[
        styles.overlay,
        presentation.phase === "arrival" ? styles.arrival : styles.descending,
        reducedMotion ? styles.reducedMotion : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-transition-phase={presentation.phase}
      data-shimmer={presentation.shimmerVisible ? "true" : "false"}
      data-skip-enabled={presentation.skipEnabled ? "true" : "false"}
      data-motion={motionPreference}
      data-testid="transition-overlay"
      style={overlayStyle}
      aria-live="polite"
      aria-label={
        presentation.phase === "arrival"
          ? copy.screenReaderSummary
          : copy.screenReaderSummary
      }
    >
      <div className={styles.backdrop} aria-hidden="true">
        <div className={styles.inkWash} />
        <div className={styles.glowOrb} />
      </div>

      <div
        className={[
          styles.panel,
          presentation.phase === "arrival" ? styles.panelArrival : styles.panelDescend,
          presentation.entrancePulse ? styles.panelPulse : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {presentation.phase === "descending" ? (
          <>
            <p className={styles.eyebrow}>The Everdeep</p>
            <h1 className={styles.headline}>{copy.authoringHeadline}</h1>
            <p className={styles.subline}>{copy.authoringSubline}</p>

            {presentation.shimmerVisible ? (
              <div className={styles.inkReveal} aria-hidden="true">
                <div className={styles.inkStroke} />
                <div className={styles.inkStrokeSecondary} />
                <div className={styles.shimmerTrack}>
                  <span className={styles.shimmerFill} />
                </div>
              </div>
            ) : null}

            <p className={styles.depthCue}>{copy.depthCue}</p>

            {presentation.skipEnabled ? (
              <p className={styles.skipHint}>Press any key to enter</p>
            ) : null}
          </>
        ) : (
          <>
            <p className={styles.eyebrow}>{copy.arrivalEyebrow}</p>
            <p className={styles.bandTag}>{band.label}</p>
            <h1
              className={[
                styles.themeReveal,
                theme.themeNameAvailable ? styles.themeNamed : styles.themeDerived,
              ].join(" ")}
            >
              {theme.headline}
            </h1>
            {theme.subtitle !== null ? (
              <p className={styles.themeSubtitle}>{theme.subtitle}</p>
            ) : null}
            {theme.signature ? (
              <p className={styles.signatureBadge}>Signature floor</p>
            ) : null}
            <p className={styles.floorDepth}>Floor {transition.depth}</p>
            <p className={styles.arrivalLine}>{resolvedIntro}</p>
          </>
        )}
      </div>

      <p className={styles.srOnly}>{copy.screenReaderSummary}</p>
    </div>
  );
}

const performanceNow = (): number =>
  typeof performance === "undefined" ? Date.now() : performance.now();
