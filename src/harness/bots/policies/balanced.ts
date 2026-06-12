import type { BotPolicy } from "../types.js";
import {
  adjacentEnemies,
  abortIfFloorBudgetExceeded,
  attackEnemy,
  descendIfAvailable,
  fallbackAction,
  moveTowardHoard,
  moveTowardNearestEnemy,
  moveTowardNearestItem,
  moveTowardStairs,
  pickupIfAvailable,
  retreatAction,
  takeHoardIfAvailable,
  useHealingItem,
  useSafeUnidentifiedItem,
  weakestEnemy,
} from "./helpers.js";

export const balancedPolicy: BotPolicy = {
  name: "balanced",
  description:
    "Uses healing at moderate risk, fights nearby threats, detours for close resources, and quaffs/read-to-identify only when the visible area is safe.",
  decide: (view) => {
    const adjacent = adjacentEnemies(view);

    return (
      takeHoardIfAvailable(view) ??
      (view.player.hp.ratio <= 0.45 ? useHealingItem(view, true) : null) ??
      (view.player.hp.ratio <= 0.3 && adjacent.length > 0
        ? retreatAction(view)
        : null) ??
      pickupIfAvailable(view) ??
      useSafeUnidentifiedItem(view) ??
      attackEnemy(view, weakestEnemy(adjacent)) ??
      (view.floor.turn < 34 ? moveTowardNearestItem(view, 5) : null) ??
      (view.floor.turn < 50 ? moveTowardNearestEnemy(view, 6) : null) ??
      abortIfFloorBudgetExceeded(view, 130) ??
      descendIfAvailable(view) ??
      moveTowardHoard(view) ??
      moveTowardStairs(view) ??
      fallbackAction(view)
    );
  },
};
