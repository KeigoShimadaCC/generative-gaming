"use client";

import { useEffect } from "react";

import { DEV_FIXTURE_SEED } from "@/store/fixture";
import { useGameStore } from "@/store/game-store";

export function DevFixtureHydrator() {
  const startGameSession = useGameStore((state) => state.startGameSession);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      startGameSession({ seed: DEV_FIXTURE_SEED });
    }
  }, [startGameSession]);

  return null;
}
