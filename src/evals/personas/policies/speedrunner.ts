import type { PersonaPolicy } from "../types.js";
import {
  abortIfFloorBudgetExceeded,
  descendIfAvailable,
  fallbackAction,
  moveTowardStairs,
  takeHoardIfAvailable,
} from "../../../harness/bots/policies/helpers.js";

/**
 * Signature: low explorationRatio and cellsVisited; minimal itemPickups; fast
 * depth progression by ignoring side content and rushing stairs.
 */
export const speedrunnerPolicy: PersonaPolicy = {
  name: "speedrunner",
  description:
    "Bee-lines to stairs, descends immediately, and ignores items, NPCs, and optional exploration.",
  signatureComment:
    "explorationRatio low; itemPickups low; depth-focused routing",
  decide: (view) =>
    takeHoardIfAvailable(view) ??
    descendIfAvailable(view) ??
    moveTowardStairs(view) ??
    abortIfFloorBudgetExceeded(view, 22) ??
    fallbackAction(view),
};
