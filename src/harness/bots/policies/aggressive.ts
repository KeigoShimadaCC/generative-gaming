import type { BotPolicy } from "../types.js";
import {
  adjacentEnemies,
  abortIfFloorBudgetExceeded,
  attackEnemy,
  descendIfAvailable,
  fallbackAction,
  moveTowardHoard,
  moveTowardNearestEnemy,
  moveTowardStairs,
  pickupIfAvailable,
  takeHoardIfAvailable,
  useHealingItem,
  weakestEnemy,
} from "./helpers.js";

export const aggressivePolicy: BotPolicy = {
  name: "aggressive",
  description:
    "Closes distance, fights every visible enemy, takes only opportunistic pickups, and spends consumables only when survival is immediately at risk.",
  decide: (view) => {
    const adjacent = adjacentEnemies(view);

    return (
      takeHoardIfAvailable(view) ??
      (view.player.hp.ratio <= 0.22 ? useHealingItem(view, true) : null) ??
      attackEnemy(view, weakestEnemy(adjacent)) ??
      pickupIfAvailable(view) ??
      (view.floor.turn < 72 ? moveTowardNearestEnemy(view, 14) : null) ??
      abortIfFloorBudgetExceeded(view, 100) ??
      descendIfAvailable(view) ??
      moveTowardHoard(view) ??
      moveTowardStairs(view) ??
      fallbackAction(view)
    );
  },
};
