"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { useGameStore } from "@/store/game-store";

import styles from "./FloorTransitionOverlay.module.css";
import {
  transitionPresentation,
  type FloorTransitionState,
} from "./model";

type FloorTransitionOverlayProps = {
  readonly transition: FloorTransitionState | null;
  readonly onSkip: () => void;
};

export function FloorTransitionOverlay({
  transition,
  onSkip,
}: FloorTransitionOverlayProps) {
  const [nowMs, setNowMs] = useState(() => performanceNow());
  const introLine = useGameStore((state) => state.arrivalIntroLine);

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

  if (transition === null || presentation === null) {
    return null;
  }

  return (
    <div
      className={[
        styles.overlay,
        presentation.phase === "arrival" ? styles.arrival : styles.descending,
      ]
        .filter(Boolean)
        .join(" ")}
      data-transition-phase={presentation.phase}
      data-shimmer={presentation.shimmerVisible ? "true" : "false"}
      data-skip-enabled={presentation.skipEnabled ? "true" : "false"}
      data-testid="transition-overlay"
      aria-live="polite"
    >
      <div className={styles.panel}>
        <div className={styles.floor}>{presentation.floorLabel}</div>
        <div className={styles.whisper}>{presentation.whisper}</div>
        {presentation.shimmerVisible ? (
          <div
            className={styles.shimmerTrack}
            aria-hidden="true"
            style={{ "--gg-transition-shimmer": `${presentation.shimmerPercent}%` } as CSSProperties}
          >
            <span className={styles.shimmerFill} />
          </div>
        ) : null}
        {presentation.phase === "arrival" ? (
          <div
            className={styles.arrivalLine}
            data-arrival-progress={presentation.arrivalProgress.toFixed(2)}
            data-entrance-pulse={presentation.entrancePulse ? "true" : "false"}
          >
            {introLine ?? presentation.whisper}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const performanceNow = (): number =>
  typeof performance === "undefined" ? Date.now() : performance.now();
