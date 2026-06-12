import type { PersonaPolicy } from "../types.js";
import {
  descendIfAvailable,
  exploreUnvisited,
  fallbackAction,
  moveTowardStairs,
  noNearbyEnemies,
  pickupIfAvailable,
  retreatAction,
  takeHoardIfAvailable,
} from "../../../harness/bots/policies/helpers.js";

/**
 * Signature: combatEngagementRate ~0; fightsPicked === 0; high fightsAvoided
 * when enemies are present; retreats before any voluntary melee.
 */
export const pacifistPolicy: PersonaPolicy = {
  name: "pacifist",
  description:
    "Flees from every visible threat, never initiates combat, and routes around enemies toward exits.",
  signatureComment:
    "combatEngagementRate ~0; fightsPicked 0; fightsAvoided high",
  decide: (view) => {
    if (view.visible.enemies.length > 0) {
      return (
        retreatAction(view) ??
        moveTowardStairs(view) ??
        exploreUnvisited(view, 80) ??
        fallbackAction(view)
      );
    }

    return (
      takeHoardIfAvailable(view) ??
      (noNearbyEnemies(view, 3) ? pickupIfAvailable(view) : null) ??
      exploreUnvisited(view, 100) ??
      descendIfAvailable(view) ??
      moveTowardStairs(view) ??
      fallbackAction(view)
    );
  },
};
