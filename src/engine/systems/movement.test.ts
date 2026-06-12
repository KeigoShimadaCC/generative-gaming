import { afterAll, describe, expect, it } from "vitest";

import {
  validEnemyDefinitionFixture,
  validNpcDefinitionFixture,
} from "../../schemas/fixtures/entities.js";
import {
  createFloorGeometrySlot,
  createTile,
  createTileGrid,
  getTile,
  Terrain,
  type Tile,
  type TileGrid,
} from "../map/index.js";
import { createRng } from "../rng/index.js";
import {
  createInitialState,
  type EnemyEntityInstance,
  type EntityId,
  type EntityInstance,
  type GameState,
  type NpcEntityInstance,
  type Position,
} from "../state/index.js";
import {
  getAvailableActions,
  step,
  type MoveAction,
  type TurnEvent,
} from "../turn/index.js";
import {
  resolveMoveAction,
  unregisterMovementActionResolver,
} from "./movement.js";

afterAll(() => {
  unregisterMovementActionResolver();
});

describe("movement resolver", () => {
  it("moves onto open floor and logs the movement", () => {
    const state = stateFromFixture("move-open-floor", `@.`);

    const result = step(state, { kind: "move", direction: "east" });

    expect(result.state.player.position).toEqual({ x: 1, y: 0 });
    expect(eventOfType(result.events, "moved")).toEqual({
      turn: 0,
      type: "moved",
      data: {
        actorId: "player",
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
        direction: "east",
      },
    });
  });

  it("resolves move-into-enemy as a cardinal bump-attack without moving the player", () => {
    const state = stateFromFixture("move-into-enemy", `@E`);

    const result = step(state, { kind: "move", direction: "east" });

    expect(result.state.run.turn).toBe(1);
    expect(result.state.player.position).toEqual({ x: 0, y: 0 });
    expect(result.state.entities["enemy#1"]?.position).toEqual({ x: 1, y: 0 });
    expect(result.events.some(isAttackResolutionEvent)).toBe(true);
    expect(result.state.entities["enemy#1"]?.currentHP).toBeLessThan(
      state.entities["enemy#1"]?.currentHP ?? 0,
    );
    expect(eventOfType(result.events, "attack_intent")).toEqual({
      turn: 0,
      type: "attack_intent",
      data: {
        actorId: "player",
        targetId: "enemy#1",
        direction: "east",
      },
    });
  });

  it("kills an enemy through repeated cardinal bump-attack hits", () => {
    const state = withEntities(stateFromFixture("cardinal-bump-kill", `@E`), [
      enemy("enemy#1", { x: 1, y: 0 }, { hp: 3, defense: 0 }),
    ]);

    const result = bumpUntilEnemyDies(state, "east");

    expect(result.hits).toBeGreaterThanOrEqual(2);
    expect(result.state.entities["enemy#1"]).toBeUndefined();
    expect(result.state.player.position).toEqual({ x: 0, y: 0 });
  });

  it("kills an enemy through repeated diagonal bump-attack hits", () => {
    const state = withEntities(
      stateFromFixture(
        "diagonal-bump-kill",
        `
.E
@.
`,
      ),
      [enemy("enemy#1", { x: 1, y: 0 }, { hp: 3, defense: 0 })],
    );

    const result = bumpUntilEnemyDies(state, "northeast");

    expect(result.hits).toBeGreaterThanOrEqual(2);
    expect(result.state.entities["enemy#1"]).toBeUndefined();
    expect(result.state.player.position).toEqual({ x: 0, y: 1 });
  });

  it("routes move-into-NPC to a talk intent without moving the player", () => {
    const state = stateFromFixture("move-into-npc", `@N`);

    const result = step(state, { kind: "move", direction: "east" });

    expect(result.state.run.turn).toBe(1);
    expect(result.state.player.position).toEqual({ x: 0, y: 0 });
    expect(result.state.entities["npc#1"]?.position).toEqual({ x: 1, y: 0 });
    expect(eventOfType(result.events, "talk_intent")).toEqual({
      turn: 0,
      type: "talk_intent",
      data: {
        actorId: "player",
        npcId: "npc#1",
        direction: "east",
      },
    });
  });

  it("reports wall bumps with a UX reason string without moving the player", () => {
    const state = stateFromFixture("move-into-wall", `@#`);
    const result = expectResolverSuccess(
      resolveMoveAction(state, { kind: "move", direction: "east" }),
    );

    expect(result.state).toBe(state);
    expect(eventOfType(result.events, "bumped_wall")).toEqual({
      turn: 0,
      type: "bumped_wall",
      data: {
        actorId: "player",
        at: { x: 1, y: 0 },
        direction: "east",
        reason: "A wall blocks the way.",
      },
    });
  });

  it("opens a closed door instead of moving and costs the turn", () => {
    const state = stateFromFixture("move-into-door", `@+`);

    const result = step(state, { kind: "move", direction: "east" });
    const grid = gridFromState(result.state);

    expect(result.state.run.turn).toBe(1);
    expect(result.state.player.position).toEqual({ x: 0, y: 0 });
    expect(getTile(grid, { x: 1, y: 0 })).toEqual(
      createTile(Terrain.Door, "open"),
    );
    expect(eventOfType(result.events, "door_opened")).toEqual({
      turn: 0,
      type: "door_opened",
      data: {
        actorId: "player",
        at: { x: 1, y: 0 },
        direction: "east",
      },
    });
  });

  it("logs stairs detection after entering stairs_down", () => {
    const state = stateFromFixture("move-onto-stairs", `@>`);

    const result = step(state, { kind: "move", direction: "east" });

    expect(result.state.player.position).toEqual({ x: 1, y: 0 });
    expect(eventOfType(result.events, "moved").data.to).toEqual({ x: 1, y: 0 });
    expect(eventOfType(result.events, "stepped_stairs")).toEqual({
      turn: 0,
      type: "stepped_stairs",
      data: {
        actorId: "player",
        at: { x: 1, y: 0 },
        direction: "east",
        stairs: "stairs_down",
      },
    });
  });

  it("keeps actors from sharing tiles over 1000 seeded random legal move attempts", () => {
    let state = withEntities(
      withGrid(
        createInitialState("movement-occupancy-property"),
        createTileGrid({ width: 8, height: 8 }),
        { x: 3, y: 3 },
      ),
      [
        enemy("enemy#1", { x: 1, y: 1 }),
        enemy("enemy#2", { x: 6, y: 1 }),
        enemy("enemy#3", { x: 1, y: 6 }),
        enemy("enemy#4", { x: 6, y: 6 }),
        enemy("enemy#5", { x: 4, y: 1 }),
      ],
    );
    const rng = createRng("movement-occupancy-property");
    const initialActorEntityCount = actorEntities(state).length;

    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const moves = getAvailableActions(state).filter(isMoveAction);
      const action = rng.pick(moves);
      const result = step(state, action);

      state = result.state;

      expect(result.events[0]).toMatchObject({
        type: "action_resolved",
        data: { actionKind: "move" },
      });
      expect(actorEntities(state).length).toBeLessThanOrEqual(initialActorEntityCount);
      expect(hasActorCollision(state)).toBe(false);
    }
  });
});

type ParsedMap = {
  readonly grid: TileGrid;
  readonly markers: ReadonlyMap<string, Position>;
};

const parseMap = (source: string): ParsedMap => {
  const rows = source.trim().split("\n");
  const width = rows[0]?.length ?? 0;
  const tiles: Tile[] = [];
  const markerEntries: [string, Position][] = [];

  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];

    if (row === undefined || row.length !== width) {
      throw new Error("fixture rows must have equal width");
    }

    for (let x = 0; x < row.length; x += 1) {
      const character = row[x];
      const position = { x, y };
      const tile = tileForCharacter(character);

      if (character !== undefined && /[A-Z@]/u.test(character)) {
        markerEntries.push([character, position]);
      }

      tiles.push(tile);
    }
  }

  return {
    grid: createTileGrid({ width, height: rows.length, tiles }),
    markers: new Map(markerEntries),
  };
};

const tileForCharacter = (character: string | undefined): Tile => {
  switch (character) {
    case "#":
      return createTile(Terrain.Wall);
    case "+":
      return createTile(Terrain.Door, "closed");
    case "/":
      return createTile(Terrain.Door, "open");
    case ">":
      return createTile(Terrain.StairsDown);
    case ".":
    case "@":
    case "E":
    case "N":
      return createTile(Terrain.Floor);
    default:
      throw new Error(`unsupported fixture character ${String(character)}`);
  }
};

const stateFromFixture = (seed: string, source: string): GameState => {
  const { grid, markers } = parseMap(source);
  const entities: (EnemyEntityInstance | NpcEntityInstance)[] = [];
  const enemyPosition = markers.get("E");
  const npcPosition = markers.get("N");

  if (enemyPosition !== undefined) {
    entities.push(enemy("enemy#1", enemyPosition));
  }

  if (npcPosition !== undefined) {
    entities.push(npc("npc#1", npcPosition));
  }

  return withEntities(
    withGrid(createInitialState(seed), grid, marker(markers, "@")),
    entities,
  );
};

const withGrid = (
  state: GameState,
  grid: TileGrid,
  position: Position,
): GameState => ({
  ...state,
  floor: {
    ...state.floor,
    geometry: createFloorGeometrySlot(state.floor.geometry.refId, grid),
  },
  player: {
    ...state.player,
    position,
  },
});

const withEntities = (
  state: GameState,
  entities: readonly (EnemyEntityInstance | NpcEntityInstance)[],
): GameState => ({
  ...state,
  entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
});

const enemy = (
  id: EntityId,
  position: Position,
  statOverrides: Partial<EnemyEntityInstance["definition"]["stats"]> = {},
): EnemyEntityInstance => {
  const stats = {
    ...validEnemyDefinitionFixture.stats,
    ...statOverrides,
  };

  return {
    id,
    kind: "enemy",
    definition: {
      ...validEnemyDefinitionFixture,
      stats,
    } as unknown as EnemyEntityInstance["definition"],
    position,
    currentHP: statOverrides.hp ?? stats.hp,
    statuses: [],
    behaviorRuntime: {},
  };
};

const npc = (id: EntityId, position: Position): NpcEntityInstance => ({
  id,
  kind: "npc",
  definition: validNpcDefinitionFixture,
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime: {},
  dialogueRuntime: {},
});

const marker = (
  markers: ReadonlyMap<string, Position>,
  name: string,
): Position => {
  const position = markers.get(name);

  if (position === undefined) {
    throw new Error(`missing marker ${name}`);
  }

  return position;
};

const gridFromState = (state: GameState): TileGrid => {
  const opaque = state.floor.geometry.opaque;

  if (opaque === null) {
    throw new Error("missing fixture grid");
  }

  return opaque as unknown as TileGrid;
};

const eventOfType = <Type extends TurnEvent["type"]>(
  events: readonly TurnEvent[],
  type: Type,
): Extract<TurnEvent, { readonly type: Type }> => {
  const event = events.find(
    (candidate): candidate is Extract<TurnEvent, { readonly type: Type }> =>
      candidate.type === type,
  );

  if (event === undefined) {
    throw new Error(`missing event ${type}`);
  }

  return event;
};

const bumpUntilEnemyDies = (
  initialState: GameState,
  direction: MoveAction["direction"],
): { readonly state: GameState; readonly hits: number } => {
  let state = initialState;
  let hits = 0;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (state.entities["enemy#1"] === undefined) {
      return { state, hits };
    }

    const result = step(state, { kind: "move", direction });
    expect(eventOfType(result.events, "attack_intent").data.targetId).toBe(
      "enemy#1",
    );
    hits += result.events.filter(isAttackHitEvent).length;
    state = result.state;
  }

  throw new Error("enemy#1 survived repeated bump attacks");
};

const isAttackResolutionEvent = (
  event: TurnEvent,
): event is Extract<TurnEvent, { readonly type: "attack_hit" | "attack_missed" }> =>
  event.type === "attack_hit" || event.type === "attack_missed";

const isAttackHitEvent = (
  event: TurnEvent,
): event is Extract<TurnEvent, { readonly type: "attack_hit" }> =>
  event.type === "attack_hit";

const expectResolverSuccess = (
  result: ReturnType<typeof resolveMoveAction>,
): Exclude<ReturnType<typeof resolveMoveAction>, { readonly illegal: true }> => {
  if ("illegal" in result) {
    throw new Error(result.reason);
  }

  return result;
};

const isMoveAction = (
  action: ReturnType<typeof getAvailableActions>[number],
): action is MoveAction => action.kind === "move";

const actorEntities = (state: GameState): readonly EntityInstance[] =>
  Object.values(state.entities).filter(
    (entity) => entity.kind === "enemy" || entity.kind === "npc",
  );

const hasActorCollision = (state: GameState): boolean => {
  const occupied = new Set<string>();
  const actors = [
    { position: state.player.position },
    ...actorEntities(state).map((entity) => ({ position: entity.position })),
  ];

  for (const actor of actors) {
    const key = `${actor.position.x},${actor.position.y}`;

    if (occupied.has(key)) {
      return true;
    }

    occupied.add(key);
  }

  return false;
};
