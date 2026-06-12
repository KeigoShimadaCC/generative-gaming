"use client";

import { useEffect } from "react";

import { createDevFixtureState } from "@/store/fixture";
import { useGameStore } from "@/store/game-store";

export function DevFixtureHydrator() {
  const setGameState = useGameStore((state) => state.setGameState);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      setGameState(createDevFixtureState());
    }
  }, [setGameState]);

  return null;
}
