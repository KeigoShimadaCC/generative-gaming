import { afterAll, describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import type { ItemDefinition, TrapDefinition } from "../../schemas/entities/index.js";
import {
  makeItemFixture,
  validArmorItemFixture,
  validEnemyDefinitionFixture,
  validWeaponItemFixture,
} from "../../schemas/fixtures/entities.js";
import {
  makeEffectBundleFixture,
  makeEffectFixture,
  makeTargetingFixture,
  makeTriggerFixture,
  validMeleeTargetingFixture,
  validReadTriggerFixture,
  validSelfTargetingFixture,
  validThrowHitTriggerFixture,
  validUseTriggerFixture,
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
import { deriveCombatStats } from "../systems/combat.js";
import {
  resolvePickupAction,
  unequipItem,
} from "../systems/inventory.js";
import {
  createInitialState,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type GroundItemEntityInstance,
  type InventorySlot,
  type PlayerItemStack,
  type Position,
  type TrapEntityInstance,
} from "../state/index.js";
import { executeBundle } from "../effects/registry.js";
import { step, type TurnEvent } from "../turn/index.js";
import "../effects/core.js";
import {
  appearancePoolForRun,
  itemCardKnowledge,
} from "./identify.js";
import {
  dispatchCombatItemProcs,
  dispatchStepTrigger,
  resolveItemAwareAttackAction,
  resolveUseItemAction,
  rollGeneratedGearCursed,
  rollItemProcChance,
  unregisterItemActionResolvers,
} from "./triggers.js";

afterAll(() => {
  unregisterItemActionResolvers();
});

describe("item trigger dispatch", () => {
  it("quaff fires a draught bundle on self, consumes the stack, identifies it, and uses the turn action", () => {
    const draught = draughtItem(
      "new-healing-draught",
      "New Healing Draught",
      bundle([heal(5)], makeTriggerFixture("quaff", "quaff", {}), validSelfTargetingFixture),
    );
    const state = withPlayerHp(
      withInventory(createInitialState("quaff-trigger"), [
        carried("item#draught", draught, 1, false),
        ...emptySlots(15),
      ]),
      10,
      20,
    );

    const result = expectSuccess(resolveUseItemAction(state, {
      kind: "use_item",
      itemId: "item#draught",
    }));

    expect(result.state.player.hp.current).toBe(15);
    expect(result.state.player.inventory[0]).toBeNull();
    expect(result.state.run.itemKnowledge.identifiedDefinitionIds).toContain(
      draught.id,
    );
    expect(eventOfType(result.events, "item_triggered").data.trigger).toBe(
      "quaff",
    );
    expect(eventOfType(result.events, "item_consumed").data.quantityAfter).toBe(0);
  });

  it("read fires a note bundle through its targeting shape", () => {
    const note = noteItem(
      "target-note",
      bundle([damage(3)], validReadTriggerFixture, validMeleeTargetingFixture),
    );
    const state = withEntities(
      withInventory(stateFromFixture("read-trigger", "@e"), [
        carried("item#note", note, 1, false),
        ...emptySlots(15),
      ]),
      [enemy("enemy#1", { x: 1, y: 0 }, 10)],
    );

    const result = expectSuccess(resolveUseItemAction(state, {
      kind: "use_item",
      itemId: "item#note",
      target: { kind: "entity", entityId: "enemy#1" },
    }));

    expect(enemyHp(result.state, "enemy#1")).toBe(7);
    expect(eventOfType(result.events, "item_triggered").data.targetIds).toEqual([
      "enemy#1",
    ]);
  });

  it("use_item consumes the turn and item even when the effect whiffs", () => {
    const note = noteItem(
      "whiff-note",
      bundle([damage(3)], validReadTriggerFixture, validMeleeTargetingFixture),
    );
    const state = withInventory(stateFromFixture("whiff-use", "@."), [
      carried("item#note", note, 1, false),
      ...emptySlots(15),
    ]);

    const result = step(state, {
      kind: "use_item",
      itemId: "item#note",
    });

    expect(result.state.run.turn).toBe(1);
    expect(result.state.player.inventory[0]).toBeNull();
    expect(eventOfType(result.events, "item_triggered").data.whiffed).toBe(true);
    expect(result.events.some((event) => event.type === "action_illegal")).toBe(
      false,
    );
  });

  it("throw_hit follows the bolt path to the first impact and consumes the thrown item", () => {
    const throwable = throwableItem(
      "path-bomb",
      bundle(
        [damage(4)],
        validThrowHitTriggerFixture,
        makeTargetingFixture("bolt", "bolt", { rangeTiles: 5 }),
      ),
    );
    const state = withEntities(
      withInventory(stateFromFixture("throw-trigger", "@..e."), [
        carried("item#throw", throwable, 1, false),
        ...emptySlots(15),
      ]),
      [enemy("enemy#1", { x: 3, y: 0 }, 10)],
    );

    const result = expectSuccess(resolveUseItemAction(state, {
      kind: "use_item",
      itemId: "item#throw",
      direction: "east",
    }));

    expect(enemyHp(result.state, "enemy#1")).toBe(6);
    expect(eventOfType(result.events, "item_triggered").data.cells).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(result.state.player.inventory[0]).toBeNull();
  });

  it("equip_passive charm effects are active while equipped", () => {
    const charm = charmItem(
      "sharp-charm",
      bundle(
        [buff("ATK", 2)],
        makeTriggerFixture("equip_passive", "equipPassive", {}),
        validSelfTargetingFixture,
      ),
    );
    const state = withInventory(createInitialState("equip-passive"), [
      carried("item#charm", charm, 1, false),
      ...emptySlots(15),
    ]);
    const before = deriveCombatStats(state, "player")?.attack ?? 0;

    const result = expectSuccess(resolveUseItemAction(state, {
      kind: "use_item",
      itemId: "item#charm",
    }));

    expect(deriveCombatStats(result.state, "player")?.attack).toBe(before + 2);
    expect(eventOfType(result.events, "item_triggered").data.trigger).toBe(
      "equip_passive",
    );
    expect(result.state.run.itemKnowledge.identifiedDefinitionIds).toContain(
      charm.id,
    );
  });

  it("use-with-charges decrements a tool and emits depletion at zero", () => {
    const tool = toolItem(
      "mending-tool",
      bundle(
        [heal(1)],
        makeTriggerFixture("use", "use", { charges: 2 }),
        validSelfTargetingFixture,
      ),
    );
    const state = withPlayerHp(
      withInventory(createInitialState("tool-charges"), [
        carried("item#tool", tool, 1, true),
        ...emptySlots(15),
      ]),
      10,
      20,
    );

    const first = expectSuccess(
      resolveUseItemAction(state, { kind: "use_item", itemId: "item#tool" }),
    );
    expect(first.state.run.itemKnowledge.chargesByItemInstanceId["item#tool"]).toBe(1);
    expect(first.state.player.inventory[0]?.itemInstanceId).toBe("item#tool");

    const second = expectSuccess(
      resolveUseItemAction(first.state, {
        kind: "use_item",
        itemId: "item#tool",
      }),
    );
    expect(second.state.run.itemKnowledge.chargesByItemInstanceId["item#tool"]).toBeUndefined();
    expect(second.state.player.inventory[0]).toBeNull();
    expect(eventOfType(second.events, "item_depleted").data.itemInstanceId).toBe(
      "item#tool",
    );
  });

  it("step exposes the trap trigger interface for PHASE-18", () => {
    const trapDefinition: TrapDefinition = {
      id: "needle-trap",
      name: "Needle Trap",
      hidden: true,
      effectBundle: bundle(
        [damage(2)],
        makeTriggerFixture("step", "step", {}),
        validSelfTargetingFixture,
      ),
    };
    const state = withEntities(
      stateFromFixture("step-trigger", "@"),
      [trap("trap#1", { x: 0, y: 0 }, trapDefinition)],
    );

    const result = expectSuccess(dispatchStepTrigger(state, "trap#1"));

    expect(result.state.player.hp.current).toBe(18);
    expect(eventOfType(result.events, "trap_step_triggered").data).toMatchObject({
      trapId: "trap#1",
      definitionId: "needle-trap",
    });
  });
});

describe("item procs and item RNG", () => {
  it("rolls proc chances on the items substream within the authored band over 10k seeded rolls", () => {
    const chancePercent = 20;
    let state = createInitialState("proc-rate");
    let triggered = 0;

    for (let index = 0; index < 10_000; index += 1) {
      const roll = rollItemProcChance(state, chancePercent);
      state = roll.state;

      if (roll.triggered) {
        triggered += 1;
      }
    }

    expect(chancePercent).toBeGreaterThanOrEqual(
      bounds.effectVocabulary.triggers.procChancePercent.onHit.min,
    );
    expect(chancePercent).toBeLessThanOrEqual(
      bounds.effectVocabulary.triggers.procChancePercent.onHit.max,
    );
    expect(triggered).toBeGreaterThanOrEqual(1_800);
    expect(triggered).toBeLessThanOrEqual(2_200);
    expect(state.rng.streams.items?.draws).toBe(10_000);
  });

  it("on_hit and on_struck procs fire from pure item data", () => {
    const weapon = weaponItem("sparking-blade", {
      attackBonus: 1,
      cursed: false,
      onHit: {
        chancePercent: 30,
        bundle: bundle(
          [damage(2)],
          makeTriggerFixture("on_hit", "onHit", { procChancePercent: 30 }),
          validMeleeTargetingFixture,
        ),
      },
    });
    const armor = armorItem("barbed-armor", {
      defenseBonus: 1,
      cursed: false,
      onStruck: {
        chancePercent: 30,
        bundle: bundle(
          [damage(2)],
          makeTriggerFixture("on_struck", "onStruck", { procChancePercent: 30 }),
          validMeleeTargetingFixture,
        ),
      },
    });
    const state = stateWithNextProcTrigger(
      withEntities(
        withPlayerEquipment(stateFromFixture("proc-events", "@e"), {
          weapon: carried("item#weapon", weapon, 1, true),
          armor: carried("item#armor", armor, 1, true),
        }),
        [enemy("enemy#1", { x: 1, y: 0 }, 20)],
      ),
      30,
    );

    const onHit = expectSuccess(
      resolveItemAwareAttackAction(state, {
        kind: "attack",
        targetId: "enemy#1",
      }),
    );
    expect(onHit.events.some((event) => event.type === "item_proc_triggered")).toBe(true);
    expect(enemyHp(onHit.state, "enemy#1")).toBeLessThan(20);

    const struckEvent = attackHitEvent(state, {
      actorId: "enemy#1",
      defenderId: "player",
    });
    const onStruck = expectSuccess(
      dispatchCombatItemProcs({
        stateBefore: state,
        state: stateWithNextProcTrigger(state, 30),
        events: [struckEvent],
      }),
    );
    expect(
      onStruck.events.some(
        (event) =>
          event.type === "item_proc_triggered" &&
          event.data.trigger === "on_struck",
      ),
    ).toBe(true);
  });

  it("generation-time curse rolls are capped by the configured <=10% item rate", () => {
    let state = createInitialState("curse-generation");
    let cursed = 0;

    for (let index = 0; index < 10_000; index += 1) {
      const roll = rollGeneratedGearCursed(state);
      state = roll.state;
      cursed += roll.triggered ? 1 : 0;
    }

    expect(config.itemsEconomy.cursedRate).toBeLessThanOrEqual(0.1);
    expect(cursed).toBeLessThanOrEqual(1_100);
  });
});

describe("identification and curse knowledge", () => {
  it("appearance pools are stable within a run and different across run seeds", () => {
    const definitions = [
      draughtItem("appearance-draught-a", "Draught A"),
      draughtItem("appearance-draught-b", "Draught B"),
      noteItem("appearance-note-a"),
      charmItem("appearance-charm-a"),
    ];

    const first = appearancePoolForRun("appearance-seed-a", definitions);
    const repeat = appearancePoolForRun("appearance-seed-a", definitions);
    const second = appearancePoolForRun("appearance-seed-b", definitions);

    expect(repeat).toEqual(first);
    expect(Object.values(second)).not.toEqual(Object.values(first));
  });

  it("identify-by-use persists in run knowledge and card data does not leak unknown effects", () => {
    const draught = draughtItem("unknown-draught", "Potion of Local Truth");
    const state = withInventory(createInitialState("identify-by-use"), [
      carried("item#unknown", draught, 1, false),
      ...emptySlots(15),
    ]);
    const unknownCard = itemCardKnowledge(state, draught, {
      itemInstanceId: "item#unknown",
      identified: false,
    });

    expect(unknownCard.knownName).toBeNull();
    expect(unknownCard.knownEffects).toBeNull();
    expect(unknownCard.unknown).toEqual(["name", "effects"]);
    expect(unknownCard.displayName).not.toBe(draught.name);

    const used = expectSuccess(
      resolveUseItemAction(state, {
        kind: "use_item",
        itemId: "item#unknown",
      }),
    );
    const knownCard = itemCardKnowledge(used.state, draught, {
      itemInstanceId: "future-copy",
      identified: false,
    });

    expect(used.state.run.itemKnowledge.identifiedDefinitionIds).toContain(
      draught.id,
    );
    expect(knownCard.knownName).toBe(draught.name);
    expect(knownCard.knownEffects).toEqual(draught.draught?.effect);
    expect(knownCard.unknown).toEqual([]);
  });

  it("weapon and armor bonuses reveal on equip; cursed gear announces and holds until enchant lifts it", () => {
    const weapon = weaponItem("cursed-sword", {
      attackBonus: 2,
      cursed: true,
      onHit: null,
    });
    const state = withInventory(createInitialState("curse-hold"), [
      carried("item#cursed", weapon, 1, false),
      ...emptySlots(15),
    ]);
    const unknownBonusCard = itemCardKnowledge(state, weapon, {
      itemInstanceId: "item#cursed",
      identified: false,
    });

    expect(unknownBonusCard.knownName).toBe(weapon.name);
    expect(unknownBonusCard.bonusKnown).toBe(false);
    expect(unknownBonusCard.unknown).toEqual(["bonus"]);

    const equipped = expectSuccess(
      resolveUseItemAction(state, {
        kind: "use_item",
        itemId: "item#cursed",
      }),
    );
    expect(eventOfType(equipped.events, "item_curse_announced").data).toMatchObject({
      itemInstanceId: "item#cursed",
      definitionId: weapon.id,
    });
    expect(equipped.state.player.equipment.weapon?.identified).toBe(true);
    expect(
      itemCardKnowledge(equipped.state, weapon, {
        itemInstanceId: "item#cursed",
        identified: true,
      }).knownBonus,
    ).toBe(2);
    expect(unequipItem(equipped.state, { kind: "weapon" })).toEqual({
      illegal: true,
      reason: "Cannot remove cursed weapon.",
    });

    const lifted = executeBundle(
      equipped.state,
      bundle(
        [makeEffectFixture("enchant", "enchant", { target: "weapon", bonus: 1 })],
        validUseTriggerFixture,
        validSelfTargetingFixture,
      ),
      {
        sourceId: "player",
        targetId: "player",
        origin: equipped.state.player.position,
        rng: createRng("curse-lift-rng"),
      },
    );
    const unequipped = unequipItem(lifted.state, { kind: "weapon" });
    expectSuccess(unequipped);
  });
});

describe("THESIS TEST: pure schema-data items play end to end", () => {
  it("plays novel draught, thrown item, and on-hit weapon lifecycles without src references", () => {
    const healingDraught = draughtItem(
      "thesis-healing-draught",
      "Thesis Healing Draught",
      bundle([heal(6)], makeTriggerFixture("quaff", "quaff", {}), validSelfTargetingFixture),
    );
    const thrown = throwableItem(
      "thesis-thrown-mix",
      bundle(
        [damage(3), applyStatus("weaken", 5)],
        validThrowHitTriggerFixture,
        makeTargetingFixture("bolt", "bolt", { rangeTiles: 5 }),
      ),
    );
    const procWeapon = weaponItem("thesis-proc-weapon", {
      attackBonus: 1,
      cursed: false,
      onHit: {
        chancePercent: 30,
        bundle: bundle(
          [damage(2)],
          makeTriggerFixture("on_hit", "onHit", { procChancePercent: 30 }),
          validMeleeTargetingFixture,
        ),
      },
    });

    const pickedDraught = pickupFromGround(
      withPlayerHp(
        withEntities(stateFromFixture("thesis-draught", "@"), [
          groundItem("item#1", { x: 0, y: 0 }, healingDraught, false),
        ]),
        8,
        20,
      ),
    );
    const usedDraught = expectSuccess(
      resolveUseItemAction(pickedDraught, { kind: "use_item", itemId: "item#1" }),
    );
    expect(usedDraught.state.player.hp.current).toBe(14);
    expect(usedDraught.state.run.itemKnowledge.identifiedDefinitionIds).toContain(
      healingDraught.id,
    );

    const pickedThrown = pickupFromGround(
      withEntities(stateFromFixture("thesis-throw", "@..e."), [
        groundItem("item#1", { x: 0, y: 0 }, thrown, false),
        enemy("enemy#1", { x: 3, y: 0 }, 15),
      ]),
    );
    const usedThrown = expectSuccess(
      resolveUseItemAction(pickedThrown, {
        kind: "use_item",
        itemId: "item#1",
        direction: "east",
      }),
    );
    expect(enemyHp(usedThrown.state, "enemy#1")).toBe(12);
    expect(usedThrown.state.entities["enemy#1"]?.statuses).toContainEqual({
      status: "weaken",
      duration: 5,
    });

    const pickedWeapon = pickupFromGround(
      withEntities(stateFromFixture("thesis-weapon", "@e"), [
        groundItem("item#1", { x: 0, y: 0 }, procWeapon, true),
        enemy("enemy#1", { x: 1, y: 0 }, 20),
      ]),
    );
    const equippedWeapon = expectSuccess(
      resolveUseItemAction(pickedWeapon, { kind: "use_item", itemId: "item#1" }),
    );
    const procReady = stateWithNextProcTrigger(equippedWeapon.state, 30);
    const procAttack = expectSuccess(
      resolveItemAwareAttackAction(procReady, {
        kind: "attack",
        targetId: "enemy#1",
      }),
    );
    expect(
      procAttack.events.some(
        (event) =>
          event.type === "item_proc_triggered" && event.data.definitionId === procWeapon.id,
      ),
    ).toBe(true);
    expect(enemyHp(procAttack.state, "enemy#1")).toBeLessThan(20);
  });
});

const bundle = (
  effects: readonly Effect[],
  trigger = makeTriggerFixture("quaff", "quaff", {}),
  targeting = validSelfTargetingFixture,
): EffectBundle => makeEffectBundleFixture(effects, trigger, targeting);

const damage = (amount: number): Effect =>
  makeEffectFixture("damage", "damage", { amount });

const heal = (amount: number): Effect =>
  makeEffectFixture("heal", "heal", { amount });

const buff = (stat: "ATK" | "DEF", magnitude: number): Effect =>
  makeEffectFixture("buff_stat", "buffStat", {
    stat,
    magnitude,
    duration: bounds.effectVocabulary.verbs.buffStat.durationTurns.min,
  });

const applyStatus = (
  status: "burn" | "poison" | "regen" | "shield" | "weaken",
  duration: number,
): Effect => makeEffectFixture("apply_status", "applyStatus", { status, duration });

const draughtItem = (
  id: string,
  name = "Local Draught",
  effect = bundle([heal(1)], makeTriggerFixture("quaff", "quaff", {}), validSelfTargetingFixture),
): ItemDefinition => ({
  ...makeItemFixture("draught", "draught", { effect }),
  id,
  name,
});

const noteItem = (
  id: string,
  effect = bundle([damage(1)], validReadTriggerFixture, validSelfTargetingFixture),
): ItemDefinition => ({
  ...makeItemFixture("note", "note", { effect }),
  id,
  name: `Note ${id}`,
});

const throwableItem = (id: string, effect: EffectBundle): ItemDefinition => ({
  ...makeItemFixture("throwable", "throwable", { effect }),
  id,
  name: `Throwable ${id}`,
});

const toolItem = (id: string, effect: EffectBundle): ItemDefinition => ({
  ...makeItemFixture("tool", "tool", { effect }),
  id,
  name: `Tool ${id}`,
});

const charmItem = (
  id: string,
  passive = bundle(
    [buff("DEF", 1)],
    makeTriggerFixture("equip_passive", "equipPassive", {}),
    validSelfTargetingFixture,
  ),
): ItemDefinition => ({
  ...makeItemFixture("charm", "charm", {
    passive,
    cursed: false,
  }),
  id,
  name: `Charm ${id}`,
});

const weaponItem = (
  id: string,
  weapon: NonNullable<ItemDefinition["weapon"]>,
): ItemDefinition => ({
  ...validWeaponItemFixture,
  id,
  name: `Weapon ${id}`,
  weapon,
});

const armorItem = (
  id: string,
  armor: NonNullable<ItemDefinition["armor"]>,
): ItemDefinition => ({
  ...validArmorItemFixture,
  id,
  name: `Armor ${id}`,
  armor,
});

const carried = (
  itemInstanceId: string,
  definition: ItemDefinition,
  quantity: number,
  identified: boolean,
): PlayerItemStack => ({
  itemInstanceId,
  definition,
  quantity,
  identified,
});

const groundItem = (
  id: EntityId,
  position: Position,
  definition: ItemDefinition,
  identified: boolean,
): GroundItemEntityInstance => ({
  id,
  kind: "item",
  definition,
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime: {},
  quantity: 1,
  identified,
});

const trap = (
  id: EntityId,
  position: Position,
  definition: TrapDefinition,
): TrapEntityInstance => ({
  id,
  kind: "trap",
  definition,
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime: {},
  armed: true,
});

const enemy = (
  id: EntityId,
  position: Position,
  hp: number,
): EnemyEntityInstance => ({
  id,
  kind: "enemy",
  definition: {
    ...validEnemyDefinitionFixture,
    stats: {
      ...validEnemyDefinitionFixture.stats,
      hp,
    },
  } as unknown as EnemyEntityInstance["definition"],
  position,
  currentHP: hp,
  statuses: [],
  behaviorRuntime: {},
});

const emptySlots = (count: number): InventorySlot[] =>
  Array.from({ length: count }, () => null);

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

const withPlayerHp = (
  state: GameState,
  current: number,
  max: number,
): GameState => ({
  ...state,
  player: {
    ...state.player,
    hp: { current, max },
  },
});

const withEntities = (
  state: GameState,
  entities: readonly (
    | EnemyEntityInstance
    | GroundItemEntityInstance
    | TrapEntityInstance
  )[],
): GameState => ({
  ...state,
  entities: {
    ...state.entities,
    ...Object.fromEntries(entities.map((entity) => [entity.id, entity])),
  },
});

const stateFromFixture = (seed: string, layout: string): GameState => {
  const { grid, markers } = parseFixture(layout);
  const playerPosition = markers.get("@") ?? { x: 0, y: 0 };

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

const parseFixture = (
  layout: string,
): {
  readonly grid: TileGrid;
  readonly markers: ReadonlyMap<string, Position>;
} => {
  const rows = layout
    .trim()
    .split("\n")
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  const width = Math.max(...rows.map((row) => row.length));
  const tiles: Tile[] = [];
  const markerEntries: [string, Position][] = [];

  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y] ?? "";

    for (let x = 0; x < width; x += 1) {
      const character = row[x];
      const position = { x, y };
      tiles.push(tileForCharacter(character));

      if (character !== undefined && character !== "." && character !== "#") {
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
    case "@":
    case "e":
    case "i":
    case ".":
    default:
      return createTile(Terrain.Floor);
  }
};

const pickupFromGround = (state: GameState): GameState =>
  expectSuccess(resolvePickupAction(state, { kind: "pickup" })).state;

const stateWithNextProcTrigger = (
  state: GameState,
  chancePercent: number,
): GameState => {
  let current = state;

  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const roll = rollItemProcChance(current, chancePercent);

    if (roll.triggered) {
      return current;
    }

    current = roll.state;
  }

  throw new Error("could not find a deterministic proc-triggering cursor");
};

const enemyHp = (state: GameState, id: EntityId): number | null => {
  const entity = state.entities[id];

  return entity?.kind === "enemy" ? entity.currentHP : null;
};

const attackHitEvent = (
  state: GameState,
  ids: {
    readonly actorId: "player" | EntityId;
    readonly defenderId: "player" | EntityId;
  },
) =>
  ({
    turn: state.run.turn,
    type: "attack_hit",
    data: {
      actorId: ids.actorId,
      defenderId: ids.defenderId,
      attackerAttack: 1,
      defenderDefense: 1,
      baseDamage: 1,
      damage: 1,
      hitRoll: 1,
      hitChancePercent: config.combatMath.hitChancePercent,
      varianceMultiplier: 1,
      defenderHpBefore: 20,
      defenderHpAfter: 19,
    },
  }) as const;

type SuccessfulResult = {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
};

type MaybeIllegalResult =
  | SuccessfulResult
  | {
      readonly illegal: true;
      readonly reason: string;
    };

const expectSuccess = <Result extends MaybeIllegalResult>(
  result: Result,
): Extract<Result, SuccessfulResult> => {
  if ("illegal" in result) {
    throw new Error(result.reason);
  }

  return result as Extract<Result, SuccessfulResult>;
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
