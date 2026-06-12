import type { BotPolicy } from "../types.js";
import {
  adjacentEnemies,
  abortIfFloorBudgetExceeded,
  attackEnemy,
  descendIfAvailable,
  fallbackAction,
  isFinalFloor,
  moveTowardNearestEnemy,
  moveTowardNearestItem,
  moveTowardStairs,
  pickupIfAvailable,
  pursueHoardOnFinalFloor,
  retreatAction,
  takeHoardIfAvailable,
  useEquipmentUpgrade,
  useHealingItem,
  useSafeUnidentifiedItem,
  useThrowableAgainstEnemy,
  weakestEnemy
} from "./helpers.js";

export const balancedPolicy: BotPolicy = {
  name: "balanced",
  description:
    "Uses healing at moderate risk, fights nearby threats, detours for close resources, and quaffs/read-to-identify only when the visible area is safe.",
  decide: (view) => {
    const adjacent = adjacentEnemies(view);

    if (isFinalFloor(view)) {
      return (
        takeHoardIfAvailable(view) ??
        (view.player.hp.ratio < 0.5 ? useHealingItem(view, true) : null) ??
        (view.player.hp.ratio <= 0.3 && adjacent.length > 0
          ? retreatAction(view)
          : null) ??
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
      (view.player.hp.ratio <= 0.3 && adjacent.length > 0
        ? retreatAction(view)
        : null) ??
      useEquipmentUpgrade(view) ??
      useThrowableAgainstEnemy(
        view,
        adjacent.length > 0 ? adjacent : view.visible.enemies
      ) ??
      pickupIfAvailable(view) ??
      useSafeUnidentifiedItem(view) ??
      attackEnemy(view, weakestEnemy(adjacent)) ??
      (view.floor.turn < 34 ? moveTowardNearestItem(view, 5) : null) ??
      (view.floor.turn < 50 ? moveTowardNearestEnemy(view, 6) : null) ??
      abortIfFloorBudgetExceeded(view, 130) ??
      descendIfAvailable(view) ??
      moveTowardStairs(view) ??
      fallbackAction(view)
    );
  }
};
