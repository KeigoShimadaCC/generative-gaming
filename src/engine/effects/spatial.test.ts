import { describe, expect, it } from "vitest";

import { bounds } from "../../config/index.js";
import type {
  EnemyDefinition,
  ItemDefinition
} from "../../schemas/entities/index.js";
import {
  validApproachMeleeBehaviorFixture,
  validCoinItemFixture,
  validEnemyDefinitionFixture,
  validStepEffectBundleFixture
} from "../../schemas/fixtures/entities.js";
import {
  makeEffectBundleFixture,
  makeEffectFixture,
  validQuaffTriggerFixture,
  validSelfTargetingFixture
} from "../../schemas/fixtures/vocab.js";
import type { Effect, EffectBundle } from "../../schemas/vocab/index.js";
import {
  createTile,
  getTile,
  inBounds,
  isWalkableTile,
  Terrain,
  type FogMemory,
  type TileGrid
} from "../map/index.js";
import { createRng } from "../rng/index.js";
import {
  createInitialState,
  type EnemyEntityInstance,
  type EntityId,
  type EntityInstance,
  type GameState,
  type GroundItemEntityInstance,
  type Position,
  type SerializableRecord,
  type TrapEntityInstance
} from "../state/index.js";
import { serialize } from "../state/serialize.js";
import {
  executeBundle,
  type EffectExecutionContext,
  type EffectRejectionCode
} from "./registry.js";
import "./spatial.js";

describe("spatial effect executors", () => {
  it("teleport_self always lands on an open walkable cell across seeded executions", () => {
    for (let index = 0; index < 500; index += 1) {
      const state = stateFromAscii(`teleport-self-${index}`, [
        "########",
        "#@.....#",
        "#.###..#",
        "#......#",
        "#..###.#",
        "#......#",
        "########"
      ]);

      const result = executeBundle(
        state,
        bundle([makeEffectFixture("teleport_self", "teleportSelf", {})]),
        context(`teleport-self-${index}`, {
          sourceId: "player",
          targetId: "player"
        })
      );

      expect(result.rejected).toBeUndefined();
      expectLegalOpenCell(result.state, result.state.player.position, "player");
    }
  });

  it("teleport_target moves the target to an open walkable cell", () => {
    for (let index = 0; index < 500; index += 1) {
      const enemy = enemyDefinition("roster-rat", { hp: 4, cost: 2 });
      const state = stateFromAscii(`teleport-target-${index}`, [
        "########",
        "#@..e..#",
        "#.###..#",
        "#......#",
        "#..###.#",
        "#......#",
        "########"
      ], {
        enemies: {
          e: enemyInstance("enemy#1", enemy, { x: 4, y: 1 })
        }
      });

      const result = executeBundle(
        state,
        bundle([makeEffectFixture("teleport_target", "teleportTarget", {})]),
        context(`teleport-target-${index}`, {
          sourceId: "player",
          targetId: "enemy#1"
        })
      );
      const moved = result.state.entities["enemy#1"];

      expect(result.rejected).toBeUndefined();
      expect(moved?.kind).toBe("enemy");
      expectLegalOpenCell(result.state, moved?.position as Position, "enemy#1");
    }
  });

  it("blink hops in its directed line and always stops on a legal walkable cell", () => {
    const directions = [
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ] as const;

    for (let index = 0; index < 500; index += 1) {
      const state = stateFromAscii(`blink-${index}`, [
        "#############",
        "#...........#",
        "#...........#",
        "#...........#",
        "#...........#",
        "#.....@.....#",
        "#...........#",
        "#...........#",
        "#...........#",
        "#...........#",
        "#...........#",
        "#############"
      ]);
      const direction = createRng(`blink-direction-${index}`).pick(directions);
      const origin = {
        x: state.player.position.x + direction.x,
        y: state.player.position.y + direction.y
      };

      const result = executeBundle(
        state,
        bundle([
          makeEffectFixture("blink", "blink", {
            distanceTiles: 4
          })
        ]),
        context(`blink-${index}`, {
          sourceId: "player",
          targetId: "player",
          origin
        })
      );

      expect(result.rejected).toBeUndefined();
      expectLegalOpenCell(result.state, result.state.player.position, "player");
    }
  });

  it("knockback applies collision damage and routes lethal collision through applyDeath", () => {
    const enemy = enemyDefinition("wall-bumper", { hp: 2, cost: 2 });
    const state = stateFromAscii("knockback-collision", [
      "#####",
      "#@e##",
      "#####"
    ], {
      enemies: {
        e: enemyInstance("enemy#1", enemy, { x: 2, y: 1 })
      }
    });
    const result = executeBundle(
      state,
      bundle([
        makeEffectFixture("knockback", "knockback", {
          pushTiles: 3,
          collisionDamage: 2
        })
      ]),
      context("knockback-collision", {
        sourceId: "player",
        targetId: "enemy#1",
        origin: state.player.position
      })
    );

    expect(result.state.entities["enemy#1"]).toBeUndefined();
    expect(result.events.map((event) => event.type)).toContain("entity_died");
    expect(
      result.events.find((event) => event.type === "effect_executed")?.data
        .details
    ).toMatchObject({
      collided: true,
      collisionDamage: 2
    });
  });

  it("reveal writes map fog plus item, enemy, and trap knowledge", () => {
    const enemy = enemyDefinition("known-enemy", { hp: 4, cost: 2 });
    const state = stateFromAscii("reveal", [
      "#######",
      "#@i.e.#",
      "#..t..#",
      "#######"
    ], {
      enemies: {
        e: enemyInstance("enemy#1", enemy, { x: 4, y: 1 })
      },
      items: {
        i: itemInstance("item#1", validCoinItemFixture, { x: 2, y: 1 })
      },
      traps: {
        t: trapInstance("trap#1", { x: 3, y: 2 })
      }
    });

    const revealedMap = executeBundle(
      state,
      bundle([
        makeEffectFixture("reveal", "reveal", {
          target: "map"
        })
      ]),
      context("reveal-map")
    ).state;
    expect(floorRuntime(revealedMap).knowledge?.mapRevealed).toBe(true);
    expect(floorRuntime(revealedMap).fog?.tiles.every(
      (tile) => tile.state === "visible"
    )).toBe(true);

    const revealedItems = revealTarget(state, "items");
    expect(floorRuntime(revealedItems).knowledge?.revealedItemIds).toEqual([
      "item#1"
    ]);
    expect(revealedItems.entities["item#1"]?.behaviorRuntime.revealed).toBe(
      true
    );

    const revealedEnemies = revealTarget(state, "enemies");
    expect(floorRuntime(revealedEnemies).knowledge?.revealedEnemyIds).toEqual([
      "enemy#1"
    ]);
    expect(revealedEnemies.entities["enemy#1"]?.behaviorRuntime.revealed).toBe(
      true
    );

    const revealedTraps = revealTarget(state, "traps");
    expect(floorRuntime(revealedTraps).knowledge?.revealedTrapIds).toEqual([
      "trap#1"
    ]);
    expect(revealedTraps.entities["trap#1"]?.behaviorRuntime.revealed).toBe(
      true
    );
  });

  it("summon spawns roster enemies only on adjacent open walkable cells", () => {
    const roster = enemyDefinition("roster-rat", { hp: 4, cost: 2 });

    for (let index = 0; index < 500; index += 1) {
      const state = stateFromAscii(`summon-${index}`, [
        "#######",
        "#.....#",
        "#..@..#",
        "#.....#",
        "#######"
      ], {
        roster: [roster]
      });

      const result = executeBundle(
        state,
        bundle([
          makeEffectFixture("summon", "summon", {
            count: 3,
            rosterEntityId: roster.id
          })
        ]),
        context(`summon-${index}`, {
          sourceId: "player",
          targetId: "player"
        })
      );
      const spawned = Object.values(result.state.entities);

      expect(result.rejected).toBeUndefined();
      expect(spawned).toHaveLength(3);
      expect(new Set(spawned.map((entity) => positionKey(entity.position))).size).toBe(3);

      for (const entity of spawned) {
        expect(entity.kind).toBe("enemy");
        expect((entity as EnemyEntityInstance).definition.id).toBe(roster.id);
        expectAdjacent(entity.position, result.state.player.position);
        expectLegalOpenCell(result.state, entity.position, entity.id);
      }
    }
  });

  it("summon rejects missing or empty current-floor rosters without changing state", () => {
    const roster = enemyDefinition("roster-rat", { hp: 4, cost: 2 });
    const state = stateFromAscii("summon-roster-only", [
      "#######",
      "#.....#",
      "#..@..#",
      "#.....#",
      "#######"
    ], {
      roster: [roster]
    });

    const missing = executeBundle(
      state,
      bundle([
        makeEffectFixture("summon", "summon", {
          count: 1,
          rosterEntityId: "not-on-this-floor"
        })
      ]),
      context("summon-missing")
    );
    expect(missing.rejected).toBe(true);
    expect(serialize(missing.state)).toBe(serialize(state));

    const emptyState = stateFromAscii("summon-empty", [
      "#####",
      "#.@.#",
      "#####"
    ]);
    const empty = executeBundle(
      emptyState,
      bundle([
        makeEffectFixture("summon", "summon", {
          count: 1,
          rosterEntityId: roster.id
        })
      ]),
      context("summon-empty")
    );
    expect(empty.rejected).toBe(true);
    expect(empty.events[0]?.type).toBe("effect_rejected");
    expect(empty.events[0]?.data).toMatchObject({
      code: "invalid_target",
      message: "current floor roster is empty"
    });
    expect(serialize(empty.state)).toBe(serialize(emptyState));
  });

  it("transform only accepts roster enemies at or below the target budget cost", () => {
    const current = enemyDefinition("current-form", { hp: 6, cost: 5 });
    const cheaper = enemyDefinition("cheaper-form", { hp: 3, cost: 4 });
    const expensive = enemyDefinition("expensive-form", { hp: 8, cost: 6 });
    const state = stateFromAscii("transform", [
      "#####",
      "#@e.#",
      "#####"
    ], {
      roster: [current, cheaper, expensive],
      enemies: {
        e: enemyInstance("enemy#1", current, { x: 2, y: 1 })
      }
    });

    const accepted = executeBundle(
      state,
      bundle([
        makeEffectFixture("transform", "transform", {
          rosterEntityId: cheaper.id
        })
      ]),
      context("transform-cheaper", {
        sourceId: "player",
        targetId: "enemy#1"
      })
    );
    expect(
      (accepted.state.entities["enemy#1"] as EnemyEntityInstance).definition.id
    ).toBe(cheaper.id);
    expect(
      (accepted.state.entities["enemy#1"] as EnemyEntityInstance).currentHP
    ).toBe(cheaper.stats.hp);

    const rejected = executeBundle(
      state,
      bundle([
        makeEffectFixture("transform", "transform", {
          rosterEntityId: expensive.id
        })
      ]),
      context("transform-expensive", {
        sourceId: "player",
        targetId: "enemy#1"
      })
    );
    expect(rejected.rejected).toBe(true);
    expect(rejected.events[0]?.data).toMatchObject({
      code: "bounds"
    });
    expect(serialize(rejected.state)).toBe(serialize(state));
  });

  it("dig removes interior wall tiles but never breaches the outer boundary", () => {
    const directions = [
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ] as const;

    for (const direction of directions) {
      const state = stateFromAscii(`dig-${direction.x}-${direction.y}`, [
        "#######",
        "#######",
        "#######",
        "###@###",
        "#######",
        "#######",
        "#######"
      ]);
      const result = executeBundle(
        state,
        bundle([
          makeEffectFixture("dig", "dig", {
            lengthTiles: 5
          })
        ]),
        context(`dig-${direction.x}-${direction.y}`, {
          sourceId: "player",
          targetId: "player",
          origin: {
            x: state.player.position.x + direction.x * 10,
            y: state.player.position.y + direction.y * 10
          }
        })
      );
      const grid = gridFrom(result.state);
      const firstInterior = {
        x: state.player.position.x + direction.x,
        y: state.player.position.y + direction.y
      };

      expect(result.rejected).toBeUndefined();
      expect(getTile(grid, firstInterior).terrain).toBe(Terrain.Floor);
      expectOuterBoundaryWalls(grid);
    }
  });
});

describe("spatial effect execution rejection", () => {
  const rejectionRows: readonly SpatialRejectionRow[] = [
    {
      name: "teleport_self",
      effect: makeEffectFixture("teleport_self", "teleportSelf", {}),
      makeState: () =>
        stateWithoutOpenWalkableCells("effect-oob-teleport-self"),
      context: {
        sourceId: "player",
        targetId: "player"
      },
      code: "invalid_target"
    },
    {
      name: "teleport_target",
      effect: makeEffectFixture("teleport_target", "teleportTarget", {}),
      makeState: () =>
        stateWithoutOpenWalkableCells("effect-oob-teleport-target"),
      context: {
        sourceId: "player",
        targetId: "enemy#1"
      },
      code: "invalid_target"
    },
    {
      name: "blink",
      effect: makeEffectFixture("blink", "blink", {
        distanceTiles:
          bounds.effectVocabulary.verbs.blink.distanceTiles.max + 1
      }),
      code: "bounds"
    },
    {
      name: "knockback",
      effect: makeEffectFixture("knockback", "knockback", {
        pushTiles: bounds.effectVocabulary.verbs.knockback.pushTiles.max + 1,
        collisionDamage:
          bounds.effectVocabulary.verbs.knockback.collisionDamage.min
      }),
      code: "bounds"
    },
    {
      name: "reveal",
      effect: makeEffectFixture("reveal", "reveal", {
        target: "secrets"
      } as unknown as NonNullable<Effect["reveal"]>),
      code: "bounds"
    },
    {
      name: "summon",
      effect: makeEffectFixture("summon", "summon", {
        count: bounds.effectVocabulary.verbs.summon.count.max + 1,
        rosterEntityId: "roster-rat"
      }),
      code: "bounds"
    },
    {
      name: "transform",
      effect: makeEffectFixture("transform", "transform", {
        rosterEntityId: ""
      }),
      code: "bounds"
    },
    {
      name: "dig",
      effect: makeEffectFixture("dig", "dig", {
        lengthTiles: bounds.effectVocabulary.verbs.dig.lengthTiles.max + 1
      }),
      code: "bounds"
    }
  ];

  it.each(rejectionRows.map((row) => [row.name, row] as const))(
    "rejects out-of-bounds %s execution without changing serialized state",
    (_name, { effect, makeState, context: contextOverrides, code }) => {
      const state =
        makeState?.() ?? createInitialState(`effect-oob-${effect.kind}`);
      const before = serialize(state);
      const result = executeBundle(
        state,
        bundle([effect]),
        context(`effect-oob-${effect.kind}`, contextOverrides)
      );

      expect(serialize(result.state)).toBe(before);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.type).toBe("effect_rejected");
      expect(result.events[0]?.data).toMatchObject({
        verb: effect.kind,
        effectIndex: 0,
        code
      });
    }
  );
});

type SpatialRejectionRow = {
  readonly name: string;
  readonly effect: Effect;
  readonly makeState?: () => GameState;
  readonly context?: Partial<EffectExecutionContext>;
  readonly code: EffectRejectionCode;
};

const bundle = (effects: EffectBundle["effects"]): EffectBundle =>
  makeEffectBundleFixture(
    effects,
    validQuaffTriggerFixture,
    validSelfTargetingFixture
  );

const context = (
  seed: string,
  overrides: Partial<EffectExecutionContext> = {}
): EffectExecutionContext => ({
  sourceId: "player",
  targetId: "player",
  origin: null,
  rng: createRng(seed),
  ...overrides
});

type EnemyDefinitionWithCost = EnemyDefinition & {
  readonly cost: number;
};

const enemyDefinition = (
  id: string,
  options: { readonly hp: number; readonly cost: number }
): EnemyDefinitionWithCost => ({
  ...validEnemyDefinitionFixture,
  id,
  name: id,
  stats: {
    ...validEnemyDefinitionFixture.stats,
    hp: options.hp
  },
  behaviors: [validApproachMeleeBehaviorFixture],
  abilities: [],
  cost: options.cost
});

const enemyInstance = (
  id: EntityId,
  definition: EnemyDefinition,
  position: Position
): EnemyEntityInstance => ({
  id,
  kind: "enemy",
  definition: stripBudgetCost(definition),
  position,
  currentHP: definition.stats.hp,
  statuses: [],
  behaviorRuntime: {}
});

const stripBudgetCost = (definition: EnemyDefinition): EnemyDefinition => {
  const schemaDefinition = { ...definition } as Record<string, unknown>;
  delete schemaDefinition.cost;
  delete schemaDefinition.budgetCost;

  return schemaDefinition as EnemyDefinition;
};

const itemInstance = (
  id: EntityId,
  definition: ItemDefinition,
  position: Position
): GroundItemEntityInstance => ({
  id,
  kind: "item",
  definition,
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime: {},
  quantity: 1,
  identified: false
});

const trapInstance = (
  id: EntityId,
  position: Position
): TrapEntityInstance => ({
  id,
  kind: "trap",
  definition: {
    id: "trap-fixture",
    name: "Trap Fixture",
    hidden: true,
    effectBundle: validStepEffectBundleFixture
  },
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime: {},
  armed: true
});

const stateWithoutOpenWalkableCells = (seed: string): GameState => {
  const enemy = enemyDefinition("blocked-teleport-target", { hp: 4, cost: 2 });
  const enemyPosition = { x: 2, y: 1 };
  const state = stateFromAscii(seed, [
    "#####",
    "#@e##",
    "#####"
  ], {
    enemies: {
      e: enemyInstance("enemy#1", enemy, enemyPosition)
    }
  });

  return withWallCells(state, [state.player.position, enemyPosition]);
};

const withWallCells = (
  state: GameState,
  positions: readonly Position[]
): GameState => {
  const grid = gridFrom(state);
  const wallPositions = new Set(positions.map(positionKey));
  const tiles = grid.tiles.map((tile, index) => {
    const position = {
      x: index % grid.width,
      y: Math.floor(index / grid.width)
    };

    return wallPositions.has(positionKey(position))
      ? createTile(Terrain.Wall)
      : tile;
  });

  return {
    ...state,
    floor: {
      ...state.floor,
      geometry: {
        ...state.floor.geometry,
        opaque: {
          ...grid,
          tiles
        } as unknown as SerializableRecord
      }
    }
  };
};

type AsciiOptions = {
  readonly roster?: readonly EnemyDefinition[];
  readonly enemies?: Readonly<Record<string, EnemyEntityInstance>>;
  readonly items?: Readonly<Record<string, GroundItemEntityInstance>>;
  readonly traps?: Readonly<Record<string, TrapEntityInstance>>;
};

const stateFromAscii = (
  seed: string,
  rows: readonly string[],
  options: AsciiOptions = {}
): GameState => {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const tiles = rows.flatMap((row) =>
    [...row].map((char) =>
      createTile(char === "#" ? Terrain.Wall : Terrain.Floor)
    )
  );
  const grid: TileGrid = {
    kind: "tile-grid",
    width,
    height,
    tiles
  };
  const opaque =
    options.roster === undefined
      ? grid
      : {
          ...grid,
          enemyRoster: options.roster
        };
  const base = createInitialState(seed);
  const playerPosition = marker(rows, "@");
  const entities = {
    ...entitiesFromMarkers(options.enemies),
    ...entitiesFromMarkers(options.items),
    ...entitiesFromMarkers(options.traps)
  };

  return {
    ...base,
    floor: {
      ...base.floor,
      geometry: {
        ...base.floor.geometry,
        opaque: opaque as unknown as SerializableRecord
      }
    },
    player: {
      ...base.player,
      position: playerPosition
    },
    entities,
    ids: {
      ...base.ids,
      entityCounters: {
        enemy: maxCounter(entities, "enemy"),
        item: maxCounter(entities, "item"),
        npc: 0,
        trap: maxCounter(entities, "trap")
      }
    }
  };
};

const entitiesFromMarkers = <T extends EntityInstance>(
  entries: Readonly<Record<string, T>> | undefined
): Record<string, T> => {
  if (entries === undefined) {
    return {};
  }

  return Object.fromEntries(
    Object.values(entries).map((entity) => [entity.id, entity])
  );
};

const marker = (rows: readonly string[], char: string): Position => {
  for (let y = 0; y < rows.length; y += 1) {
    const x = rows[y]?.indexOf(char) ?? -1;
    if (x >= 0) {
      return { x, y };
    }
  }

  throw new Error(`missing marker ${char}`);
};

const maxCounter = (
  entities: Readonly<Record<string, EntityInstance>>,
  kind: "enemy" | "item" | "npc" | "trap"
): number =>
  Object.values(entities)
    .filter((entity) => entity.kind === kind)
    .map((entity) => Number(entity.id.split("#")[1] ?? "0"))
    .reduce((max, value) => Math.max(max, value), 0);

const gridFrom = (state: GameState): TileGrid => {
  const opaque = state.floor.geometry.opaque;
  if (
    opaque === null ||
    opaque.kind !== "tile-grid" ||
    !Array.isArray(opaque.tiles)
  ) {
    throw new Error("expected tile grid");
  }

  return opaque as unknown as TileGrid;
};

const floorRuntime = (
  state: GameState
): {
  readonly fog?: FogMemory;
  readonly knowledge?: {
    readonly mapRevealed?: boolean;
    readonly revealedItemIds?: readonly EntityId[];
    readonly revealedEnemyIds?: readonly EntityId[];
    readonly revealedTrapIds?: readonly EntityId[];
  };
} => state.floor.geometry.opaque as unknown as {
  readonly fog?: FogMemory;
  readonly knowledge?: {
    readonly mapRevealed?: boolean;
    readonly revealedItemIds?: readonly EntityId[];
    readonly revealedEnemyIds?: readonly EntityId[];
    readonly revealedTrapIds?: readonly EntityId[];
  };
};

const revealTarget = (
  state: GameState,
  target: NonNullable<Effect["reveal"]>["target"]
): GameState =>
  executeBundle(
    state,
    bundle([
      makeEffectFixture("reveal", "reveal", {
        target
      })
    ]),
    context(`reveal-${target}`)
  ).state;

const expectLegalOpenCell = (
  state: GameState,
  position: Position,
  actorId: EntityId | "player"
): void => {
  const grid = gridFrom(state);

  expect(inBounds(grid, position)).toBe(true);
  expect(isWalkableTile(getTile(grid, position))).toBe(true);

  if (actorId !== "player") {
    expect(positionKey(position)).not.toBe(positionKey(state.player.position));
  }

  for (const entity of Object.values(state.entities)) {
    if (entity.id !== actorId) {
      expect(positionKey(entity.position)).not.toBe(positionKey(position));
    }
  }
};

const expectAdjacent = (left: Position, right: Position): void => {
  expect(Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y))).toBe(
    1
  );
};

const expectOuterBoundaryWalls = (grid: TileGrid): void => {
  for (let x = 0; x < grid.width; x += 1) {
    expect(getTile(grid, { x, y: 0 }).terrain).toBe(Terrain.Wall);
    expect(getTile(grid, { x, y: grid.height - 1 }).terrain).toBe(Terrain.Wall);
  }

  for (let y = 0; y < grid.height; y += 1) {
    expect(getTile(grid, { x: 0, y }).terrain).toBe(Terrain.Wall);
    expect(getTile(grid, { x: grid.width - 1, y }).terrain).toBe(Terrain.Wall);
  }
};

const positionKey = (position: Position): string => `${position.x},${position.y}`;
