"use client";

import { create } from "zustand";

import {
  createClientGameSession,
  type ClientGameSession,
  type ClientGameSessionStep,
} from "@/input/game-session";
import type { RunAction } from "@engine/run";
import type { GameState } from "@engine/state";

export type ContextPanelMode = "inspect" | "inventory" | "quest" | "dialogue";

export type PendingConfirm = {
  readonly action: RunAction;
  readonly prompt: string;
};

export type InputFeedbackActionKind = Exclude<RunAction["kind"], "take_hoard">;

export type UiSlice = {
  readonly contextPanelMode: ContextPanelMode;
  readonly diaryOpen: boolean;
  readonly artifactOpen: boolean;
  readonly keymapOpen: boolean;
  readonly pendingConfirm: PendingConfirm | null;
  readonly inputLocked: boolean;
};

export type GameStore = {
  readonly gameState: GameState | null;
  readonly gameSession: ClientGameSession | null;
  readonly ui: UiSlice;
  readonly startGameSession: (options: { readonly seed: string }) => void;
  readonly setGameState: (state: GameState) => void;
  readonly dispatchAction: (action: RunAction) => ClientGameSessionStep | null;
  readonly appendInputFeedback: (
    actionKind: InputFeedbackActionKind,
    reason: string,
  ) => void;
  readonly setInputLocked: (inputLocked: boolean) => void;
  readonly patchUi: (patch: Partial<UiSlice>) => void;
};

export const defaultUi: UiSlice = {
  contextPanelMode: "inspect",
  diaryOpen: false,
  artifactOpen: false,
  keymapOpen: false,
  pendingConfirm: null,
  inputLocked: false,
};

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  gameSession: null,
  ui: defaultUi,
  startGameSession: ({ seed }) => {
    const gameSession = createClientGameSession({ seed });
    set({
      gameSession,
      gameState: gameSession.state,
      ui: defaultUi,
    });
  },
  setGameState: (gameState) =>
    set((current) => {
      current.gameSession?.replaceState(gameState);
      return { gameState };
    }),
  dispatchAction: (action) => {
    const session = get().gameSession;
    if (session === null) {
      return null;
    }

    const result = session.step(action);
    set({ gameState: result.state });
    return result;
  },
  appendInputFeedback: (actionKind, reason) =>
    set((current) => {
      if (current.gameState === null) {
        return {};
      }

      const event = {
        turn: current.gameState.run.turn,
        type: "action_illegal",
        data: {
          actionKind,
          reason,
        },
      } as const satisfies GameState["log"][number];
      const gameState = {
        ...current.gameState,
        log: [...current.gameState.log, event],
      };

      current.gameSession?.replaceState(gameState);

      return { gameState };
    }),
  setInputLocked: (inputLocked) =>
    set((current) => ({
      ui: { ...current.ui, inputLocked },
    })),
  patchUi: (patch) =>
    set((current) => ({
      ui: { ...current.ui, ...patch },
    })),
}));
