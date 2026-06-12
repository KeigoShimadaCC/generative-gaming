import type { GameState } from "@engine/state";

import { deathToNewRunStepCount } from "@/components/settings/model";

export type TitleAction = "continue" | "new-run" | "run-index" | "settings";

export type TitleViewModel = {
  readonly hasActiveRun: boolean;
  readonly seed: string;
  readonly actions: readonly TitleAction[];
};

export type TerminalRunViewModel = {
  readonly outcome: "victory" | "defeat" | "abort";
  readonly depth: number;
  readonly turns: number;
  readonly discoveries: number;
  readonly nextRunStepCount: number;
};

export const createTitleSeed = (nowMs: number = Date.now()): string =>
  `lantern-${Math.max(0, Math.floor(nowMs)).toString(36)}`;

export const createTitleViewModel = ({
  activeRun,
  seed,
}: {
  readonly activeRun: GameState | null;
  readonly seed: string;
}): TitleViewModel => ({
  hasActiveRun: activeRun !== null,
  seed,
  actions: activeRun === null
    ? ["new-run", "run-index", "settings"]
    : ["continue", "new-run", "run-index", "settings"],
});

export const terminalRunViewModel = (
  state: GameState,
): TerminalRunViewModel | null => {
  switch (state.run.terminalStatus) {
    case "WIN":
      return {
        outcome: "victory",
        depth: state.run.depth,
        turns: state.run.turn,
        discoveries: Object.keys(state.entities).length,
        nextRunStepCount: deathToNewRunStepCount(),
      };
    case "LOSS":
      return {
        outcome: "defeat",
        depth: state.run.depth,
        turns: state.run.turn,
        discoveries: Object.keys(state.entities).length,
        nextRunStepCount: deathToNewRunStepCount(),
      };
    case "ABORTED":
      return {
        outcome: "abort",
        depth: state.run.depth,
        turns: state.run.turn,
        discoveries: Object.keys(state.entities).length,
        nextRunStepCount: deathToNewRunStepCount(),
      };
    case "ACTIVE":
      return null;
  }
};

export const nextRunMemoryNote = (view: TerminalRunViewModel): string => {
  switch (view.outcome) {
    case "victory":
      return "The Deep remembers what you carried into the light.";
    case "defeat":
      return "The Deep keeps the shape of the turn that ended you.";
    case "abort":
      return "The Deep remembers the retreat and the rooms left breathing.";
  }
};
