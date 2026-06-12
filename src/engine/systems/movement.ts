import {
  createFloorGeometrySlot,
  createTile,
  getTile,
  inBounds,
  isWalkableTile,
  Terrain,
  withTile,
  type Tile,
  type TileGrid,
} from "../map/index.js";
import type {
  EngineLogEventDataByType,
  EntityId,
  EntityInstance,
  GameState,
  Position,
  SerializableRecord,
} from "../state/index.js";
import { resolveAttack } from "./combat.js";
import {
  destinationForMove,
  registerActionResolver,
  type ActionResolver,
  type ActionResolverResult,
  type MoveAction,
  type MoveDirection,
  type TurnEvent,
} from "../turn/index.js";

type PlayerActorId = "player";

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly moved: {
      readonly actorId: PlayerActorId;
      readonly from: Position;
      readonly to: Position;
      readonly direction: MoveDirection;
    };
    readonly bumped_wall: {
      readonly actorId: PlayerActorId;
      readonly at: Position;
      readonly direction: MoveDirection;
      readonly reason: string;
    };
    readonly door_opened: {
      readonly actorId: PlayerActorId;
      readonly at: Position;
      readonly direction: MoveDirection;
    };
    readonly stepped_stairs: {
      readonly actorId: PlayerActorId;
      readonly at: Position;
      readonly direction: MoveDirection;
      readonly stairs: "stairs_down";
    };
    readonly attack_intent: {
      readonly actorId: PlayerActorId;
      readonly targetId: EntityId;
      readonly direction: MoveDirection;
    };
    readonly talk_intent: {
      readonly actorId: PlayerActorId;
      readonly npcId: EntityId;
      readonly direction: MoveDirection;
    };
  }
}

type ActorEntity = Extract<EntityInstance, { readonly kind: "enemy" | "npc" }>;

type MovementLogEventType =
  | "moved"
  | "bumped_wall"
  | "door_opened"
  | "stepped_stairs"
  | "attack_intent"
  | "talk_intent";

type ActorOccupant =
  | {
      readonly kind: "player";
      readonly id: PlayerActorId;
      readonly position: Position;
    }
  | ActorEntity;

const PLAYER_ACTOR_ID = "player" as const satisfies PlayerActorId;

export const resolveMoveAction: ActionResolver<MoveAction> = (
  state,
  action,
): ActionResolverResult => {
  const grid = gridFromState(state);

  if (grid === null) {
    return {
      illegal: true,
      reason: "floor geometry is not loaded",
    };
  }

  const occupancyViolation = actorOccupancyViolation(state);
  if (occupancyViolation !== null) {
    return {
      illegal: true,
      reason: occupancyViolation,
    };
  }

  const destination = destinationForMove(state.player.position, action.direction);

  if (!inBounds(grid, destination)) {
    return bump(state, destination, action.direction, "The map edge blocks the way.");
  }

  const tile = getTile(grid, destination);

  if (!isWalkableTile(tile)) {
    return bump(state, destination, action.direction, blockedTerrainReason(tile));
  }

  if (isClosedDoor(tile)) {
    return openDoor(state, grid, destination, action.direction);
  }

  const occupant = actorAt(state, destination);
  if (occupant?.kind === "enemy") {
    const attackResult = resolveAttack(state, PLAYER_ACTOR_ID, occupant.id);

    if ("illegal" in attackResult) {
      return attackResult;
    }

    return {
      state: attackResult.state,
      events: [
        movementEvent(state, "attack_intent", {
          actorId: PLAYER_ACTOR_ID,
          targetId: occupant.id,
          direction: action.direction,
        }),
        ...attackResult.events,
      ],
    };
  }

  if (occupant?.kind === "npc") {
    return {
      state,
      events: [
        movementEvent(state, "talk_intent", {
          actorId: PLAYER_ACTOR_ID,
          npcId: occupant.id,
          direction: action.direction,
        }),
      ],
    };
  }

  const nextState = withPlayerPosition(state, destination);
  const postMoveViolation = actorOccupancyViolation(nextState);
  if (postMoveViolation !== null) {
    return {
      illegal: true,
      reason: postMoveViolation,
    };
  }

  const events: TurnEvent[] = [
    movementEvent(state, "moved", {
      actorId: PLAYER_ACTOR_ID,
      from: state.player.position,
      to: destination,
      direction: action.direction,
    }),
  ];

  if (tile.terrain === Terrain.StairsDown) {
    events.push(
      movementEvent(state, "stepped_stairs", {
        actorId: PLAYER_ACTOR_ID,
        at: destination,
        direction: action.direction,
        stairs: "stairs_down",
      }),
    );
  }

  return {
    state: nextState,
    events,
  };
};

export const registerMovementActionResolver = (): (() => void) =>
  registerActionResolver("move", resolveMoveAction);

export const unregisterMovementActionResolver = registerMovementActionResolver();

const gridFromState = (state: GameState): TileGrid | null => {
  const opaque = state.floor.geometry.opaque;

  if (!isTileGridRecord(opaque)) {
    return null;
  }

  return opaque as unknown as TileGrid;
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

const bump = (
  state: GameState,
  at: Position,
  direction: MoveDirection,
  reason: string,
): ActionResolverResult => ({
  state,
  events: [
    movementEvent(state, "bumped_wall", {
      actorId: PLAYER_ACTOR_ID,
      at,
      direction,
      reason,
    }),
  ],
});

const openDoor = (
  state: GameState,
  grid: TileGrid,
  at: Position,
  direction: MoveDirection,
): ActionResolverResult => {
  const openedGrid = withTile(grid, at, createTile(Terrain.Door, "open"));

  return {
    state: {
      ...state,
      floor: {
        ...state.floor,
        geometry: createFloorGeometrySlot(state.floor.geometry.refId, openedGrid),
      },
    },
    events: [
      movementEvent(state, "door_opened", {
        actorId: PLAYER_ACTOR_ID,
        at,
        direction,
      }),
    ],
  };
};

const withPlayerPosition = (
  state: GameState,
  position: Position,
): GameState => ({
  ...state,
  player: {
    ...state.player,
    position,
  },
});

const blockedTerrainReason = (tile: Tile): string => {
  if (tile.terrain === Terrain.Wall) {
    return "A wall blocks the way.";
  }

  return `Terrain ${tile.terrain} blocks the way.`;
};

const isClosedDoor = (tile: Tile): boolean =>
  tile.terrain === Terrain.Door && tile.door === "closed";

const actorAt = (
  state: GameState,
  position: Position,
): ActorOccupant | null =>
  actors(state).find((actor) => samePosition(actor.position, position)) ?? null;

const actors = (state: GameState): readonly ActorOccupant[] => [
  {
    kind: "player",
    id: PLAYER_ACTOR_ID,
    position: state.player.position,
  },
  ...Object.values(state.entities)
    .filter(isActorEntity)
    .sort((a, b) => a.id.localeCompare(b.id)),
];

const actorOccupancyViolation = (state: GameState): string | null => {
  const occupied = new Map<string, ActorOccupant>();

  for (const actor of actors(state)) {
    const key = positionKey(actor.position);
    const previous = occupied.get(key);

    if (previous !== undefined) {
      return `actor occupancy invariant violated at (${actor.position.x}, ${actor.position.y}) by ${actor.id} and ${previous.id}`;
    }

    occupied.set(key, actor);
  }

  return null;
};

const isActorEntity = (entity: EntityInstance): entity is ActorEntity =>
  entity.kind === "enemy" || entity.kind === "npc";

const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const positionKey = (position: Position): string =>
  `${position.x},${position.y}`;

const movementEvent = <Type extends MovementLogEventType>(
  state: GameState,
  type: Type,
  data: EngineLogEventDataByType[Type],
): Extract<TurnEvent, { readonly type: Type }> =>
  ({
    turn: state.run.turn,
    type,
    data,
  }) as Extract<TurnEvent, { readonly type: Type }>;
