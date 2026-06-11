import { afterAll, describe, expect, it } from "vitest";

import { bounds } from "../../config/index.js";
import type { Behavior, EnemyDefinition } from "../../schemas/entities/index.js";
import {
  makeBehaviorFixture,
  validApproachMeleeBehaviorFixture,
  validEnemyDefinitionFixture,
  validFleeLowHpBehaviorFixture,
  validKeepRangeBehaviorFixture,
  validPatrolBehaviorFixture,
  validTerritorialBehaviorFixture,
} from "../../schemas/fixtures/entities.js";
import {
  createFloorGeometrySlot,
  createTile,
  createTileGrid,
  Terrain,
  type Tile,
  type TileGrid,
} from "../map/index.js";
import { unregisterCombatActionResolver } from "../systems/combat.js";
import { unregisterMovementActionResolver } from "../systems/movement.js";
import {
  createInitialState,
  type EnemyEntityInstance,
  type GameState,
  type Position,
  type SerializableRecord,
} from "../state/index.js";
import { step, type TurnEvent } from "../turn/index.js";
import {
  behaviorTurnHooks,
  createAiRngContext,
  evaluateBehaviors,
  executeBehaviorAction,
} from "./movement.js";

afterAll(() => {
  unregisterMovementActionResolver();
  unregisterCombatActionResolver();
});

describe("approach_melee", () => {
  it("pathfinds to the player and attacks when adjacent", () => {
    let state = stateWithEnemy(
      "approach-melee",
      "@..E",
      [validApproachMeleeBehaviorFixture],
    );

    state = stepEnemyTurn(state).state;
    expect(state.entities["enemy#1"]?.position).toEqual({ x: 2, y: 0 });

    state = stepEnemyTurn(state).state;
    expect(state.entities["enemy#1"]?.position).toEqual({ x: 1, y: 0 });

    const { state: attacked, events } = stepEnemyTurn(state, true);
    expect(events.some((event) => event.type === "attack_hit")).toBe(true);
    expect(attacked.entities["enemy#1"]?.position).toEqual({ x: 1, y: 0 });
  });
});

describe("keep_range", () => {
  it("waits in the 2-5 tile band, advances when too far, and retreats when too close", () => {
    const behavior = makeBehaviorFixture("keep_range", "keepRange", {
      distanceTiles: 3,
    });
    const inBand = stateWithEnemy("keep-range-band", "@..E", [behavior]);
    expect(evaluateBehaviors(inBand, "enemy#1").kind).toBe("wait");

    const tooFar = stateWithEnemy("keep-range-far", "@......E", [behavior]);
    expect(evaluateBehaviors(tooFar, "enemy#1").kind).toBe("move");

    const tooClose = stateWithEnemy("keep-range-close", ".@E...", [behavior], {}, validEnemyDefinitionFixture.stats.hp, { x: 1, y: 0 });
    expect(evaluateBehaviors(tooClose, "enemy#1").kind).toBe("move");
  });
});

describe("flee_low_hp", () => {
  it("turns at exactly the configured threshold and runs from the player", () => {
    const threshold =
      bounds.enemyDesign.behaviorVocabulary.parameters.fleeLowHpThresholdPercent
        .min;
    const behavior = makeBehaviorFixture("flee_low_hp", "fleeLowHp", {
      thresholdPercent: threshold,
    });
    const maxHp = 5;
    const atThresholdHp = (maxHp * threshold) / 100;
    const aboveThresholdHp = atThresholdHp + 1;

    const healthy = withEnemyMaxHp(
      stateWithEnemy(
        "flee-above",
        "@.E.",
        [validApproachMeleeBehaviorFixture, behavior],
        {},
        aboveThresholdHp,
      ),
      maxHp,
    );
    expect(evaluateBehaviors(healthy, "enemy#1")).toEqual({
      kind: "move",
      direction: "west",
    });

    const wounded = withEnemyMaxHp(
      stateWithEnemy(
        "flee-at-threshold",
        "@.E.",
        [behavior, validApproachMeleeBehaviorFixture],
        {},
        atThresholdHp,
      ),
      maxHp,
    );
    const fleeAction = evaluateBehaviors(wounded, "enemy#1");
    expect(fleeAction).toEqual({ kind: "move", direction: "east" });

    const fled = executeBehaviorAction(wounded, "enemy#1", fleeAction);
    const fledState = "state" in fled ? fled.state : fled;
    expect(fledState.entities["enemy#1"]?.position).toEqual({ x: 3, y: 0 });
  });
});

describe("territorial", () => {
  it("ignores a distant player until they enter the radius", () => {
    const behavior = makeBehaviorFixture("territorial", "territorial", {
      radiusTiles: 2,
    });
    const distant = stateWithEnemy("territorial-distant", "@....E", [behavior]);

    expect(evaluateBehaviors(distant, "enemy#1")).toEqual({ kind: "wait" });

    const close = stateWithEnemy("territorial-close", "@.E", [behavior]);
    expect(evaluateBehaviors(close, "enemy#1").kind).toBe("move");
  });

  it("engages after taking damage even when the player stays distant", () => {
    const behavior = validTerritorialBehaviorFixture;
    const provoked = stateWithEnemy(
      "territorial-damaged",
      "@....E",
      [behavior],
      {},
      validEnemyDefinitionFixture.stats.hp - 1,
    );

    expect(evaluateBehaviors(provoked, "enemy#1").kind).toBe("move");
  });
});

describe("guard", () => {
  it("refuses to leave the tether radius while engaging inside it", () => {
    const behavior = makeBehaviorFixture("guard", "guard", {
      tetherId: "cell-1",
      tetherRadiusTiles: 1,
    });
    const state = stateWithEnemy(
      "guard-tether",
      "..PE..@",
      [behavior],
      {
        post: { x: 2, y: 0 },
      },
    );

    const action = evaluateBehaviors(state, "enemy#1");
    expect(action.kind).toBe("wait");
  });

  it("returns toward the post when pulled outside the tether", () => {
    const behavior = makeBehaviorFixture("guard", "guard", {
      tetherId: "cell-1",
      tetherRadiusTiles: 1,
    });
    const state = stateWithEnemy(
      "guard-return",
      "P......E\n@.......",
      [behavior],
      {
        post: { x: 0, y: 0 },
      },
    );
    const action = evaluateBehaviors(state, "enemy#1");

    expect(action.kind).toBe("move");
    const moved = executeBehaviorAction(state, "enemy#1", action);
  const nextState =
    "state" in moved ? moved.state : moved;
    expect(nextState.entities["enemy#1"]?.position).toEqual({ x: 6, y: 0 });
  });
});

describe("patrol", () => {
  it("loops waypoints until the player is sighted, then engages", () => {
    const behavior = validPatrolBehaviorFixture;
    let state = stateWithEnemy(
      "patrol-loop",
      "E.......",
      [behavior],
      {
        waypoints: [
          { x: 0, y: 0 },
          { x: 3, y: 0 },
          { x: 3, y: 2 },
        ],
        patrolIndex: 0,
      },
      validEnemyDefinitionFixture.stats.hp,
      { x: 7, y: 0 },
    );

    state = stepEnemyTurn(state).state;
    expect(state.entities["enemy#1"]?.position).toEqual({ x: 1, y: 0 });

    state = withPlayerPosition(state, { x: 5, y: 0 });
    state = stepEnemyTurn(state).state;
    expect(state.entities["enemy#1"]?.position).toEqual({ x: 2, y: 0 });

    state = withPlayerPosition(state, { x: 1, y: 0 });
    state = stepEnemyTurn(state).state;
    const { events } = stepEnemyTurn(state, true);
    expect(events.some((event) => event.type === "attack_hit")).toBe(true);
  });
});

describe("behavior composition", () => {
  it("uses schema order priority for the first firing behavior", () => {
    const flee = validFleeLowHpBehaviorFixture;
    const approach = validApproachMeleeBehaviorFixture;
    const wounded = withEnemyMaxHp(
      stateWithEnemy(
        "composition-priority",
        "@.E.",
        [flee, approach],
        {},
        1,
      ),
      10,
    );
    const healthy = withEnemyMaxHp(
      stateWithEnemy(
        "composition-healthy",
        "@.E.",
        [flee, approach],
        {},
        10,
      ),
      10,
    );

    const woundedAction = evaluateBehaviors(
      wounded,
      "enemy#1",
      createAiRngContext(wounded),
    );
    const healthyAction = evaluateBehaviors(
      healthy,
      "enemy#1",
      createAiRngContext(healthy),
    );

    expect(woundedAction).toEqual({ kind: "move", direction: "east" });
    expect(healthyAction).toEqual({ kind: "move", direction: "west" });
  });
});

describe("determinism", () => {
  it("produces identical enemy decisions across 500 turns for the same seed", () => {
    const behavior = makeBehaviorFixture("flee_low_hp", "fleeLowHp", {
      thresholdPercent: 50,
    });
    const build = () =>
      stateWithEnemy(
        "determinism-500",
        "@...E",
        [behavior, validApproachMeleeBehaviorFixture],
        {},
        4,
      );

    const traceFor = (state: GameState): string[] => {
      const trace: string[] = [];
      let current = state;

      for (let turn = 0; turn < 500; turn += 1) {
        const action = evaluateBehaviors(current, "enemy#1");
        trace.push(`${current.run.turn}:${action.kind}`);
        const result = executeBehaviorAction(current, "enemy#1", action);
        current = "state" in result ? result.state : result;
        current = {
          ...current,
          run: {
            ...current.run,
            turn: current.run.turn + 1,
          },
        };
      }

      return trace;
    };

    expect(traceFor(build())).toEqual(traceFor(build()));
  });

  it("keeps actor-turn hook decisions stable across 500 player waits", () => {
    const behavior = validApproachMeleeBehaviorFixture;
    const build = () =>
      stateWithEnemy("determinism-hook", "@...E", [behavior]);

    const traceFor = (seedState: GameState): string[] => {
      const trace: string[] = [];
      let state = seedState;

      for (let index = 0; index < 500; index += 1) {
        const before = state.entities["enemy#1"]?.position;
        const result = step(state, { kind: "wait" }, { hooks: behaviorTurnHooks() });
        const after = result.state.entities["enemy#1"]?.position;
        trace.push(
          `${state.run.turn}:${before?.x},${before?.y}->${after?.x},${after?.y}`,
        );
        state = result.state;
      }

      return trace;
    };

    expect(traceFor(build())).toEqual(traceFor(build()));
  });
});

const stepEnemyTurn = (
  state: GameState,
  expectAttack = false,
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  const result = step(state, { kind: "wait" }, { hooks: behaviorTurnHooks() });

  if (expectAttack) {
    expect(result.events.some(isCombatEvent)).toBe(true);
  }

  return result;
};

const isCombatEvent = (event: TurnEvent): boolean =>
  event.type === "attack_hit" || event.type === "attack_missed";

const withEnemyMaxHp = (state: GameState, maxHp: number): GameState => {
  const enemyEntity = state.entities["enemy#1"];

  if (enemyEntity?.kind !== "enemy") {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      "enemy#1": {
        ...enemyEntity,
        definition: {
          ...enemyEntity.definition,
          stats: {
            ...enemyEntity.definition.stats,
            hp: maxHp,
          },
        },
      },
    },
  };
};

const stateWithEnemy = (
  seed: string,
  source: string,
  behaviors: readonly Behavior[],
  runtime: SerializableRecord = {},
  currentHP: number = validEnemyDefinitionFixture.stats.hp,
  playerPosition?: Position,
): GameState => {
  const { grid, markers } = parseMap(source);
  const enemyPosition = markers.get("E");

  if (enemyPosition === undefined) {
    throw new Error("fixture requires enemy marker E");
  }

  const enemy: EnemyEntityInstance = {
    id: "enemy#1",
    kind: "enemy",
    definition: enemyDefinition(behaviors),
    position: enemyPosition,
    currentHP,
    statuses: [],
    behaviorRuntime: runtime,
  };

  return withEntities(
    withGrid(
      createInitialState(seed),
      grid,
      playerPosition ?? marker(markers, "@"),
    ),
    [enemy],
  );
};

const enemyDefinition = (behaviors: readonly Behavior[]): EnemyDefinition => ({
  ...validEnemyDefinitionFixture,
  behaviors: [...behaviors],
});

const withPlayerPosition = (state: GameState, position: Position): GameState => ({
  ...state,
  player: {
    ...state.player,
    position,
  },
});

const withEntities = (
  state: GameState,
  entities: readonly EnemyEntityInstance[],
): GameState => ({
  ...state,
  entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
});

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

const parseMap = (
  source: string,
): { readonly grid: TileGrid; readonly markers: Map<string, Position> } => {
  const rows = source.split("\n").filter((row) => row.length > 0);
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

      if (character !== undefined && /[A-Za-z@EP]/u.test(character)) {
        markerEntries.push([character, position]);
      }

      tiles.push(tileForCharacter(character));
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
    case ".":
    case "@":
    case "E":
    case "P":
      return createTile(Terrain.Floor);
    default:
      throw new Error(`unsupported fixture character ${String(character)}`);
  }
};

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

void validKeepRangeBehaviorFixture;
