"use client";

import { create } from "zustand";

import type { GameState } from "@engine/state";

export type ContextPanelMode = "inspect" | "inventory" | "quest" | "dialogue";

export type UiSlice = {
  readonly contextPanelMode: ContextPanelMode;
  readonly diaryOpen: boolean;
  readonly artifactOpen: boolean;
};

export type GameStore = {
  readonly gameState: GameState | null;
  readonly ui: UiSlice;
  readonly setGameState: (state: GameState) => void;
  readonly patchUi: (patch: Partial<UiSlice>) => void;
};

const defaultUi: UiSlice = {
  contextPanelMode: "inspect",
  diaryOpen: false,
  artifactOpen: false,
};

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,
  ui: defaultUi,
  setGameState: (gameState) => set({ gameState }),
  patchUi: (patch) =>
    set((current) => ({
      ui: { ...current.ui, ...patch },
    })),
}));
