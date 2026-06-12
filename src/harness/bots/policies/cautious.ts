import type { BotPolicy } from "../types.js";
import {
  adjacentEnemies,
  abortIfFloorBudgetExceeded,
  attackEnemy,
  descendIfAvailable,
  exploreUnvisited,
  fallbackAction,
  moveTowardHoard,
  moveTowardNearestItem,
  moveTowardStairs,
  pickupIfAvailable,
  retreatAction,
  takeHoardIfAvailable,
  useHealingItem,
  weakestEnemy,
} from "./helpers.js";

export const cautiousPolicy: BotPolicy = {
  name: "cautious",
  description:
    "Retreats below 50% HP, spends healing early, avoids melee while outnumbered, clears visible resources, and explores conservatively before descending.",
  decide: (view) => {
    const adjacent = adjacentEnemies(view);

    return (
      takeHoardIfAvailable(view) ??
      (view.player.hp.ratio < 0.5 ? useHealingItem(view, true) : null) ??
      (view.player.hp.ratio < 0.5 ? retreatAction(view) : null) ??
      (adjacent.length > 1 ? retreatAction(view) : null) ??
      (view.player.hp.ratio <= 0.75 ? useHealingItem(view, false) : null) ??
      pickupIfAvailable(view) ??
      attackEnemy(view, weakestEnemy(adjacent)) ??
      (view.floor.turn < 42 ? moveTowardNearestItem(view, 7) : null) ??
      (view.floor.turn < 42
        ? exploreUnvisited(view, Math.min(18, 6 + view.run.depth))
        : null) ??
      abortIfFloorBudgetExceeded(view, 150) ??
      descendIfAvailable(view) ??
      moveTowardHoard(view) ??
      moveTowardStairs(view) ??
      fallbackAction(view)
    );
  },
};
