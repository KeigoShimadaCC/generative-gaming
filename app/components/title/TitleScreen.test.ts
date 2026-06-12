import { describe, expect, it } from "vitest";

import { createInitialState, type GameState } from "@engine/state";

import {
  createTitleSeed,
  createTitleViewModel,
  nextRunMemoryNote,
  terminalRunViewModel,
} from "./model";

describe("title flow model", () => {
  it("shows continue only when an active run exists and keeps a visible seed for new run", () => {
    const noActive = createTitleViewModel({
      activeRun: null,
      seed: createTitleSeed(123_456),
    });
    expect(noActive.seed).toBe("lantern-2n9c");
    expect(noActive.actions).toEqual(["new-run", "run-index", "settings"]);

    const active = createTitleViewModel({
      activeRun: createInitialState("title-active"),
      seed: "lantern-fixed",
    });
    expect(active.actions).toEqual([
      "continue",
      "new-run",
      "run-index",
      "settings",
    ]);
  });

  it("collapses death-to-new-run to diary plus one key within the phase step budget", () => {
    const terminal = terminalRunViewModel(terminalState("LOSS"));

    expect(terminal).toMatchObject({
      outcome: "defeat",
      depth: 4,
      turns: 33,
      nextRunStepCount: 2,
    });
    if (terminal === null) {
      throw new Error("expected terminal view");
    }
    expect(nextRunMemoryNote(terminal)).toContain("ended you");
  });

  it("labels victory, defeat, and aborted outcomes for the run index frame", () => {
    expect(terminalRunViewModel(terminalState("WIN"))?.outcome).toBe("victory");
    expect(terminalRunViewModel(terminalState("LOSS"))?.outcome).toBe("defeat");
    expect(terminalRunViewModel(terminalState("ABORTED"))?.outcome).toBe("abort");
    expect(terminalRunViewModel(createInitialState("active"))).toBeNull();
  });
});

const terminalState = (
  terminalStatus: "WIN" | "LOSS" | "ABORTED",
): GameState => {
  const base = createInitialState(`title-${terminalStatus}`);

  return {
    ...base,
    run: {
      ...base.run,
      depth: 4,
      turn: 33,
      terminalStatus,
    },
  };
};
