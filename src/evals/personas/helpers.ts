import type { RunAction } from "../../engine/run/loop.js";
import type { MoveDirection } from "../../engine/turn/index.js";
import type { Position } from "../../engine/state/index.js";
import type { BotStateView, BotVisibleNpc } from "../../harness/bots/types.js";
import {
  actionOfKind,
  chebyshev,
  hasAction,
} from "../../harness/bots/policies/helpers.js";

const DIRECTION_BY_DELTA = new Map<string, MoveDirection>([
  ["-1,-1", "northwest"],
  ["0,-1", "north"],
  ["1,-1", "northeast"],
  ["-1,0", "west"],
  ["1,0", "east"],
  ["-1,1", "southwest"],
  ["0,1", "south"],
  ["1,1", "southeast"],
]);

export const talkToNpc = (
  view: BotStateView,
  npc: BotVisibleNpc,
): RunAction | null => {
  const action = { kind: "talk", npcId: npc.id } as const;
  return hasAction(view, action) ? action : null;
};

export const talkToNearestNpc = (view: BotStateView): RunAction | null => {
  const sorted = [...view.visible.npcs].sort(
    (left, right) =>
      chebyshev(view.player.position, left.position) -
        chebyshev(view.player.position, right.position) ||
      left.id.localeCompare(right.id),
  );
  const adjacent = sorted.find(
    (npc) => chebyshev(view.player.position, npc.position) <= 1,
  );
  if (adjacent !== undefined) {
    return talkToNpc(view, adjacent);
  }
  return null;
};

const talkedNpcKeys = new Map<string, Set<string>>();

export const resetPersonaHelperState = (): void => {
  talkedNpcKeys.clear();
};

export const talkToFreshNpc = (view: BotStateView): RunAction | null => {
  const floorKey = `${view.run.seed}:${view.run.depth}`;
  const talked = talkedNpcKeys.get(floorKey) ?? new Set<string>();
  const sorted = [...view.visible.npcs].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  for (const npc of sorted) {
    if (talked.has(npc.id)) {
      continue;
    }
    const action = talkToNpc(view, npc);
    if (action !== null) {
      talked.add(npc.id);
      talkedNpcKeys.set(floorKey, talked);
      return action;
    }
  }

  return null;
};

export const moveTowardNearestNpc = (view: BotStateView): RunAction | null => {
  const npc = nearestNpc(view);
  if (npc === null) {
    return null;
  }

  const moves = view.availableActions.filter(
    (action): action is Extract<RunAction, { readonly kind: "move" }> =>
      action.kind === "move",
  );
  if (moves.length === 0) {
    return null;
  }

  const ranked = moves
    .map((action) => ({
      action,
      distance: chebyshev(
        moveDestination(view.player.position, action.direction),
        npc.position,
      ),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        actionKey(left.action).localeCompare(actionKey(right.action)),
    );

  return ranked[0]?.action ?? null;
};

export const waitAction = (view: BotStateView): RunAction | null =>
  actionOfKind(view, "wait");

export const chooseRandomLegalAction = (view: BotStateView): RunAction => {
  const actions = [...view.availableActions];
  if (actions.length === 0) {
    return { kind: "abort" };
  }
  const index = view.chooseIndex("chaos-action", actions.length);
  return actions[index] ?? actions[0] ?? { kind: "abort" };
};

const nearestNpc = (view: BotStateView): BotVisibleNpc | null => {
  const sorted = [...view.visible.npcs].sort(
    (left, right) =>
      chebyshev(view.player.position, left.position) -
        chebyshev(view.player.position, right.position) ||
      left.id.localeCompare(right.id),
  );
  return sorted[0] ?? null;
};

const moveDestination = (
  origin: Position,
  direction: MoveDirection,
): Position => {
  for (const [delta, candidate] of DIRECTION_BY_DELTA.entries()) {
    if (candidate !== direction) {
      continue;
    }
    const [x, y] = delta.split(",").map((part) => Number.parseInt(part, 10));
    return {
      x: origin.x + (x ?? 0),
      y: origin.y + (y ?? 0),
    };
  }
  return origin;
};

const actionKey = (action: RunAction): string =>
  JSON.stringify(action, Object.keys(action).sort());
