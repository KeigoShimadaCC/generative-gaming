import { describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import type { TrapDefinition } from "../../schemas/entities/index.js";
import { validEnemyDefinitionFixture } from "../../schemas/fixtures/entities.js";
import {
  makeEffectBundleFixture,
  makeEffectFixture,
  makeTriggerFixture,
  validSelfTargetingFixture,
} from "../../schemas/fixtures/vocab.js";
import type { Effect, EffectBundle } from "../../schemas/vocab/index.js";
import {
  createFloorGeometrySlot,
  createTile,
  createTileGrid,
  Terrain,
  type Tile,
  type TileGrid,
} from "../map/index.js";
import { createRng } from "../rng/index.js";
import {
  createInitialState,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type Position,
  type TrapEntityInstance,
} from "../state/index.js";
import "../effects/core.js";
import {
  bandTypicalFullHp,
  bandTypicalLevelAtEntry,
  countTrapEntities,
  cureBurnFromWaterEntry,
  isTrapRevealed,
  placementLethalityCheck,
  processTrapMovementEvents,
  processTrapTurnEnd,
  revealAdjacentTraps,
  revealAllTraps,
  triggerTrapOnStep,
  worstCaseBundleDamage,
} from "./traps.js";

describe("trap lifecycle", () => {
  it("reveals hidden traps via adjacency roll, reveal effect, and stepping trigger", () => {
    const trapDef = trapDefinition("needle", [damage(2)]);
    let state = withTrap(
      stateFromAscii("trap-reveal", ["...", ".@.", "..."], {
        player: { x: 1, y: 1 },
      }),
      "trap#1",
      { x: 1, y: 0 },
      trapDef,
    );

    expect(isTrapRevealed(state, "trap#1", state.entities["trap#1"]!.behaviorRuntime)).toBe(
      false,
    );

    const revealedByEffect = revealAllTraps(state);
    state = revealedByEffect.state;
    expect(isTrapRevealed(state, "trap#1", state.entities["trap#1"]!.behaviorRuntime)).toBe(
      true,
    );
    expect(
      floorKnowledge(revealedByEffect.state).revealedTrapIds,
    ).toContain("trap#1");

    state = withTrap(
      stateFromAscii("trap-adjacency", ["...", ".@.", ".T."], {
        player: { x: 1, y: 1 },
      }),
      "trap#2",
      { x: 1, y: 2 },
      trapDef,
      { revealed: false },
    );
    expect(countTrapEntities(state)).toBe(1);

    let foundReveal = false;
    for (let index = 0; index < 500; index += 1) {
      const rolled = revealAdjacentTraps(state);
      if (
        isTrapRevealed(
          rolled.state,
          "trap#2",
          rolled.state.entities["trap#2"]!.behaviorRuntime,
        )
      ) {
        foundReveal = true;
        break;
      }
      state = rolled.state;
    }

    expect(foundReveal).toBe(true);

    state = withTrap(
      stateFromAscii("trap-step", ["T@"], {
        player: { x: 1, y: 0 },
      }),
      "trap#3",
      { x: 0, y: 0 },
      trapDef,
      { revealed: false },
    );

    const stepped = triggerTrapOnStep(state, "trap#3", "player");
    expect("illegal" in stepped).toBe(false);
    if ("illegal" in stepped) {
      return;
    }

    expect(stepped.events.map((event) => event.type)).toContain(
      "trap_step_triggered",
    );
    expect(
      isTrapRevealed(
        stepped.state,
        "trap#3",
        stepped.state.entities["trap#3"]!.behaviorRuntime,
      ),
    ).toBe(true);
    expect(stepped.state.entities["trap#3"]?.kind).toBe("trap");
    expect(
      (stepped.state.entities["trap#3"] as TrapEntityInstance).armed,
    ).toBe(false);
    expect(stepped.state.player.hp.current).toBe(
      state.player.hp.current - 2,
    );
  });

  it("disarms traps after triggering and ignores already disarmed traps", () => {
    const trapDef = trapDefinition("spike", [damage(3)]);
    const state = withTrap(
      stateFromAscii("trap-one-shot", ["@T"], {
        player: { x: 0, y: 0 },
      }),
      "trap#1",
      { x: 1, y: 0 },
      trapDef,
      { revealed: true },
    );

    const first = triggerTrapOnStep(state, "trap#1", "player");
    expect("illegal" in first).toBe(false);
    if ("illegal" in first) {
      return;
    }

    const moved = processTrapMovementEvents(first.state, [
      {
        turn: first.state.run.turn,
        type: "moved",
        data: {
          actorId: "player",
          from: { x: 0, y: 0 },
          to: { x: 1, y: 0 },
          direction: "east",
        },
      },
    ]);

    expect(moved.events).toEqual([]);
    expect((moved.state.entities["trap#1"] as TrapEntityInstance).armed).toBe(
      false,
    );
  });
});

describe("step triggers", () => {
  it("fires for the player and for enemies entering the trap cell", () => {
    const trapDef = trapDefinition("shared", [damage(4)]);
    const playerState = withTrap(
      stateFromAscii("player-step", ["@T"], {
        player: { x: 0, y: 0 },
      }),
      "trap#1",
      { x: 1, y: 0 },
      trapDef,
      { revealed: true },
    );

    const playerMoved = processTrapMovementEvents(playerState, [
      {
        turn: playerState.run.turn,
        type: "moved",
        data: {
          actorId: "player",
          from: { x: 0, y: 0 },
          to: { x: 1, y: 0 },
          direction: "east",
        },
      },
    ]);

    expect(playerMoved.state.player.hp.current).toBe(
      config.playerCharacter.stats.hp.start - 4
    );
    expect(
      playerMoved.events.some((event) => event.type === "trap_step_triggered"),
    ).toBe(true);

    const enemyState = withEntities(
      withTrap(
        stateFromAscii("enemy-step", ["eT"], {
          player: { x: 0, y: 0 },
        }),
        "trap#1",
        { x: 1, y: 0 },
        trapDef,
        { revealed: true },
      ),
      [enemy("enemy#1", { x: 0, y: 0 }, 10)],
    );

    const enemyMoved = processTrapMovementEvents(enemyState, [
      {
        turn: enemyState.run.turn,
        type: "enemy_moved",
        data: {
          actorId: "enemy#1",
          from: { x: 0, y: 0 },
          to: { x: 1, y: 0 },
          direction: "east",
        },
      },
    ]);

    expect(enemyHp(enemyMoved.state, "enemy#1")).toBe(6);
    expect(
      enemyMoved.events.some((event) => event.type === "trap_step_triggered"),
    ).toBe(true);
  });
});

describe("placement lethality", () => {
  it("documents band-typical HP from config level progression", () => {
    expect(bandTypicalLevelAtEntry("shallows")).toBe(1);
    expect(bandTypicalLevelAtEntry("middle")).toBe(3);
    expect(bandTypicalLevelAtEntry("lowest")).toBe(5);

    expect(bandTypicalFullHp("shallows")).toBe(
      config.playerCharacter.stats.hp.start,
    );
    expect(bandTypicalFullHp("middle")).toBe(
      config.playerCharacter.stats.hp.start +
        (bandTypicalLevelAtEntry("middle") - 1) *
          config.playerCharacter.stats.hp.growthPerLevel,
    );
  });

  it("rejects adversarial max-damage bundles at band thresholds and accepts legitimate traps", () => {
    const lethalShallows = trapDefinition("lethal-shallows", [
      damage(bounds.effectVocabulary.verbs.damage.amount.max),
      burn(bounds.statusVocabulary.durationTurns.burn.max),
      damage(3),
    ]);
    expect(placementLethalityCheck(lethalShallows, "shallows").ok).toBe(false);
    expect(
      placementLethalityCheck(lethalShallows, "shallows").worstCaseDamage,
    ).toBeGreaterThanOrEqual(bandTypicalFullHp("shallows"));

    const lethalMiddle = trapDefinition("lethal-middle", [
      damage(bounds.effectVocabulary.verbs.damage.amount.max),
      damage(bounds.effectVocabulary.verbs.damage.amount.max),
      burn(bounds.statusVocabulary.durationTurns.burn.max),
    ]);
    expect(placementLethalityCheck(lethalMiddle, "middle").ok).toBe(false);

    const legitimate = trapDefinition("legit", [
      damage(bounds.effectVocabulary.verbs.damage.amount.max),
      knockback(
        bounds.effectVocabulary.verbs.knockback.pushTiles.max,
        bounds.effectVocabulary.verbs.knockback.collisionDamage.max,
      ),
    ]);
    expect(placementLethalityCheck(legitimate, "middle").ok).toBe(true);
    expect(placementLethalityCheck(legitimate, "lowest").ok).toBe(true);

    const pureBurn = trapDefinition("burn-only", [
      burn(bounds.statusVocabulary.durationTurns.burn.max),
    ]);
    expect(placementLethalityCheck(pureBurn, "shallows").ok).toBe(true);
    expect(worstCaseBundleDamage(pureBurn.effectBundle)).toBe(
      bounds.statusVocabulary.durationTurns.burn.max *
        Math.abs(config.statusMagnitudes.burnHpPerTurn),
    );
  });
});

describe("water cures burn", () => {
  it("removes burn when an actor enters a water tile", () => {
    const state = withPlayerStatuses(
      stateFromAscii("water-cure", ["~"], {
        player: { x: 0, y: 0 },
        tiles: { "~": Terrain.Water },
      }),
      [{ status: "burn", duration: 3 }],
    );

    const cured = cureBurnFromWaterEntry(state, "player", state.player.position);

    expect(cured.state.player.statuses).toEqual([]);
    expect(cured.events[0]?.type).toBe("status_expired");

    const moved = processTrapMovementEvents(state, [
      {
        turn: state.run.turn,
        type: "moved",
        data: {
          actorId: "player",
          from: { x: 0, y: 0 },
          to: { x: 0, y: 0 },
          direction: "east",
        },
      },
    ]);

    expect(moved.state.player.statuses).toEqual([]);
  });
});

describe("trap turn processing", () => {
  it("uses the traps rng substream for adjacency reveal rolls", () => {
    const trapDef = trapDefinition("hidden", [damage(1)]);
    const state = withTrap(
      stateFromAscii("trap-rng", ["...", ".@.", ".T."], {
        player: { x: 1, y: 1 },
      }),
      "trap#1",
      { x: 1, y: 2 },
      trapDef,
      { revealed: false },
    );

    const end = processTrapTurnEnd(state);
    expect(end.state.rng.streams.traps?.draws ?? 0).toBeGreaterThanOrEqual(1);
    expect(createRng(state.rng.rootSeed).fork("traps")).toBeDefined();
  });
});

const damage = (amount: number): Effect =>
  makeEffectFixture("damage", "damage", { amount });

const burn = (duration: number): Effect =>
  makeEffectFixture("apply_status", "applyStatus", {
    status: "burn",
    duration,
  });

const knockback = (pushTiles: number, collisionDamage: number): Effect =>
  makeEffectFixture("knockback", "knockback", {
    pushTiles,
    collisionDamage,
  });

const bundle = (
  effects: readonly Effect[],
): EffectBundle =>
  makeEffectBundleFixture(
    [...effects],
    makeTriggerFixture("step", "step", {}),
    validSelfTargetingFixture,
  );

const trapDefinition = (
  id: string,
  effects: readonly Effect[],
): TrapDefinition => ({
  id,
  name: id,
  hidden: true,
  effectBundle: bundle(effects),
});

const trap = (
  id: EntityId,
  position: Position,
  definition: TrapDefinition,
  options: {
    readonly armed?: boolean;
    readonly revealed?: boolean;
  } = {},
): TrapEntityInstance => ({
  id,
  kind: "trap",
  definition,
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime:
    options.revealed === true ? { revealed: true } : {},
  armed: options.armed ?? true,
});

const enemy = (
  id: EntityId,
  position: Position,
  hp: number,
): EnemyEntityInstance => ({
  id,
  kind: "enemy",
  definition:
    validEnemyDefinitionFixture as unknown as EnemyEntityInstance["definition"],
  position,
  currentHP: hp,
  statuses: [],
  behaviorRuntime: {},
});

const withTrap = (
  state: GameState,
  id: EntityId,
  position: Position,
  definition: TrapDefinition,
  options?: {
    readonly armed?: boolean;
    readonly revealed?: boolean;
  },
): GameState =>
  withEntities(state, [trap(id, position, definition, options)]);

const withEntities = (
  state: GameState,
  entities: readonly (TrapEntityInstance | EnemyEntityInstance)[],
): GameState => ({
  ...state,
  entities: {
    ...state.entities,
    ...Object.fromEntries(entities.map((entity) => [entity.id, entity])),
  },
});

const withPlayerStatuses = (
  state: GameState,
  statuses: GameState["player"]["statuses"],
): GameState => ({
  ...state,
  player: {
    ...state.player,
    statuses: [...statuses],
  },
});

const floorKnowledge = (
  state: GameState,
): {
  readonly revealedTrapIds?: readonly EntityId[];
} =>
  (
    state.floor.geometry.opaque as {
      readonly knowledge?: { readonly revealedTrapIds?: readonly EntityId[] };
    } | null
  )?.knowledge ?? {};

const enemyHp = (state: GameState, id: EntityId): number | null => {
  const entity = state.entities[id];
  return entity?.kind === "enemy" ? entity.currentHP : null;
};

type TerrainKind = (typeof Terrain)[keyof typeof Terrain];

type AsciiOptions = {
  readonly player?: Position;
  readonly tiles?: Readonly<Record<string, TerrainKind>>;
};

const stateFromAscii = (
  seed: string,
  rows: readonly string[],
  options: AsciiOptions = {},
): GameState => {
  const { grid, markers } = parseAscii(rows, options.tiles ?? {});
  const playerPosition = options.player ?? markers.get("@") ?? { x: 0, y: 0 };

  return {
    ...createInitialState(seed),
    floor: {
      ...createInitialState(seed).floor,
      geometry: createFloorGeometrySlot(`floor-geometry#${seed}`, grid),
    },
    player: {
      ...createInitialState(seed).player,
      position: playerPosition,
    },
  };
};

const parseAscii = (
  rows: readonly string[],
  tileOverrides: Readonly<Record<string, TerrainKind>>,
): {
  readonly grid: TileGrid;
  readonly markers: ReadonlyMap<string, Position>;
} => {
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  const tiles: Tile[] = [];
  const markers = new Map<string, Position>();

  for (let y = 0; y < height; y += 1) {
    const row = rows[y] ?? "";

    for (let x = 0; x < width; x += 1) {
      const character = row[x] ?? ".";
      const position = { x, y };
      tiles.push(tileForCharacter(character, tileOverrides));

      if (character !== "." && character !== "#") {
        markers.set(character, position);
      }
    }
  }

  return {
    grid: createTileGrid({ width, height, tiles }),
    markers,
  };
};

const tileForCharacter = (
  character: string,
  tileOverrides: Readonly<Record<string, TerrainKind>>,
): Tile => {
  const override = tileOverrides[character];
  if (override !== undefined) {
    return createTile(override);
  }

  switch (character) {
    case "#":
      return createTile(Terrain.Wall);
    case "~":
      return createTile(Terrain.Water);
    default:
      return createTile(Terrain.Floor);
  }
};
