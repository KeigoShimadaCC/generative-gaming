import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GameGrid } from "@/components/grid";
import { createClientGameSession } from "@/input/game-session";
import { createInitialState } from "@engine/state";

import {
  ACTIVE_RUN_STORAGE_KEY,
  RUN_INDEX_STORAGE_KEY,
  clearActiveRun,
  formatRunDate,
  loadActiveRun,
  loadRunIndex,
  runIndexEntryFromState,
  saveActiveRun,
  upsertRunIndexEntry,
  type RunIndexStorage,
} from "./model";
import { buildReplayFrames } from "./replay";

describe("run index", () => {
  it("stores list rows by outcome, depth, and date with active-run persistence", () => {
    const storage = new MemoryStorage();
    const state = {
      ...createInitialState("run-index-store"),
      run: {
        ...createInitialState("run-index-store").run,
        terminalStatus: "LOSS" as const,
        depth: 3,
        turn: 42,
      },
    };
    const entry = runIndexEntryFromState({
      state,
      createdAt: "2026-06-12T01:02:03.000Z",
      traceContent: "{}\n",
    });

    expect(entry).toMatchObject({
      outcome: "defeat",
      depth: 3,
      turns: 42,
    });
    expect(formatRunDate(entry.createdAt)).toBe("2026-06-12");
    upsertRunIndexEntry(storage, entry);
    expect(loadRunIndex(storage)).toEqual([entry]);
    expect(storage.getItem(RUN_INDEX_STORAGE_KEY)).toContain(entry.runId);

    saveActiveRun(storage, {
      runId: state.run.runId,
      seed: state.run.seed,
      createdAt: entry.createdAt,
      gameState: state,
      traceContent: entry.traceContent,
    });
    expect(loadActiveRun(storage)?.runId).toBe(state.run.runId);
    clearActiveRun(storage);
    expect(storage.getItem(ACTIVE_RUN_STORAGE_KEY)).toBeNull();
  });

  it("steps a fixture trace through replay verification and the real grid renderer", () => {
    const session = createClientGameSession({ seed: "run-index-replay" });
    session.step({ kind: "wait" });
    session.step({ kind: "wait" });
    const replay = buildReplayFrames(session.traceContent);

    expect(replay.status).toBe("identical");
    expect(replay.frames).toHaveLength(3);
    const frame = replay.frames[1];
    if (frame === undefined) {
      throw new Error("expected replay frame");
    }

    const markup = renderToStaticMarkup(createElement(GameGrid, { state: frame.state }));
    expect(markup).toContain('role="grid"');
    expect(markup).toContain('data-glyph="@');
  });
});

class MemoryStorage implements RunIndexStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}
