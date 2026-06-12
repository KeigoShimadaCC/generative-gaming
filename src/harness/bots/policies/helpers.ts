import { config } from "../../../config/index.js";
import type { RunAction } from "../../../engine/run/loop.js";
import type { MoveDirection } from "../../../engine/turn/index.js";
import type { Position } from "../../../engine/state/index.js";
import type {
  BotKnownCell,
  BotKnownFeature,
  BotKnownItem,
  BotStateView,
  BotVisibleEnemy
} from "../types.js";

export const FINAL_FLOOR_DEPTH = config.runStructure.depthFloors;

const DIRECTION_BY_DELTA = new Map<string, MoveDirection>([
  ["-1,-1", "northwest"],
  ["0,-1", "north"],
  ["1,-1", "northeast"],
  ["-1,0", "west"],
  ["1,0", "east"],
  ["-1,1", "southwest"],
  ["0,1", "south"],
  ["1,1", "southeast"]
]);

const WALKABLE_TERRAINS = new Set([
  "floor",
  "door",
  "water",
  "stairs_down",
  "entrance"
]);

export type RouteOptions = {
  readonly avoidKnownTraps?: boolean;
  readonly avoidEnemies?: boolean;
  readonly avoidRecent?: boolean;
};

export const actionKey = (action: RunAction): string =>
  JSON.stringify(action, Object.keys(action).sort());

export const hasAction = (view: BotStateView, action: RunAction): boolean =>
  view.availableActions.some((candidate) => {
    if (actionKey(candidate) === actionKey(action)) {
      return true;
    }

    return (
      candidate.kind === "use_item" &&
      action.kind === "use_item" &&
      candidate.itemId === action.itemId
    );
  });

export const actionOfKind = <Kind extends RunAction["kind"]>(
  view: BotStateView,
  kind: Kind
): Extract<RunAction, { readonly kind: Kind }> | null =>
  view.availableActions.find(
    (action): action is Extract<RunAction, { readonly kind: Kind }> =>
      action.kind === kind
  ) ?? null;

export const adjacentEnemies = (
  view: BotStateView
): readonly BotVisibleEnemy[] =>
  view.visible.enemies
    .filter((enemy) => chebyshev(view.player.position, enemy.position) <= 1)
    .sort(compareEnemies);

export const weakestEnemy = (
  enemies: readonly BotVisibleEnemy[]
): BotVisibleEnemy | null => [...enemies].sort(compareEnemies)[0] ?? null;

export const attackEnemy = (
  view: BotStateView,
  enemy: BotVisibleEnemy | null
): RunAction | null => {
  if (enemy === null) {
    return null;
  }

  const action = { kind: "attack", targetId: enemy.id } as const;
  return hasAction(view, action) ? action : null;
};

export const retreatAction = (view: BotStateView): RunAction | null => {
  const moves = moveActions(view);
  if (moves.length === 0 || view.visible.enemies.length === 0) {
    return null;
  }

  const trapKeys = new Set(
    view.visible.traps.map((trap) => key(trap.position))
  );
  const candidates = moves
    .map((action) => {
      const destination = moveDestination(
        view.player.position,
        action.direction
      );
      const nearestEnemyDistance = Math.min(
        ...view.visible.enemies.map((enemy) =>
          chebyshev(destination, enemy.position)
        )
      );
      const trapPenalty = trapKeys.has(key(destination)) ? 100 : 0;
      return { action, destination, score: nearestEnemyDistance - trapPenalty };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return key(left.destination).localeCompare(key(right.destination));
    });

  return candidates[0]?.action ?? null;
};

export const useHealingItem = (
  view: BotStateView,
  includeUnidentifiedDraught: boolean
): RunAction | null => {
  if (view.player.hp.current >= view.player.hp.max) {
    return null;
  }

  const item = view.player.inventory.find((candidate) => {
    if (
      candidate.effectsKnown &&
      candidate.effects.some((effect) => effect.kind === "heal")
    ) {
      return true;
    }

    return includeUnidentifiedDraught && candidate.category === "draught";
  });

  return itemAction(view, item);
};

export const useFoodItem = (view: BotStateView): RunAction | null => {
  if (view.player.fullness.current >= view.player.fullness.max) {
    return null;
  }

  const item = view.player.inventory.find(
    (candidate) => candidate.category === "food"
  );
  return itemAction(view, item);
};

export const useEquipmentUpgrade = (view: BotStateView): RunAction | null => {
  const weapon = bestEquipmentCandidate(
    view.player.inventory.filter(
      (item) => item.category === "weapon" && !isBlockedItemUse(view, item)
    ),
    view.player.equipment.weapon
  );
  const armor = bestEquipmentCandidate(
    view.player.inventory.filter(
      (item) => item.category === "armor" && !isBlockedItemUse(view, item)
    ),
    view.player.equipment.armor
  );
  const equippedCharmIds = new Set(
    view.player.equipment.charms
      .map((charm) => charm.itemInstanceId)
      .filter((itemInstanceId): itemInstanceId is string => itemInstanceId !== null)
  );
  const charm = view.player.inventory.find(
    (item) =>
      item.category === "charm" &&
      item.itemInstanceId !== null &&
      !equippedCharmIds.has(item.itemInstanceId) &&
      !isBlockedItemUse(view, item)
  );

  return itemAction(view, weapon ?? armor ?? charm);
};

export const useThrowableAgainstEnemy = (
  view: BotStateView,
  enemies: readonly BotVisibleEnemy[] = view.visible.enemies
): RunAction | null => {
  const item = view.player.inventory.find(
    (candidate) => candidate.category === "throwable"
  );

  if (item?.itemInstanceId === null || item?.itemInstanceId === undefined) {
    return null;
  }

  const target = [...enemies]
    .map((enemy) => ({
      enemy,
      direction: directionToward(view.player.position, enemy.position),
      distance: chebyshev(view.player.position, enemy.position)
    }))
    .filter(
      (
        candidate
      ): candidate is {
        readonly enemy: BotVisibleEnemy;
        readonly direction: MoveDirection;
        readonly distance: number;
      } => candidate.direction !== null && candidate.distance > 0
    )
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }

      return compareEnemies(left.enemy, right.enemy);
    })[0];

  if (target === undefined) {
    return null;
  }

  const action = {
    kind: "use_item",
    itemId: item.itemInstanceId,
    direction: target.direction
  } as const;

  return guardedItemAction(view, hasAction(view, action) ? action : null);
};

export const useRevealTool = (view: BotStateView): RunAction | null => {
  const item = view.player.inventory.find(
    (candidate) =>
      candidate.effectsKnown &&
      candidate.effects.some((effect) => effect.kind === "reveal")
  );

  return itemAction(view, item);
};

export const useSafeUnidentifiedItem = (
  view: BotStateView
): RunAction | null => {
  const safe = noNearbyEnemies(view, 4) && view.player.hp.ratio >= 0.7;
  if (!safe || view.player.hp.current >= view.player.hp.max) {
    return null;
  }

  const item = view.player.inventory.find(
    (candidate) => !candidate.effectsKnown && candidate.category === "draught"
  );

  return itemAction(view, item);
};

export const pickupIfAvailable = (view: BotStateView): RunAction | null =>
  actionOfKind(view, "pickup");

export const isFinalFloor = (view: BotStateView): boolean =>
  view.run.depth === FINAL_FLOOR_DEPTH;

export const hoardOnCurrentFloor = (
  view: BotStateView
): BotKnownFeature | null => {
  for (const feature of view.visible.features) {
    if (feature.kind === "hoard" && feature.depth === view.run.depth) {
      return feature;
    }
  }

  return null;
};

export const hoardKnownOnFloor = (view: BotStateView): boolean =>
  hoardOnCurrentFloor(view) !== null;

export const standingOnKnownHoardTile = (view: BotStateView): boolean => {
  const hoard = hoardOnCurrentFloor(view);
  return (
    hoard !== null && samePosition(hoard.position, view.player.position)
  );
};

export const takeHoardIfAvailable = (view: BotStateView): RunAction | null => {
  if (!standingOnKnownHoardTile(view)) {
    return null;
  }

  return actionOfKind(view, "take_hoard");
};

export const exploreForHoard = (
  view: BotStateView,
  budgetTurns: number
): RunAction | null => {
  if (hoardKnownOnFloor(view)) {
    return null;
  }

  return exploreUnvisited(view, budgetTurns);
};

export const pursueHoardOnFinalFloor = (
  view: BotStateView,
  exploreBudget = 600
): RunAction | null => {
  if (!isFinalFloor(view)) {
    return null;
  }

  return (
    takeHoardIfAvailable(view) ??
    (hoardKnownOnFloor(view)
      ? moveTowardHoard(view)
      : exploreUnvisited(view, exploreBudget))
  );
};

export const descendIfAvailable = (view: BotStateView): RunAction | null =>
  actionOfKind(view, "descend");

export const abortIfFloorBudgetExceeded = (
  view: BotStateView,
  budgetTurns: number
): RunAction | null =>
  view.floor.turn > budgetTurns ? actionOfKind(view, "abort") : null;

export const moveTowardNearestItem = (
  view: BotStateView,
  maxDistance?: number
): RunAction | null => {
  const route = nearestRoute(
    view,
    view.visible.groundItems
      .map((item) => item.position)
      .filter((position): position is Position => position !== null),
    { avoidKnownTraps: true, avoidEnemies: true }
  );

  if (
    route === null ||
    (maxDistance !== undefined && route.length - 1 > maxDistance)
  ) {
    return null;
  }

  return actionFromRoute(view, route);
};

export const moveTowardNearestEnemy = (
  view: BotStateView,
  maxDistance?: number
): RunAction | null => {
  const targets = view.visible.enemies.flatMap((enemy) =>
    walkableNeighbors(view, enemy.position)
  );
  const route = nearestRoute(view, targets, {
    avoidKnownTraps: true,
    avoidEnemies: true
  });

  if (
    route === null ||
    (maxDistance !== undefined && route.length - 1 > maxDistance)
  ) {
    return null;
  }

  return actionFromRoute(view, route);
};

export const moveTowardStairs = (view: BotStateView): RunAction | null => {
  const conservative = nearestRoute(
    view,
    view.map.cells
      .filter((cell) => cell.terrain === "stairs_down")
      .map((cell) => cell.position),
    { avoidKnownTraps: true, avoidEnemies: true }
  );
  const route =
    conservative ??
    nearestRoute(
      view,
      view.map.cells
        .filter((cell) => cell.terrain === "stairs_down")
        .map((cell) => cell.position),
      { avoidKnownTraps: true, avoidEnemies: false }
    );

  return route === null ? null : actionFromRoute(view, route);
};

export const moveTowardHoard = (view: BotStateView): RunAction | null => {
  const targets = view.visible.features
    .filter(
      (feature) => feature.kind === "hoard" && feature.depth === view.run.depth
    )
    .map((feature) => feature.position);
  const conservative = nearestRoute(view, targets, {
    avoidKnownTraps: true,
    avoidEnemies: true
  });
  const route =
    conservative ??
    nearestRoute(view, targets, {
      avoidKnownTraps: true,
      avoidEnemies: false
    });

  return route === null ? null : actionFromRoute(view, route);
};

export const exploreUnvisited = (
  view: BotStateView,
  budgetTurns: number
): RunAction | null => {
  if (view.floor.turn >= budgetTurns) {
    return null;
  }

  const visitedKeys = new Set(view.map.visited.map(key));
  const route = nearestRoute(
    view,
    view.map.cells
      .filter(
        (cell) => isWalkable(cell) && !visitedKeys.has(key(cell.position))
      )
      .map((cell) => cell.position),
    { avoidKnownTraps: true, avoidEnemies: true, avoidRecent: true }
  );

  return route === null ? null : actionFromRoute(view, route);
};

export const fallbackAction = (view: BotStateView): RunAction => {
  const productive =
    takeHoardIfAvailable(view) ??
    descendIfAvailable(view) ??
    pickupIfAvailable(view) ??
    attackEnemy(view, weakestEnemy(adjacentEnemies(view))) ??
    moveTowardStairs(view);

  if (productive !== null) {
    return productive;
  }

  return actionOfKind(view, "wait") ?? { kind: "abort" };
};

export const noNearbyEnemies = (
  view: BotStateView,
  distance: number
): boolean =>
  view.visible.enemies.every(
    (enemy) => chebyshev(view.player.position, enemy.position) > distance
  );

export const chebyshev = (left: Position, right: Position): number =>
  Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));

type KitUseMemory = {
  readonly lastItemActionKey: string | null;
  readonly kitSignatureAtLastUse: string | null;
  readonly blockedItemIds: ReadonlySet<string>;
};

const kitUseMemoryBySeed = new Map<string, KitUseMemory>();

export const resetKitUseMemoryForTests = (): void => {
  kitUseMemoryBySeed.clear();
};

const emptyKitUseMemory = (): KitUseMemory => ({
  lastItemActionKey: null,
  kitSignatureAtLastUse: null,
  blockedItemIds: new Set(),
});

const kitSignature = (view: BotStateView): string =>
  JSON.stringify({
    hp: view.player.hp.current,
    statuses: [...view.player.statuses].sort(),
    weapon: view.player.equipment.weapon?.itemInstanceId ?? null,
    armor: view.player.equipment.armor?.itemInstanceId ?? null,
    charms: view.player.equipment.charms
      .map((charm) => charm.itemInstanceId)
      .filter((itemInstanceId): itemInstanceId is string => itemInstanceId !== null)
      .sort(),
  });

const isBlockedItemUse = (
  view: BotStateView,
  item: BotKnownItem | undefined | null
): boolean => {
  if (item?.itemInstanceId === null || item?.itemInstanceId === undefined) {
    return false;
  }

  return kitUseMemoryBySeed
    .get(view.run.seed)
    ?.blockedItemIds.has(item.itemInstanceId) ?? false;
};

const guardedItemAction = (
  view: BotStateView,
  action: RunAction | null
): RunAction | null => {
  if (action?.kind !== "use_item") {
    return action;
  }

  const memory = kitUseMemoryBySeed.get(view.run.seed) ?? emptyKitUseMemory();
  if (memory.blockedItemIds.has(action.itemId)) {
    return null;
  }

  const signature = kitSignature(view);
  const key = actionKey(action);
  if (
    memory.lastItemActionKey === key &&
    memory.kitSignatureAtLastUse === signature
  ) {
    kitUseMemoryBySeed.set(view.run.seed, {
      ...memory,
      blockedItemIds: new Set([...memory.blockedItemIds, action.itemId]),
    });
    return null;
  }

  kitUseMemoryBySeed.set(view.run.seed, {
    ...memory,
    lastItemActionKey: key,
    kitSignatureAtLastUse: signature,
  });
  return action;
};

const itemAction = (
  view: BotStateView,
  item: BotKnownItem | undefined | null
): RunAction | null => {
  if (item?.itemInstanceId === null || item?.itemInstanceId === undefined) {
    return null;
  }

  const action = { kind: "use_item", itemId: item.itemInstanceId } as const;
  return guardedItemAction(view, hasAction(view, action) ? action : null);
};

const directionToward = (
  from: Position,
  to: Position
): MoveDirection | null => {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);

  if (dx === 0 && dy === 0) {
    return null;
  }

  if (
    to.x !== from.x &&
    to.y !== from.y &&
    Math.abs(to.x - from.x) !== Math.abs(to.y - from.y)
  ) {
    return null;
  }

  return DIRECTION_BY_DELTA.get(`${dx},${dy}`) ?? null;
};

const bestEquipmentCandidate = (
  carried: readonly BotKnownItem[],
  equipped: BotKnownItem | null
): BotKnownItem | null => {
  const sorted = [...carried].sort((left, right) => {
    const leftBonus = left.bonusKnown ? (left.bonus ?? 0) : 1;
    const rightBonus = right.bonusKnown ? (right.bonus ?? 0) : 1;
    return (
      rightBonus - leftBonus ||
      left.definitionId.localeCompare(right.definitionId)
    );
  });
  const best = sorted[0];
  if (best === undefined) {
    return null;
  }

  if (equipped === null) {
    return best;
  }

  if (!best.bonusKnown || !equipped.bonusKnown) {
    return null;
  }

  return (best.bonus ?? 0) > (equipped.bonus ?? 0) ? best : null;
};

const nearestRoute = (
  view: BotStateView,
  targets: readonly Position[],
  options: RouteOptions
): readonly Position[] | null => {
  const targetKeys = new Set(targets.map(key));
  if (targetKeys.size === 0) {
    return null;
  }

  if (targetKeys.has(key(view.player.position))) {
    return [view.player.position];
  }

  const cells = new Map(
    view.map.cells.map((cell) => [key(cell.position), cell])
  );
  const blocked = blockedKeys(view, options);
  const queue: readonly Position[][] = [[view.player.position]];
  const visited = new Set([key(view.player.position)]);
  const pending: Position[][] = [...queue];

  while (pending.length > 0) {
    const route = pending.shift();
    if (route === undefined) {
      break;
    }

    const current = route[route.length - 1];
    if (current === undefined) {
      continue;
    }

    for (const neighbor of neighbors(current)) {
      const neighborKey = key(neighbor);
      if (visited.has(neighborKey)) {
        continue;
      }

      const cell = cells.get(neighborKey);
      if (cell === undefined || !isWalkable(cell) || blocked.has(neighborKey)) {
        continue;
      }

      const nextRoute = [...route, neighbor];
      if (targetKeys.has(neighborKey)) {
        return nextRoute;
      }

      visited.add(neighborKey);
      pending.push(nextRoute);
    }
  }

  return null;
};

const actionFromRoute = (
  view: BotStateView,
  route: readonly Position[]
): RunAction | null => {
  const next = route[1];
  if (next === undefined) {
    return null;
  }

  const direction = DIRECTION_BY_DELTA.get(
    `${next.x - view.player.position.x},${next.y - view.player.position.y}`
  );
  if (direction === undefined) {
    return null;
  }

  const action = { kind: "move", direction } as const;
  return hasAction(view, action) ? action : null;
};

const moveActions = (
  view: BotStateView
): readonly Extract<RunAction, { readonly kind: "move" }>[] =>
  view.availableActions.filter(
    (action): action is Extract<RunAction, { readonly kind: "move" }> =>
      action.kind === "move"
  );

const blockedKeys = (
  view: BotStateView,
  options: RouteOptions
): ReadonlySet<string> => {
  const blocked = new Set<string>();

  if (options.avoidKnownTraps === true) {
    for (const trap of view.visible.traps) {
      blocked.add(key(trap.position));
    }
  }

  if (options.avoidEnemies === true) {
    for (const enemy of view.visible.enemies) {
      blocked.add(key(enemy.position));
    }
    for (const npc of view.visible.npcs) {
      blocked.add(key(npc.position));
    }
  }

  if (options.avoidRecent === true) {
    for (const position of view.map.visited.slice(-4)) {
      blocked.add(key(position));
    }
  }

  blocked.delete(key(view.player.position));
  return blocked;
};

const walkableNeighbors = (
  view: BotStateView,
  position: Position
): readonly Position[] => {
  const cells = new Map(
    view.map.cells.map((cell) => [key(cell.position), cell])
  );
  return neighbors(position).filter((neighbor) => {
    const cell = cells.get(key(neighbor));
    return cell !== undefined && isWalkable(cell);
  });
};

const neighbors = (position: Position): readonly Position[] => {
  const out: Position[] = [];
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      if (x === 0 && y === 0) {
        continue;
      }
      out.push({ x: position.x + x, y: position.y + y });
    }
  }
  return out;
};

const isWalkable = (cell: BotKnownCell): boolean =>
  WALKABLE_TERRAINS.has(cell.terrain);

const moveDestination = (
  origin: Position,
  direction: MoveDirection
): Position => {
  for (const [delta, candidate] of DIRECTION_BY_DELTA.entries()) {
    if (candidate !== direction) {
      continue;
    }
    const [x, y] = delta.split(",").map((part) => Number.parseInt(part, 10));
    return {
      x: origin.x + (x ?? 0),
      y: origin.y + (y ?? 0)
    };
  }

  return origin;
};

const compareEnemies = (
  left: BotVisibleEnemy,
  right: BotVisibleEnemy
): number =>
  left.hp.current - right.hp.current || left.id.localeCompare(right.id);

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;

const key = (position: Position): string => `${position.x},${position.y}`;
