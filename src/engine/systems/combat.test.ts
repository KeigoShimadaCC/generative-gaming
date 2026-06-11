import { afterAll, describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import type { EnemyDefinition, ItemDefinition } from "../../schemas/entities/index.js";
import {
  makeItemFixture,
  validArmorItemFixture,
  validEnemyDefinitionFixture,
  validWeaponItemFixture,
} from "../../schemas/fixtures/entities.js";
import {
  makeEffectBundleFixture,
  makeEffectFixture,
  validEquipPassiveTriggerFixture,
  validSelfTargetingFixture,
} from "../../schemas/fixtures/vocab.js";
import type { StatusApplication } from "../../schemas/vocab/index.js";
import {
  createFloorGeometrySlot,
  createTile,
  createTileGrid,
  Terrain,
  type Tile,
  type TileGrid,
} from "../map/index.js";
import {
  createInitialState,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type PlayerItemStack,
  type Position,
} from "../state/index.js";
import { step, type TurnEvent } from "../turn/index.js";
import {
  calculateDamage,
  deriveCombatStats,
  registerLootDropHook,
  resolveAttack,
  resolveBoltAttack,
  unregisterCombatActionResolver,
} from "./combat.js";

afterAll(() => {
  unregisterCombatActionResolver();
});

describe("combat formula and stat derivation", () => {
  it("uses the configured damage formula for spot cases", () => {
    expect(calculateDamage(5, 2, config.combatMath.varianceMultiplier.min)).toBe(
      3,
    );
    expect(calculateDamage(5, 2, config.combatMath.varianceMultiplier.max)).toBe(
      3,
    );
    expect(calculateDamage(2, 99, config.combatMath.varianceMultiplier.min)).toBe(
      config.combatMath.minimumDamage,
    );
  });

  it("derives player stats from level, equipment, charm buffs, and statuses", () => {
    const weapon = carriedItem("weapon#1", withWeaponBonus(3));
    const armor = carriedItem("armor#1", withArmorBonus(2));
    const charm = carriedItem("charm#1", buffCharm("ATK", 2));
    const state = {
      ...stateFromFixture("derived-stats", "@"),
      player: {
        ...stateFromFixture("derived-stats", "@").player,
        level: 5,
        equipment: {
          weapon,
          armor,
          charms: [charm, null],
        },
        statuses: [
          status("shield"),
          status("weaken"),
        ],
      },
    };

    expect(deriveCombatStats(state, "player")).toEqual({
      attack: 7,
      defense: 6,
    });
  });

  it("keeps weaken from reducing ATK below the configured minimum damage", () => {
    const state = {
      ...stateFromFixture("weaken-floor", "@"),
      player: {
        ...stateFromFixture("weaken-floor", "@").player,
        statuses: [status("weaken")],
      },
    };

    expect(deriveCombatStats(state, "player")?.attack).toBe(
      config.combatMath.minimumDamage,
    );
  });

  it("keeps hit rate and damage rolls inside the configured seeded bands", () => {
    let state = withPlayerEquipment(
      withEntities(stateFromFixture("combat-statistical", "@E"), [
        enemy("enemy#1", { x: 1, y: 0 }, { hp: 1_000_000, attack: 2, defense: 0 }),
      ]),
      {
        weapon: carriedItem(
          "stat-weapon#1",
          withWeaponBonus(bounds.itemsEconomy.weaponAtkBonus.max),
        ),
      },
    );
    const samples = 10_000;
    const hitDamages: number[] = [];
    let hits = 0;
    const baseDamage = calculateExpectedBaseDamage(state, "enemy#1");
    const expectedMinDamage = Math.round(
      baseDamage * config.combatMath.varianceMultiplier.min,
    );
    const expectedMaxDamage = Math.round(
      baseDamage * config.combatMath.varianceMultiplier.max,
    );

    for (let index = 0; index < samples; index += 1) {
      const result = expectSuccess(resolveAttack(state, "player", "enemy#1"));
      const event = result.events.find(isAttackResolutionEvent);

      if (event?.type === "attack_hit") {
        hits += 1;
        hitDamages.push(event.data.damage);
      }

      state = withEntities(result.state, [
        enemy("enemy#1", { x: 1, y: 0 }, { hp: 1_000_000, attack: 2, defense: 0 }),
      ]);
    }

    const hitRate = hits / samples;
    expect(hitRate).toBeGreaterThanOrEqual(
      config.combatMath.hitChancePercent / 100 - 0.01,
    );
    expect(hitRate).toBeLessThanOrEqual(
      config.combatMath.hitChancePercent / 100 + 0.01,
    );

    for (const damage of hitDamages) {
      expect(damage).toBeGreaterThanOrEqual(expectedMinDamage);
      expect(damage).toBeLessThanOrEqual(expectedMaxDamage);
    }

    expect(new Set(hitDamages).size).toBeGreaterThan(1);
    expect(Math.min(...hitDamages)).toBe(expectedMinDamage);
    expect(Math.max(...hitDamages)).toBe(expectedMaxDamage);
  });
});

describe("melee attacks", () => {
  it("rejects non-adjacent melee attacks", () => {
    const state = stateFromFixture("melee-range", "@.E");
    const result = resolveAttack(state, "player", "enemy#1");

    expect(result).toEqual({
      illegal: true,
      reason: "defender enemy#1 is not adjacent to attacker player",
    });
  });

  it("registers the attack action resolver with the turn registry", () => {
    const state = stateFromFixture("attack-action", "@E");
    const result = step(state, {
      kind: "attack",
      targetId: "enemy#1",
    });

    expect(result.events[0]).toEqual({
      turn: 0,
      type: "action_resolved",
      data: { actionKind: "attack" },
    });
    expect(result.events.some(isAttackResolutionEvent)).toBe(true);
  });
});

describe("bolt attacks", () => {
  it("hits the first target along a transparent line", () => {
    const state = stateFromFixture("bolt-first-target", "@.A.B");
    const result = expectSuccess(
      resolveBoltAttack(state, "player", { x: 4, y: 0 }, { range: 4 }),
    );
    const hit = eventOfType(result.events, "attack_hit");

    expect(hit.data.defenderId).toBe("enemy#1");
    expect(result.state.entities["enemy#1"]?.currentHP).toBeLessThan(
      state.entities["enemy#1"]?.currentHP ?? 0,
    );
    expect(result.state.entities["enemy#2"]?.currentHP).toBe(
      state.entities["enemy#2"]?.currentHP,
    );
  });

  it("emits a blocked miss when map transparency breaks line of sight", () => {
    const state = stateFromFixture("bolt-blocked", "@.#E");
    const result = expectSuccess(
      resolveBoltAttack(state, "player", { x: 3, y: 0 }, { range: 4 }),
    );

    expect(result.state.entities["enemy#1"]?.currentHP).toBe(
      state.entities["enemy#1"]?.currentHP,
    );
    expect(eventOfType(result.events, "attack_missed").data.reason).toBe(
      "line_of_sight_blocked",
    );
  });
});

describe("death, XP, and terminal state", () => {
  it("removes killed enemies, grants XP, and invokes the loot-drop hook", () => {
    let lootHookCalls = 0;
    const unregisterLoot = registerLootDropHook(({ state, victim, killerId }) => {
      lootHookCalls += 1;
      expect(victim.id).toBe("enemy#1");
      expect(killerId).toBe("player");

      return state;
    });

    try {
      const state = withEntities(stateFromFixture("enemy-death", "@E"), [
        enemy("enemy#1", { x: 1, y: 0 }, { hp: 1, attack: 2, defense: 0, xpYield: 6 }),
      ]);
      const result = expectSuccess(resolveAttack(state, "player", "enemy#1"));

      expect(result.state.entities["enemy#1"]).toBeUndefined();
      expect(result.state.player.xp).toBe(6);
      expect(eventOfType(result.events, "entity_died").data).toMatchObject({
        entityId: "enemy#1",
        xpYield: 6,
      });
      expect(eventOfType(result.events, "xp_gained").data).toMatchObject({
        actorId: "player",
        sourceEntityId: "enemy#1",
        amount: 6,
        totalXp: 6,
      });
      expect(lootHookCalls).toBe(1);
    } finally {
      unregisterLoot();
    }
  });

  it("sets LOSS when the player dies", () => {
    const state = {
      ...stateFromFixture("player-death", "E@"),
      player: {
        ...stateFromFixture("player-death", "E@").player,
        hp: {
          current: 1,
          max: config.playerCharacter.stats.hp.start,
        },
      },
    };
    const result = expectSuccess(resolveAttack(state, "enemy#1", "player"));

    expect(result.state.player.hp.current).toBe(0);
    expect(result.state.run.terminalStatus).toBe(
      config.runStructure.terminalStates.loss,
    );
    expect(eventOfType(result.events, "entity_died").data.entityId).toBe(
      "player",
    );
  });
});

describe("combat log event shape", () => {
  it("emits exactly one attack resolution event for hit and miss resolutions", () => {
    const hit = expectSuccess(
      resolveAttack(stateFromFixture("one-resolution-hit", "@E"), "player", "enemy#1"),
    );
    const blockedMiss = expectSuccess(
      resolveBoltAttack(
        stateFromFixture("one-resolution-miss", "@#E"),
        "player",
        { x: 2, y: 0 },
        { range: 3 },
      ),
    );

    expect(hit.events.filter(isAttackResolutionEvent)).toHaveLength(1);
    expect(blockedMiss.events.filter(isAttackResolutionEvent)).toHaveLength(1);
  });

  it("records only combat stream draws and leaves the root stream untouched", () => {
    const state = stateFromFixture("combat-rng-stream", "@E");
    const result = expectSuccess(resolveAttack(state, "player", "enemy#1"));

    expect(result.state.rng.streams.root?.draws).toBe(0);
    expect(result.state.rng.streams.combat?.parentStreamId).toBe("root");
    expect(result.state.rng.streams.combat?.draws).toBeGreaterThan(0);
  });
});

type ParsedMap = {
  readonly grid: TileGrid;
  readonly markers: ReadonlyMap<string, Position>;
};

const stateFromFixture = (seed: string, source: string): GameState => {
  const { grid, markers } = parseMap(source);
  const entities: EnemyEntityInstance[] = [];

  for (const markerName of ["E", "A", "B"] as const) {
    const position = markers.get(markerName);

    if (position !== undefined) {
      entities.push(
        enemy(`enemy#${entities.length + 1}` as EntityId, position, {
          hp: 20,
          attack: 2,
          defense: 0,
        }),
      );
    }
  }

  return withEntities(
    withGrid(createInitialState(seed), grid, marker(markers, "@")),
    entities,
  );
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

      tiles.push(tileForCharacter(character));

      if (character !== undefined && /[A-Z@]/u.test(character)) {
        markerEntries.push([character, position]);
      }
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
    case "A":
    case "B":
      return createTile(Terrain.Floor);
    default:
      throw new Error(`unsupported fixture character ${String(character)}`);
  }
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
  entities: readonly EnemyEntityInstance[],
): GameState => ({
  ...state,
  entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
});

const withPlayerEquipment = (
  state: GameState,
  equipment: Partial<GameState["player"]["equipment"]>,
): GameState => ({
  ...state,
  player: {
    ...state.player,
    equipment: {
      ...state.player.equipment,
      ...equipment,
    },
  },
});

const calculateExpectedBaseDamage = (
  state: GameState,
  defenderId: EntityId,
): number => {
  const attacker = deriveCombatStats(state, "player");
  const defender = deriveCombatStats(state, defenderId);

  if (attacker === null || defender === null) {
    throw new Error("missing combat stats");
  }

  return Math.max(
    config.combatMath.minimumDamage,
    attacker.attack - defender.defense,
  );
};

const enemy = (
  id: EntityId,
  position: Position,
  overrides: Partial<EnemyDefinition["stats"]> = {},
): EnemyEntityInstance => {
  const stats = {
    ...validEnemyDefinitionFixture.stats,
    ...overrides,
  };

  return {
    id,
    kind: "enemy",
    definition: {
      ...validEnemyDefinitionFixture,
      stats,
    } as unknown as EnemyEntityInstance["definition"],
    position,
    currentHP: overrides.hp ?? stats.hp,
    statuses: [],
    behaviorRuntime: {},
  };
};

const withWeaponBonus = (attackBonus: number): ItemDefinition => ({
  ...validWeaponItemFixture,
  weapon: {
    attackBonus,
    cursed: false,
  },
});

const withArmorBonus = (defenseBonus: number): ItemDefinition => ({
  ...validArmorItemFixture,
  armor: {
    defenseBonus,
    cursed: false,
  },
});

const buffCharm = (stat: "ATK" | "DEF", magnitude: number): ItemDefinition =>
  makeItemFixture("charm", "charm", {
    passive: makeEffectBundleFixture(
      [
        makeEffectFixture("buff_stat", "buffStat", {
          stat,
          magnitude,
          duration: bounds.effectVocabulary.verbs.buffStat.durationTurns.min,
        }),
      ],
      validEquipPassiveTriggerFixture,
      validSelfTargetingFixture,
    ),
    cursed: false,
  });

const carriedItem = (
  itemInstanceId: string,
  definition: ItemDefinition,
): PlayerItemStack => ({
  itemInstanceId,
  definition,
  quantity: 1,
  identified: true,
});

const status = (statusId: StatusApplication["status"]): StatusApplication => ({
  status: statusId,
  duration: bounds.statusVocabulary.durationTurns[statusId].min,
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

const expectSuccess = (
  result: ReturnType<typeof resolveAttack> | ReturnType<typeof resolveBoltAttack>,
): Exclude<ReturnType<typeof resolveAttack>, { readonly illegal: true }> => {
  if ("illegal" in result) {
    throw new Error(result.reason);
  }

  return result;
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

const isAttackResolutionEvent = (
  event: TurnEvent,
): event is Extract<TurnEvent, { readonly type: "attack_hit" | "attack_missed" }> =>
  event.type === "attack_hit" || event.type === "attack_missed";
