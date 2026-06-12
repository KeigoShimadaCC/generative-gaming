"use client";

import { useMemo, useState } from "react";

import { GameGrid } from "@/components/grid";

import styles from "./RunIndexScreen.module.css";
import {
  formatRunDate,
  type RunIndexEntry,
} from "./model";
import { buildReplayFrames } from "./replay";

type RunIndexScreenProps = {
  readonly runs: readonly RunIndexEntry[];
  readonly onBack: () => void;
};

export function RunIndexScreen({ runs, onBack }: RunIndexScreenProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    runs[0]?.runId ?? null,
  );
  const selectedRun =
    runs.find((run) => run.runId === selectedRunId) ?? runs[0] ?? null;

  return (
    <section className={styles.screen} aria-label="Run index" data-testid="run-index">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>The Last Lantern</div>
          <h1>Run index</h1>
        </div>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </div>

      <div className={styles.layout}>
        <div className={styles.list} aria-label="Runs">
          {runs.length === 0 ? (
            <div className={styles.empty}>No runs recorded</div>
          ) : (
            runs.map((run) => (
              <button
                className={run.runId === selectedRun?.runId ? styles.selected : ""}
                data-outcome={run.outcome}
                data-run-id={run.runId}
                data-selected={run.runId === selectedRun?.runId ? "true" : "false"}
                data-testid="run-index-entry"
                key={run.runId}
                type="button"
                onClick={() => setSelectedRunId(run.runId)}
              >
                <span>{run.outcome}</span>
                <strong>D{run.depth}</strong>
                <time>{formatRunDate(run.createdAt)}</time>
              </button>
            ))
          )}
        </div>

        <div className={styles.detail}>
          {selectedRun === null ? (
            <div className={styles.empty}>Select a run</div>
          ) : (
            <RunDetail run={selectedRun} />
          )}
        </div>
      </div>
    </section>
  );
}

function RunDetail({ run }: { readonly run: RunIndexEntry }) {
  const replay = useMemo(
    () => buildReplayFrames(run.traceContent),
    [run.traceContent],
  );
  const [frameIndex, setFrameIndex] = useState(0);
  const clampedFrameIndex = Math.min(
    frameIndex,
    Math.max(0, replay.frames.length - 1),
  );
  const frame = replay.frames[clampedFrameIndex] ?? null;

  return (
    <>
      <div className={styles.meta}>
        <span>Seed {run.seed}</span>
        <span>{run.turns} turns</span>
        <span data-replay-status={replay.status}>{replay.status}</span>
      </div>
      <div className={styles.replayControls}>
        <button
          type="button"
          disabled={clampedFrameIndex <= 0}
          onClick={() => setFrameIndex((value) => Math.max(0, value - 1))}
        >
          Prev
        </button>
        <span>
          {clampedFrameIndex + 1}/{Math.max(1, replay.frames.length)}
        </span>
        <button
          type="button"
          disabled={clampedFrameIndex >= replay.frames.length - 1}
          onClick={() =>
            setFrameIndex((value) => Math.min(replay.frames.length - 1, value + 1))
          }
        >
          Next
        </button>
      </div>
      <div className={styles.replayGrid}>
        <GameGrid state={frame?.state ?? null} />
      </div>
      <a className={styles.diaryStub} href="#diary-slot" aria-disabled="true">
        Diary slot
      </a>
    </>
  );
}
