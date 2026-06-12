import type { PersonaPolicy } from "../types.js";
import {
  descendIfAvailable,
  exploreUnvisited,
  fallbackAction,
  moveTowardNearestItem,
  moveTowardStairs,
  pickupIfAvailable,
  takeHoardIfAvailable,
  useFoodItem,
} from "../../../harness/bots/policies/helpers.js";

/**
 * Signature: itemPickups >> itemUses; hoardingSignal well above 1; low combat
 * engagement because looting detours dominate over fighting.
 */
export const hoarderPolicy: PersonaPolicy = {
  name: "hoarder",
  description:
    "Picks up every visible item, detours widely for ground loot, and barely spends consumables.",
  signatureComment:
    "pickups >> uses; hoardingSignal high; combatEngagementRate low",
  decide: (view) =>
    takeHoardIfAvailable(view) ??
    pickupIfAvailable(view) ??
    (view.player.fullness.ratio <= 0.15 ? useFoodItem(view) : null) ??
    moveTowardNearestItem(view) ??
    exploreUnvisited(view, 120) ??
    descendIfAvailable(view) ??
    moveTowardStairs(view) ??
    fallbackAction(view),
};
