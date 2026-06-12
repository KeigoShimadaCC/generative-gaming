import type { BotPolicy } from "../types.js";
import {
  adjacentEnemies,
  abortIfFloorBudgetExceeded,
  attackEnemy,
  descendIfAvailable,
  fallbackAction,
  isFinalFloor,
  moveTowardNearestEnemy,
  moveTowardStairs,
  pickupIfAvailable,
  pursueHoardOnFinalFloor,
  takeHoardIfAvailable,
  useEquipmentUpgrade,
  useHealingItem,
  useThrowableAgainstEnemy,
  weakestEnemy
} from "./helpers.js";

export const aggressivePolicy: BotPolicy = {
  name: "aggressive",
  description:
    "Closes distance, fights every visible enemy, takes only opportunistic pickups, and spends consumables only when survival is immediately at risk.",
  decide: (view) => {
    const adjacent = adjacentEnemies(view);

    if (isFinalFloor(view)) {
      return (
        takeHoardIfAvailable(view) ??
        (view.player.hp.ratio < 0.5 ? useHealingItem(view, true) : null) ??
        useThrowableAgainstEnemy(
          view,
          adjacent.length > 0 ? adjacent : view.visible.enemies
        ) ??
        attackEnemy(view, weakestEnemy(adjacent)) ??
        pursueHoardOnFinalFloor(view, 600) ??
        abortIfFloorBudgetExceeded(view, 200) ??
        fallbackAction(view)
      );
    }

    return (
      (view.player.hp.ratio < 0.5 ? useHealingItem(view, true) : null) ??
      useEquipmentUpgrade(view) ??
      useThrowableAgainstEnemy(
        view,
        adjacent.length > 0 ? adjacent : view.visible.enemies
      ) ??
      attackEnemy(view, weakestEnemy(adjacent)) ??
      pickupIfAvailable(view) ??
      (view.floor.turn < 72 ? moveTowardNearestEnemy(view, 14) : null) ??
      abortIfFloorBudgetExceeded(view, 100) ??
      descendIfAvailable(view) ??
      moveTowardStairs(view) ??
      fallbackAction(view)
    );
  }
};
