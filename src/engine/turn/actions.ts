import type {
  EntityId,
  EntityInstance,
  GameState,
  InventorySlot,
  Position,
  SerializableRecord,
} from "../state/index.js";
import {
  chebyshevDistance,
  getTile,
  inBounds,
  isWalkableTile,
  Terrain,
  type TileGrid,
} from "../map/index.js";

export const MOVE_DIRECTIONS = [
  { direction: "northwest", offset: { x: -1, y: -1 } },
  { direction: "north", offset: { x: 0, y: -1 } },
  { direction: "northeast", offset: { x: 1, y: -1 } },
  { direction: "west", offset: { x: -1, y: 0 } },
  { direction: "east", offset: { x: 1, y: 0 } },
  { direction: "southwest", offset: { x: -1, y: 1 } },
  { direction: "south", offset: { x: 0, y: 1 } },
  { direction: "southeast", offset: { x: 1, y: 1 } },
] as const;

export type MoveDirection = (typeof MOVE_DIRECTIONS)[number]["direction"];

export type ActionTarget =
  | {
      readonly kind: "self";
    }
  | {
      readonly kind: "entity";
      readonly entityId: EntityId;
    }
  | {
      readonly kind: "cell";
      readonly cell: Position;
    };

export type MoveAction = {
  readonly kind: "move";
  readonly direction: MoveDirection;
};

export type AttackAction = {
  readonly kind: "attack";
  readonly targetId: EntityId;
};

export type UseItemAction = {
  readonly kind: "use_item";
  readonly itemId: string;
  readonly target?: ActionTarget;
  readonly direction?: MoveDirection;
};

export type PickupAction = {
  readonly kind: "pickup";
};

export type TalkAction = {
  readonly kind: "talk";
  readonly npcId: EntityId;
};

export type WaitAction = {
  readonly kind: "wait";
};

export type DescendAction = {
  readonly kind: "descend";
};

export type InspectAction = {
  readonly kind: "inspect";
  readonly cell: Position;
};

export type AbortAction = {
  readonly kind: "abort";
};

export type PlayerAction =
  | MoveAction
  | AttackAction
  | UseItemAction
  | PickupAction
  | TalkAction
  | WaitAction
  | DescendAction
  | InspectAction
  | AbortAction;

export type LegalActionResult = {
  readonly status: "legal";
};

export type IllegalActionResult = {
  readonly status: "illegal";
  readonly reason: string;
};

export type ActionLegality = LegalActionResult | IllegalActionResult;

export const LEGAL_ACTION = { status: "legal" } as const satisfies ActionLegality;

export const isActionLegal = (
  result: ActionLegality,
): result is LegalActionResult => result.status === "legal";

export const checkActionLegality = (
  state: GameState,
  action: PlayerAction,
): ActionLegality => {
  if (state.run.terminalStatus !== "ACTIVE") {
    return illegal(`run is terminal (${state.run.terminalStatus})`);
  }

  switch (action.kind) {
    case "move":
      return checkMoveAction(state, action);
    case "attack":
      return checkAttackAction(state, action);
    case "use_item":
      return checkUseItemAction(state, action);
    case "pickup":
      return checkPickupAction(state);
    case "talk":
      return checkTalkAction(state, action);
    case "wait":
      return LEGAL_ACTION;
    case "descend":
      return checkDescendAction(state);
    case "inspect":
      return checkInspectAction(state, action);
    case "abort":
      return LEGAL_ACTION;
  }
};

export const getAvailableActions = (state: GameState): readonly PlayerAction[] => {
  if (state.run.terminalStatus !== "ACTIVE") {
    return [];
  }

  const actions: PlayerAction[] = [];

  for (const { direction } of MOVE_DIRECTIONS) {
    const action = { kind: "move", direction } as const;
    pushIfLegal(actions, state, action);
  }

  for (const entity of sortedEntities(state)) {
    if (entity.kind === "enemy") {
      pushIfLegal(actions, state, {
        kind: "attack",
        targetId: entity.id,
      });
    }
  }

  for (const item of carriedItems(state.player.inventory)) {
    pushIfLegal(actions, state, {
      kind: "use_item",
      itemId: item.itemInstanceId,
    });
  }

  pushIfLegal(actions, state, { kind: "pickup" });

  for (const entity of sortedEntities(state)) {
    if (entity.kind === "npc") {
      pushIfLegal(actions, state, {
        kind: "talk",
        npcId: entity.id,
      });
    }
  }

  pushIfLegal(actions, state, { kind: "wait" });
  pushIfLegal(actions, state, { kind: "descend" });
  actions.push(...availableInspectActions(state));
  pushIfLegal(actions, state, { kind: "abort" });

  return actions;
};

export const destinationForMove = (
  origin: Position,
  direction: MoveDirection,
): Position => {
  const offset = offsetForDirection(direction);

  return {
    x: origin.x + offset.x,
    y: origin.y + offset.y,
  };
};

export const gridFromState = (state: GameState): TileGrid | null => {
  const opaque = state.floor.geometry.opaque;

  if (!isTileGridRecord(opaque)) {
    return null;
  }

  return opaque as unknown as TileGrid;
};

const checkMoveAction = (
  state: GameState,
  action: MoveAction,
): ActionLegality => {
  const grid = gridFromState(state);

  if (grid === null) {
    return illegal("floor geometry is not loaded");
  }

  const destination = destinationForMove(state.player.position, action.direction);

  if (!inBounds(grid, destination)) {
    return illegal(
      `move ${action.direction} leaves the map at (${destination.x}, ${destination.y})`,
    );
  }

  const tile = getTile(grid, destination);

  if (!isWalkableTile(tile)) {
    return illegal(`terrain ${tile.terrain} blocks movement`);
  }

  return LEGAL_ACTION;
};

const checkAttackAction = (
  state: GameState,
  action: AttackAction,
): ActionLegality => {
  const target = state.entities[action.targetId];

  if (target === undefined) {
    return illegal(`attack target ${action.targetId} does not exist`);
  }

  if (target.kind !== "enemy") {
    return illegal(`attack target ${action.targetId} is not an enemy`);
  }

  if (!isAdjacentToPlayer(state, target.position)) {
    return illegal(`attack target ${action.targetId} is not adjacent`);
  }

  return LEGAL_ACTION;
};

const checkUseItemAction = (
  state: GameState,
  action: UseItemAction,
): ActionLegality => {
  if (
    !state.player.inventory.some(
      (slot) => slot?.itemInstanceId === action.itemId,
    )
  ) {
    return illegal(`item ${action.itemId} is not carried`);
  }

  if (action.target === undefined || action.target.kind === "self") {
    return action.direction === undefined ||
      MOVE_DIRECTIONS.some((entry) => entry.direction === action.direction)
      ? LEGAL_ACTION
      : illegal(`unknown use direction ${action.direction}`);
  }

  if (action.target.kind === "entity") {
    return state.entities[action.target.entityId] === undefined
      ? illegal(`target entity ${action.target.entityId} does not exist`)
      : LEGAL_ACTION;
  }

  const grid = gridFromState(state);

  if (grid === null) {
    return illegal("floor geometry is not loaded");
  }

  return inBounds(grid, action.target.cell)
    ? LEGAL_ACTION
    : illegal(
        `target cell (${action.target.cell.x}, ${action.target.cell.y}) is outside the map`,
      );
};

const checkPickupAction = (state: GameState): ActionLegality => {
  if (!state.player.inventory.some((slot) => slot === null)) {
    return illegal("inventory is full");
  }

  return sortedEntities(state).some(
    (entity) =>
      entity.kind === "item" &&
      samePosition(entity.position, state.player.position),
  )
    ? LEGAL_ACTION
    : illegal("there is no item here to pick up");
};

const checkTalkAction = (
  state: GameState,
  action: TalkAction,
): ActionLegality => {
  const npc = state.entities[action.npcId];

  if (npc === undefined) {
    return illegal(`npc ${action.npcId} does not exist`);
  }

  if (npc.kind !== "npc") {
    return illegal(`target ${action.npcId} is not an npc`);
  }

  if (!isAdjacentToPlayer(state, npc.position)) {
    return illegal(`npc ${action.npcId} is not adjacent`);
  }

  return LEGAL_ACTION;
};

const checkDescendAction = (state: GameState): ActionLegality => {
  const grid = gridFromState(state);

  if (grid === null) {
    return illegal("floor geometry is not loaded");
  }

  if (!inBounds(grid, state.player.position)) {
    return illegal(
      `player position (${state.player.position.x}, ${state.player.position.y}) is outside the map`,
    );
  }

  const tile = getTile(grid, state.player.position);

  return tile.terrain === Terrain.StairsDown
    ? LEGAL_ACTION
    : illegal("player is not standing on stairs down");
};

const checkInspectAction = (
  state: GameState,
  action: InspectAction,
): ActionLegality => {
  const grid = gridFromState(state);

  if (grid === null) {
    return illegal("floor geometry is not loaded");
  }

  return inBounds(grid, action.cell)
    ? LEGAL_ACTION
    : illegal(`inspect cell (${action.cell.x}, ${action.cell.y}) is outside the map`);
};

const availableInspectActions = (state: GameState): readonly InspectAction[] => {
  const grid = gridFromState(state);

  if (grid === null) {
    return [];
  }

  const actions: InspectAction[] = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      actions.push({
        kind: "inspect",
        cell: { x, y },
      });
    }
  }

  return actions;
};

const carriedItems = (inventory: readonly InventorySlot[]) =>
  inventory.filter((slot) => slot !== null);

const pushIfLegal = (
  actions: PlayerAction[],
  state: GameState,
  action: PlayerAction,
): void => {
  if (isActionLegal(checkActionLegality(state, action))) {
    actions.push(action);
  }
};

const sortedEntities = (state: GameState): readonly EntityInstance[] =>
  Object.values(state.entities).sort((a, b) => a.id.localeCompare(b.id));

const isAdjacentToPlayer = (state: GameState, position: Position): boolean =>
  chebyshevDistance(state.player.position, position) <= 1;

const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const offsetForDirection = (direction: MoveDirection): Position => {
  const entry = MOVE_DIRECTIONS.find((candidate) => candidate.direction === direction);

  if (entry === undefined) {
    throw new RangeError(`unknown move direction: ${direction}`);
  }

  return entry.offset;
};

const isTileGridRecord = (
  value: SerializableRecord | null,
): value is SerializableRecord => {
  if (value === null) {
    return false;
  }

  const record = value as {
    readonly kind?: unknown;
    readonly width?: unknown;
    readonly height?: unknown;
    readonly tiles?: unknown;
  };

  return (
    record.kind === "tile-grid" &&
    Number.isSafeInteger(record.width) &&
    Number.isSafeInteger(record.height) &&
    Array.isArray(record.tiles)
  );
};

const illegal = (reason: string): IllegalActionResult => ({
  status: "illegal",
  reason,
});
