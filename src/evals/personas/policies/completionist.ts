import type { PersonaPolicy } from "../types.js";
import {
  attackEnemy,
  descendIfAvailable,
  exploreUnvisited,
  fallbackAction,
  moveTowardNearestItem,
  moveTowardStairs,
  pickupIfAvailable,
  takeHoardIfAvailable,
  weakestEnemy,
  adjacentEnemies,
} from "../../../harness/bots/policies/helpers.js";
import {
  moveTowardNearestNpc,
  talkToFreshNpc,
} from "../helpers.js";

/**
 * Signature: explorationRatio high; npcTalksInitiated > 0; broad floor coverage
 * before descending; engages quests and content when available.
 */
export const completionistPolicy: PersonaPolicy = {
  name: "completionist",
  description:
    "Fully explores each floor, talks to every visible NPC, collects optional content, then descends.",
  signatureComment:
    "explorationRatio high; npcTalksInitiated > 0; cellsVisited high",
  decide: (view) =>
    takeHoardIfAvailable(view) ??
    talkToFreshNpc(view) ??
    moveTowardNearestNpc(view) ??
    pickupIfAvailable(view) ??
    moveTowardNearestItem(view, 12) ??
    exploreUnvisited(view, 200) ??
    attackEnemy(view, weakestEnemy(adjacentEnemies(view))) ??
    (view.floor.turn >= 55 ? descendIfAvailable(view) : null) ??
    moveTowardStairs(view) ??
    fallbackAction(view),
};
