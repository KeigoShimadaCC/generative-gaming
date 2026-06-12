import type { PersonaPolicy } from "../types.js";
import { chooseRandomLegalAction } from "../helpers.js";

/**
 * Signature: erratic action mix seeded per turn; traces differ across the seed
 * family but regenerate byte-identically for the same seed.
 */
export const chaosPolicy: PersonaPolicy = {
  name: "chaos",
  description:
    "Chooses among legal actions with seeded randomness, biasing toward non-move actions when available.",
  signatureComment:
    "high action-kind entropy; seed-family variance; per-seed determinism",
  decide: (view) => {
    const nonMove = view.availableActions.filter((action) => action.kind !== "move");
    if (nonMove.length > 0 && view.chooseIndex("chaos-bias", 100) < 55) {
      const index = view.chooseIndex("chaos-action", nonMove.length);
      return nonMove[index] ?? chooseRandomLegalAction(view);
    }
    return chooseRandomLegalAction(view);
  },
};
