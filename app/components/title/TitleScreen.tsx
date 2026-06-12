"use client";

import { useEffect, useMemo, useState } from "react";

import type { GameState } from "@engine/state";

import styles from "./TitleScreen.module.css";
import {
  createTitleSeed,
  createTitleViewModel,
  nextRunMemoryNote,
  terminalRunViewModel,
} from "./model";

type TitleScreenProps = {
  readonly activeRun: GameState | null;
  readonly terminalRun: GameState | null;
  readonly onContinue: () => void;
  readonly onNewRun: (seed: string) => void;
  readonly onRunIndex: () => void;
  readonly onSettings: () => void;
};

export function TitleScreen({
  activeRun,
  terminalRun,
  onContinue,
  onNewRun,
  onRunIndex,
  onSettings,
}: TitleScreenProps) {
  const [seed, setSeed] = useState(() => createTitleSeed());
  const terminal = terminalRun === null ? null : terminalRunViewModel(terminalRun);
  const model = useMemo(
    () => createTitleViewModel({ activeRun, seed }),
    [activeRun, seed],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === ">") {
        event.preventDefault();
        onNewRun(seed);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNewRun, seed]);

  if (terminal !== null) {
    return (
      <section className={styles.screen} aria-label="Run diary">
        <div className={styles.surface}>The Last Lantern</div>
        <div className={styles.titleBlock}>
          <h1>{terminal.outcome === "victory" ? "Victory" : terminal.outcome === "defeat" ? "Defeat" : "Run Ended"}</h1>
          <p>{nextRunMemoryNote(terminal)}</p>
        </div>
        <div className={styles.summaryStrip}>
          <Summary label="Depth" value={String(terminal.depth)} />
          <Summary label="Turns" value={String(terminal.turns)} />
          <Summary label="Found" value={String(terminal.discoveries)} />
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => onNewRun(seed)}>
            New run
          </button>
          <button type="button" onClick={onRunIndex}>
            Run index
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.screen} aria-label="Title">
      <div className={styles.surface}>The Last Lantern</div>
      <div className={styles.titleBlock}>
        <h1>Everdeep</h1>
        <p>Seed {model.seed}</p>
      </div>
      <div className={styles.actions}>
        {model.actions.includes("continue") ? (
          <button type="button" onClick={onContinue}>
            Continue
          </button>
        ) : null}
        <button type="button" onClick={() => onNewRun(seed)}>
          New run
        </button>
        <button type="button" onClick={onRunIndex}>
          Run index
        </button>
        <button type="button" onClick={onSettings}>
          Settings
        </button>
      </div>
      <button
        className={styles.seedButton}
        type="button"
        onClick={() => setSeed(createTitleSeed(Date.now() + 1))}
      >
        Reroll seed
      </button>
    </section>
  );
}

function Summary({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea";
};
