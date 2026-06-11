import { afterAll, describe, expect, it } from "vitest";

import { bounds } from "../../config/index.js";
import type { Behavior, EnemyDefinition, ItemDefinition } from "../../schemas/entities/index.js";
import {
  makeBehaviorFixture,
  validCoinItemFixture,
  validEnemyDefinitionFixture,
  validFleeLowHpBehaviorFixture,
} from "../../schemas/fixtures/entities.js";
import {
  makeEffectBundleFixture,
  makeEffectFixture,
  validSelfTargetingFixture,
  validUseTriggerFixture,
} from "../../schemas/fixtures/vocab.js";
import type { EffectBundle } from "../../schemas/vocab/index.js";
import {
  createFloorGeometrySlot,
  createTile,
  createTileGrid,
  Terrain,
  type Tile,
  type TileGrid,
} from "../map/index.js";
import {
  applyDeath,
  resolveAttack,
} from "../systems/combat.js";
import {
  createInitialState,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type GroundItemEntityInstance,
  type InventorySlot,
  type PlayerItemStack,
  type Position,
  type SerializableRecord,
} from "../state/index.js";
import type { PlayerAction, TurnEvent, TurnHookResult } from "../turn/index.js";
import { unregisterCoreEffectExecutors } from "../effects/core.js";
import { unregisterSpatialEffectExecutors } from "../effects/spatial.js";
import {
  evaluateBehaviors,
  executeBehaviorAction,
  specialBehaviorActorTurnHook,
  unregisterSpecialBodyguardAttackInterceptor,
  unregisterSpecialThiefLootDropHook,
} from "./special.js";

afterAll(() => {
  unregisterSpecialBodyguardAttackInterceptor();
  unregisterSpecialThiefLootDropHook();
  unregisterCoreEffectExecutors();
  unregisterSpatialEffectExecutors();
});

describe("caster", () => {
  it("uses an ability on cooldown when the player is in range and line of sight", () => {
    let state = stateFromAscii("caster-burn-bolt", "@..E", [
      enemySpec("E", "enemy#1", [casterBehavior(3)], {}, [burnBoltAbility()]),
    ]);

    const first = runEnemyTurn(state, "enemy#1");
    state = first.state;

    expect(eventOfType(first.events, "enemy_ability_used").data).toMatchObject({
      actorId: "enemy#1",
      abilityIndex: 0,
      targetId: "player",
      cooldownTurns: 3,
    });
    expect(state.player.statuses.some((status) => status.status === "burn")).toBe(
      true,
    );
    expect(abilityCooldowns(state, "enemy#1")).toEqual([3]);

    const second = runEnemyTurn(state, "enemy#1");
    expect(second.events.some((event) => event.type === "enemy_ability_used")).toBe(
      false,
    );
    expect(abilityCooldowns(second.state, "enemy#1")).toEqual([2]);
  });
});

describe("pack_hunter", () => {
  it("waits until enough same-tag allies have player LOS, then all engage", () => {
    const behavior = makeBehaviorFixture("pack_hunter", "packHunter", {
      allyCount: 2,
    });
    const dormant = stateFromAscii("pack-dormant", "@.AE", [
      enemySpec("E", "enemy#1", [behavior]),
      enemySpec("A", "enemy#2", [behavior]),
    ]);

    expect(evaluateBehaviors(dormant, "enemy#1")).toEqual({ kind: "wait" });

    const active = stateFromAscii("pack-active", "@....\n.A.BE", [
      enemySpec("E", "enemy#1", [behavior]),
      enemySpec("A", "enemy#2", [behavior]),
      enemySpec("B", "enemy#3", [behavior]),
    ]);
    const result = runEnemyTurn(active, "enemy#1");

    expect(eventOfType(result.events, "pack_hunter_engaged").data).toMatchObject({
      actorId: "enemy#1",
      allyIds: ["enemy#2", "enemy#3"],
      threshold: 2,
    });
    expect(result.state.entities["enemy#1"]?.behaviorRuntime.packHunterEngaged).toBe(
      true,
    );
    expect(result.state.entities["enemy#2"]?.behaviorRuntime.packHunterEngaged).toBe(
      true,
    );
    expect(result.state.entities["enemy#3"]?.behaviorRuntime.packHunterEngaged).toBe(
      true,
    );
    expect(result.state.entities["enemy#1"]?.position).toEqual({ x: 3, y: 0 });
  });
});

describe("ambusher", () => {
  it("stays hidden until the player enters its wake radius, then acts", () => {
    const behavior = makeBehaviorFixture("ambusher", "ambusher", {
      wakeRadiusTiles: 1,
    });
    const dormant = stateFromAscii("ambusher-dormant", "@..E", [
      enemySpec("E", "enemy#1", [behavior], { hidden: true }),
    ]);
    const close = stateFromAscii("ambusher-close", "@E.", [
      enemySpec("E", "enemy#1", [behavior], { hidden: true }),
    ]);

    expect(evaluateBehaviors(dormant, "enemy#1")).toEqual({ kind: "wait" });

    const result = runEnemyTurn(close, "enemy#1");
    expect(eventOfType(result.events, "ambusher_revealed").data.actorId).toBe(
      "enemy#1",
    );
    expect(result.state.entities["enemy#1"]?.behaviorRuntime.hidden).toBe(false);
    expect(result.events.some(isAttackResolutionEvent)).toBe(true);
  });
});

describe("thief", () => {
  it("steals one inventory item on a melee hit, flees with it, and drops it on death", () => {
    let state = withInventory(
      stateFromAscii("thief-conservation", "@E...", [
        enemySpec("E", "enemy#1", [thiefBehavior()]),
      ]),
      [carried("coin#carried", validCoinItemFixture, 1), ...emptySlots(15)],
    );
    const beforeTotal = totalItemsIncludingThiefLoot(state);

    const steal = normalizeTurnHookResult(
      executeBehaviorAction(state, "enemy#1", evaluateBehaviors(state, "enemy#1")),
    );
    state = steal.state;

    expect(eventOfType(steal.events, "thief_item_stolen").data).toMatchObject({
      actorId: "enemy#1",
      definitionId: validCoinItemFixture.id,
      quantity: 1,
    });
    expect(state.player.inventory[0]).toBeNull();
    expect(stolenLootQuantity(state, "enemy#1")).toBe(1);
    expect(totalItemsIncludingThiefLoot(state)).toBe(beforeTotal);

    const fleeAction = evaluateBehaviors(state, "enemy#1");
    expect(fleeAction).toEqual({ kind: "move", direction: "east" });
    state = normalizeTurnHookResult(
      executeBehaviorAction(state, "enemy#1", fleeAction),
    ).state;
    expect(state.entities["enemy#1"]?.position).toEqual({ x: 2, y: 0 });
    expect(totalItemsIncludingThiefLoot(state)).toBe(beforeTotal);

    const killed = applyDeath(state, "enemy#1", {
      attribution: {
        kind: "killer",
        killerId: "player",
      },
    });

    expect(killed.state.entities["enemy#1"]).toBeUndefined();
    expect(groundItemQuantity(killed.state)).toBe(1);
    expect(totalItemsIncludingThiefLoot(killed.state)).toBe(beforeTotal);
    expect(eventOfType(killed.events, "item_dropped").data.definitionId).toBe(
      validCoinItemFixture.id,
    );
  });
});

describe("bodyguard", () => {
  it("redirects attacks targeting an adjacent ward to itself", () => {
    const state = stateFromAscii(
      "bodyguard-intercept",
      ".B.\n.@W",
      [
        enemySpec("W", "enemy#1", [thiefBehavior()]),
        enemySpec("B", "enemy#2", [bodyguardBehavior()], {
          wardId: "enemy#1",
        }),
      ],
    );

    const result = expectAttackSuccess(resolveAttack(state, "player", "enemy#1"));
    const resolution = result.events.find(isAttackResolutionEvent);

    expect(resolution?.data.defenderId).toBe("enemy#2");
    expect(result.state.entities["enemy#1"]?.currentHP).toBe(
      state.entities["enemy#1"]?.currentHP,
    );
    expect(result.state.entities["enemy#2"]?.currentHP).toBeLessThan(
      state.entities["enemy#2"]?.currentHP ?? 0,
    );
  });
});

describe("mimic", () => {
  it("stays disguised as an item until pickup interaction or adjacent step reveals it", () => {
    const dormant = stateFromAscii("mimic-dormant", "@.M", [
      enemySpec("M", "enemy#1", [mimicBehavior()], {
        disguisedAsItem: true,
      }),
    ]);
    expect(evaluateBehaviors(dormant, "enemy#1")).toEqual({ kind: "wait" });

    const adjacent = stateFromAscii("mimic-reveal", "@M", [
      enemySpec("M", "enemy#1", [mimicBehavior()], {
        disguisedAsItem: true,
      }),
    ]);
    const pickup = runEnemyTurn(adjacent, "enemy#1", { kind: "pickup" });

    expect(eventOfType(pickup.events, "mimic_revealed").data.actorId).toBe(
      "enemy#1",
    );
    expect(pickup.state.entities["enemy#1"]?.behaviorRuntime.disguisedAsItem).toBe(
      false,
    );
    expect(pickup.events.some(isAttackResolutionEvent)).toBe(true);

    const stepped = runEnemyTurn(adjacent, "enemy#1", {
      kind: "move",
      direction: "east",
    });
    expect(eventOfType(stepped.events, "mimic_revealed").data.actorId).toBe(
      "enemy#1",
    );
  });
});

describe("cooldowns and composition fixtures", () => {
  it("keeps ability cooldown rolls inside 3-6 turns and deterministic", () => {
    const build = () =>
      stateFromAscii("cooldown-determinism", "@E....", [
        enemySpec(
          "E",
          "enemy#1",
          [thiefBehavior()],
          ({
            stolenLoot: [carried("coin#stolen", validCoinItemFixture, 1)],
          } as unknown as SerializableRecord),
          [blinkAbility()],
        ),
      ]);

    const traceFor = (seedState: GameState): readonly string[] => {
      let state = seedState;
      const trace: string[] = [];

      for (let turn = 0; turn < 6; turn += 1) {
        const result = runEnemyTurn(state, "enemy#1");
        state = result.state;
        trace.push(
          [
            turn,
            state.entities["enemy#1"]?.position.x,
            abilityCooldowns(state, "enemy#1").join(","),
            result.events.map((event) => event.type).join("|"),
          ].join(":"),
        );
      }

      return trace;
    };

    const first = runEnemyTurn(build(), "enemy#1");
    const cooldown = abilityCooldowns(first.state, "enemy#1")[0] ?? 0;

    expect(cooldown).toBeGreaterThanOrEqual(COOLDOWN_MIN);
    expect(cooldown).toBeLessThanOrEqual(COOLDOWN_MAX);
    expect(traceFor(build())).toEqual(traceFor(build()));
  });

  it("plays thief + flee_low_hp + blink ability as an infuriating pickpocket", () => {
    let state = withInventory(
      stateFromAscii("thief-conservation", "@E....", [
        enemySpec(
          "E",
          "enemy#1",
          [thiefBehavior(), validFleeLowHpBehaviorFixture],
          {},
          [blinkAbility()],
        ),
      ]),
      [carried("coin#target", validCoinItemFixture, 1), ...emptySlots(15)],
    );

    const stolen = runEnemyTurn(state, "enemy#1");
    state = stolen.state;
    expect(stolen.events.some((event) => event.type === "thief_item_stolen")).toBe(
      true,
    );

    const blink = runEnemyTurn(state, "enemy#1");
    expect(eventOfType(blink.events, "enemy_ability_used").data.abilityIndex).toBe(
      0,
    );
    expect(blink.state.entities["enemy#1"]?.position.x).toBeGreaterThan(1);
  });

  it("plays territorial + caster(burn bolt) as a route-around turret", () => {
    const territorial = makeBehaviorFixture("territorial", "territorial", {
      radiusTiles: 2,
    });
    const far = stateFromAscii("turret-far", "@..E", [
      enemySpec("E", "enemy#1", [territorial, casterBehavior(3)], {}, [
        burnBoltAbility(),
      ]),
    ]);

    expect(evaluateBehaviors(far, "enemy#1")).toEqual({ kind: "wait" });

    const close = stateFromAscii("turret-close", "@.E", [
      enemySpec("E", "enemy#1", [territorial, casterBehavior(3)], {}, [
        burnBoltAbility(),
      ]),
    ]);
    const result = runEnemyTurn(close, "enemy#1");

    expect(eventOfType(result.events, "enemy_ability_used").data.targetId).toBe(
      "player",
    );
    expect(result.state.player.statuses.some((status) => status.status === "burn")).toBe(
      true,
    );
    expect(result.state.entities["enemy#1"]?.position).toEqual({ x: 2, y: 0 });
  });
});

const COOLDOWN_MIN =
  bounds.enemyDesign.behaviorVocabulary.parameters.casterCooldownTurns.min;
const COOLDOWN_MAX =
  bounds.enemyDesign.behaviorVocabulary.parameters.casterCooldownTurns.max;

type EnemySpec = {
  readonly marker: string;
  readonly id: EntityId;
  readonly behaviors: readonly Behavior[];
  readonly runtime: SerializableRecord;
  readonly abilities: readonly EffectBundle[];
  readonly origin: EnemyDefinition["origin"];
};

const enemySpec = (
  marker: string,
  id: EntityId,
  behaviors: readonly Behavior[],
  runtime: SerializableRecord = {},
  abilities: readonly EffectBundle[] = [],
  origin: EnemyDefinition["origin"] = "made",
): EnemySpec => ({
  marker,
  id,
  behaviors,
  runtime,
  abilities,
  origin,
});

const thiefBehavior = (): Behavior =>
  makeBehaviorFixture("thief", "thief", {});

const bodyguardBehavior = (): Behavior =>
  makeBehaviorFixture("bodyguard", "bodyguard", {});

const mimicBehavior = (): Behavior =>
  makeBehaviorFixture("mimic", "mimic", {});

const casterBehavior = (cooldownTurns: number): Behavior =>
  makeBehaviorFixture("caster", "caster", { cooldownTurns });

const burnBoltAbility = (): EffectBundle =>
  makeEffectBundleFixture(
    [
      makeEffectFixture("apply_status", "applyStatus", {
        status: "burn",
        duration: bounds.statusVocabulary.durationTurns.burn.min,
      }),
    ],
    validUseTriggerFixture,
    {
      kind: "bolt",
      self: null,
      melee: null,
      bolt: {
        rangeTiles: bounds.effectVocabulary.targetingShapes.boltRangeTiles.min,
      },
      burst: null,
      floor: null,
    },
  );

const blinkAbility = (): EffectBundle =>
  makeEffectBundleFixture(
    [
      makeEffectFixture("blink", "blink", {
        distanceTiles: bounds.effectVocabulary.verbs.blink.distanceTiles.min,
      }),
    ],
    validUseTriggerFixture,
    validSelfTargetingFixture,
  );

const stateFromAscii = (
  seed: string,
  layout: string,
  specs: readonly EnemySpec[],
): GameState => {
  const { grid, markers } = parseAscii(layout);
  const player = marker(markers, "@");
  const entities = specs.map((spec) => {
    const position = marker(markers, spec.marker);

    return enemy(spec, position);
  });

  return withEntities(withGrid(createInitialState(seed), grid, player), entities);
};

const enemy = (
  spec: EnemySpec,
  position: Position,
): EnemyEntityInstance => ({
  id: spec.id,
  kind: "enemy",
  definition: {
    ...validEnemyDefinitionFixture,
    id: `${spec.id}-definition`,
    origin: spec.origin,
    behaviors: [...spec.behaviors],
    abilities: [...spec.abilities],
    stats: {
      ...validEnemyDefinitionFixture.stats,
      hp: 12,
      attack: bounds.enemyDesign.statBudgetsByBand.shallows.attack.max,
      defense: 0,
      xpYield: bounds.enemyDesign.statBudgetsByBand.shallows.xpYield.min,
    },
  },
  position,
  currentHP: 12,
  statuses: [],
  behaviorRuntime: spec.runtime,
});

const runEnemyTurn = (
  state: GameState,
  enemyId: EntityId,
  action: PlayerAction = { kind: "wait" },
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  const actor = state.entities[enemyId];

  if (actor?.kind !== "enemy") {
    throw new Error(`missing enemy ${enemyId}`);
  }

  return normalizeTurnHookResult(
    specialBehaviorActorTurnHook({
      state,
      actor,
      action,
    }),
  );
};

const normalizeTurnHookResult = (
  result: TurnHookResult,
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  if (typeof result === "object" && "state" in result) {
    return {
      state: result.state,
      events: result.events ?? [],
    };
  }

  return {
    state: result,
    events: [],
  };
};

const abilityCooldowns = (
  state: GameState,
  enemyId: EntityId,
): readonly number[] => {
  const raw = state.entities[enemyId]?.behaviorRuntime.abilityCooldowns;

  return Array.isArray(raw)
    ? raw.filter((value): value is number => typeof value === "number")
    : [];
};

const stolenLootQuantity = (state: GameState, enemyId: EntityId): number => {
  const raw = state.entities[enemyId]?.behaviorRuntime.stolenLoot;

  if (!Array.isArray(raw)) {
    return 0;
  }

  return raw.reduce((total, item) => {
    const quantity =
      typeof item === "object" &&
      item !== null &&
      typeof (item as { readonly quantity?: unknown }).quantity === "number"
        ? (item as { readonly quantity: number }).quantity
        : 0;

    return total + quantity;
  }, 0);
};

const totalItemsIncludingThiefLoot = (state: GameState): number =>
  state.player.inventory.reduce(
    (total, slot) => total + (slot?.quantity ?? 0),
    0,
  ) +
  groundItemQuantity(state) +
  Object.values(state.entities).reduce(
    (total, entity) =>
      entity.kind === "enemy" ? total + stolenLootQuantity(state, entity.id) : total,
    0,
  );

const groundItemQuantity = (state: GameState): number =>
  Object.values(state.entities).reduce(
    (total, entity) =>
      entity.kind === "item" ? total + entity.quantity : total,
    0,
  );

const withInventory = (
  state: GameState,
  inventory: readonly InventorySlot[],
): GameState => ({
  ...state,
  player: {
    ...state.player,
    inventory,
  },
});

const carried = (
  itemInstanceId: string,
  definition: ItemDefinition,
  quantity: number,
): PlayerItemStack => ({
  itemInstanceId,
  definition,
  quantity,
  identified: true,
});

const emptySlots = (count: number): readonly null[] =>
  Array.from({ length: count }, () => null);

const withEntities = (
  state: GameState,
  entities: readonly (EnemyEntityInstance | GroundItemEntityInstance)[],
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

const parseAscii = (
  layout: string,
): { readonly grid: TileGrid; readonly markers: ReadonlyMap<string, Position> } => {
  const rows = layout
    .trim()
    .split("\n")
    .map((row) => row.trim());
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
    default:
      return createTile(Terrain.Floor);
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

const expectAttackSuccess = (
  result: ReturnType<typeof resolveAttack>,
): Exclude<ReturnType<typeof resolveAttack>, { readonly illegal: true }> => {
  if ("illegal" in result) {
    throw new Error(result.reason);
  }

  return result;
};
