"use client";

import { useEffect, useMemo, useState } from "react";

import { DiaryPanel } from "@/components/diary";
import type { GameState } from "@engine/state";
import { composeDiary } from "@harness/diary";

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
  const terminalDiary = useMemo(
    () => (terminalRun === null ? null : composeDiary({ state: terminalRun })),
    [terminalRun],
  );
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

  if (terminal !== null && terminalDiary !== null) {
    return (
      <section
        className={styles.screen}
        aria-label="Run diary"
        data-testid="summary-screen"
      >
        <div className={styles.surface}>The Last Lantern</div>
        <DiaryPanel diary={terminalDiary} variant="final" />
        <p className={styles.terminalNote}>{nextRunMemoryNote(terminal)}</p>
        <div className={styles.actions}>
          <button
            type="button"
            data-testid="new-run-button"
            onClick={() => onNewRun(seed)}
          >
            New run
          </button>
          <button type="button" data-testid="run-index-button" onClick={onRunIndex}>
            Run index
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.screen} aria-label="Title" data-testid="title-screen">
      <div className={styles.surface}>The Last Lantern</div>
      <div className={styles.titleBlock}>
        <h1>Everdeep</h1>
        <p data-testid="title-seed">Seed {model.seed}</p>
      </div>
      <div className={styles.actions}>
        {model.actions.includes("continue") ? (
          <button type="button" data-testid="continue-button" onClick={onContinue}>
            Continue
          </button>
        ) : null}
        <button
          type="button"
          data-testid="new-run-button"
          onClick={() => onNewRun(seed)}
        >
          New run
        </button>
        <button type="button" data-testid="run-index-button" onClick={onRunIndex}>
          Run index
        </button>
        <button type="button" data-testid="settings-button" onClick={onSettings}>
          Settings
        </button>
      </div>
      <button
        className={styles.seedButton}
        data-testid="reroll-seed-button"
        type="button"
        onClick={() => setSeed(createTitleSeed(Date.now() + 1))}
      >
        Reroll seed
      </button>
    </section>
  );
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea";
};
