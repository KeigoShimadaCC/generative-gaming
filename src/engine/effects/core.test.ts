import { describe, expect, it } from "vitest";

import { bounds } from "../../config/index.js";
import type {
  EnemyDefinition,
  ItemDefinition
} from "../../schemas/entities/index.js";
import {
  validEnemyDefinitionFixture,
  validFoodItemFixture,
  validToolItemFixture,
  validWeaponItemFixture
} from "../../schemas/fixtures/entities.js";
import {
  makeEffectBundleFixture,
  makeEffectFixture,
  validQuaffTriggerFixture,
  validSelfTargetingFixture
} from "../../schemas/fixtures/vocab.js";
import type { Effect, EffectBundle } from "../../schemas/vocab/index.js";
import { deriveCombatStats } from "../systems/combat.js";
import { createRng } from "../rng/index.js";
import {
  createInitialState,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type PlayerItemStack,
  type Position
} from "../state/index.js";
import { serialize } from "../state/serialize.js";
import type { TurnEvent } from "../turn/index.js";
import "./core.js";
import { executeBundle, type EffectExecutionContext } from "./registry.js";

describe("core effect executors", () => {
  it("damage applies bounded damage and routes lethal damage through applyDeath", () => {
    const state = withEnemy(
      createInitialState("effect-damage"),
      enemy("enemy#1", 3)
    );
    const result = executeBundle(
      state,
      bundle([
        makeEffectFixture("damage", "damage", {
          amount: 3
        })
      ]),
      context("effect-damage", { targetId: "enemy#1" })
    );

    expect(result.state.entities["enemy#1"]).toBeUndefined();
    expect(result.state.player.xp).toBe(
      validEnemyDefinitionFixture.stats.xpYield
    );
    expect(
      eventOfType(result.events, "effect_executed").data.details
    ).toMatchObject({
      amount: 3,
      hpBefore: 3,
      hpAfter: 0
    });
    expect(eventOfType(result.events, "entity_died").data.entityId).toBe(
      "enemy#1"
    );
  });

  it("heal restores HP and caps at max HP", () => {
    const state = withPlayerHp(createInitialState("effect-heal"), 5, 20);
    const result = executeBundle(
      state,
      bundle([
        makeEffectFixture("heal", "heal", {
          amount: bounds.effectVocabulary.verbs.heal.amount.max
        })
      ]),
      context("effect-heal")
    );

    expect(result.state.player.hp.current).toBe(20);
    expect(
      eventOfType(result.events, "effect_executed").data.details
    ).toMatchObject({
      hpBefore: 5,
      hpAfter: 20
    });
  });

  it("apply_status routes through the status system", () => {
    const duration = bounds.statusVocabulary.durationTurns.burn.min;
    const result = executeBundle(
      createInitialState("effect-apply-status"),
      bundle([
        makeEffectFixture("apply_status", "applyStatus", {
          status: "burn",
          duration
        })
      ]),
      context("effect-apply-status")
    );

    expect(result.state.player.statuses).toEqual([
      { status: "burn", duration }
    ]);
    expect(result.events.map((event) => event.type)).toEqual([
      "effect_executed",
      "status_applied"
    ]);
  });

  it("cure_status removes one status or all statuses", () => {
    const state = {
      ...createInitialState("effect-cure-status"),
      player: {
        ...createInitialState("effect-cure-status").player,
        statuses: [
          { status: "poison", duration: 3 },
          { status: "burn", duration: 2 }
        ]
      }
    } satisfies GameState;

    const curedOne = executeBundle(
      state,
      bundle([
        makeEffectFixture("cure_status", "cureStatus", {
          status: "poison"
        })
      ]),
      context("effect-cure-status-one")
    );
    expect(curedOne.state.player.statuses).toEqual([
      { status: "burn", duration: 2 }
    ]);

    const curedAll = executeBundle(
      state,
      bundle([
        makeEffectFixture("cure_status", "cureStatus", {
          status: "all"
        })
      ]),
      context("effect-cure-status-all")
    );
    expect(curedAll.state.player.statuses).toEqual([]);
  });

  it("buff_stat adds a timed combat stat modifier", () => {
    const state = createInitialState("effect-buff-stat");
    const before = deriveCombatStats(state, "player");
    const result = executeBundle(
      state,
      bundle([
        makeEffectFixture("buff_stat", "buffStat", {
          stat: "ATK",
          magnitude: 2,
          duration: bounds.effectVocabulary.verbs.buffStat.durationTurns.min
        })
      ]),
      context("effect-buff-stat")
    );
    const after = deriveCombatStats(result.state, "player");

    expect(after?.attack).toBe((before?.attack ?? 0) + 2);
    expect(result.state.player.statuses[0]).toMatchObject({
      status: "buff_stat",
      duration: bounds.effectVocabulary.verbs.buffStat.durationTurns.min,
      kind: "buff_stat",
      stat: "ATK",
      magnitude: 2
    });
  });

  it("nutrition increases fullness and follows overfeed caps", () => {
    const state = withPlayerFullness(
      createInitialState("effect-nutrition"),
      90,
      100
    );
    const result = executeBundle(
      state,
      bundle([
        makeEffectFixture("nutrition", "nutrition", {
          fullness: 100
        })
      ]),
      context("effect-nutrition")
    );

    expect(result.state.player.fullness).toEqual({
      current: 190,
      max: bounds.playerCharacter.overfedFullnessCap
    });
  });

  it("identify marks one carried item or all carried items in a category", () => {
    const food = carried("food#1", validFoodItemFixture, false);
    const tool = carried("tool#1", validToolItemFixture, false);
    const state = withInventory(createInitialState("effect-identify"), [
      food,
      tool
    ]);

    const identifiedOne = executeBundle(
      state,
      bundle([
        makeEffectFixture("identify", "identify", {
          mode: "carried_item",
          carriedItemId: "tool#1",
          category: null
        })
      ]),
      context("effect-identify-one")
    );
    expect(identifiedOne.state.player.inventory[0]?.identified).toBe(false);
    expect(identifiedOne.state.player.inventory[1]?.identified).toBe(true);

    const identifiedCategory = executeBundle(
      state,
      bundle([
        makeEffectFixture("identify", "identify", {
          mode: "category",
          carriedItemId: null,
          category: "food"
        })
      ]),
      context("effect-identify-category")
    );
    expect(identifiedCategory.state.player.inventory[0]?.identified).toBe(true);
    expect(identifiedCategory.state.player.inventory[1]?.identified).toBe(
      false
    );
  });

  it("enchant raises equipped weapon or armor bonuses by +1 and caps at +3 over authored max", () => {
    let state = withEquipment(createInitialState("effect-enchant"), {
      weapon: carried(
        "weapon#1",
        weaponWithBonus(bounds.itemsEconomy.weaponAtkBonus.max),
        true
      )
    });
    const enchantWeapon = bundle([
      makeEffectFixture("enchant", "enchant", {
        target: "weapon",
        bonus: 1
      })
    ]);

    for (let index = 0; index < 4; index += 1) {
      state = executeBundle(
        state,
        enchantWeapon,
        context(`effect-enchant-${index}`)
      ).state;
    }

    expect(state.player.equipment.weapon?.definition.weapon?.attackBonus).toBe(
      bounds.itemsEconomy.weaponAtkBonus.max +
        bounds.effectVocabulary.verbs.enchant.itemCapIncrease
    );
  });
});

describe("core effect execution rejection", () => {
  const outOfBoundsRows: readonly [string, Effect][] = [
    [
      "damage",
      makeEffectFixture("damage", "damage", {
        amount: bounds.effectVocabulary.verbs.damage.amount.max + 1
      })
    ],
    [
      "heal",
      makeEffectFixture("heal", "heal", {
        amount: bounds.effectVocabulary.verbs.heal.amount.max + 1
      })
    ],
    [
      "apply_status",
      makeEffectFixture("apply_status", "applyStatus", {
        status: "poison",
        duration: bounds.statusVocabulary.durationTurns.poison.min - 1
      })
    ],
    [
      "cure_status",
      makeEffectFixture("cure_status", "cureStatus", {
        status: "not-a-status"
      } as unknown as NonNullable<Effect["cureStatus"]>)
    ],
    [
      "buff_stat",
      makeEffectFixture("buff_stat", "buffStat", {
        stat: "ATK",
        magnitude: bounds.effectVocabulary.verbs.buffStat.magnitudeAbs.max + 1,
        duration: bounds.effectVocabulary.verbs.buffStat.durationTurns.min
      })
    ],
    [
      "nutrition",
      makeEffectFixture("nutrition", "nutrition", {
        fullness: bounds.effectVocabulary.verbs.nutrition.fullness.max + 1
      })
    ],
    [
      "identify",
      makeEffectFixture("identify", "identify", {
        mode: "carried_item",
        carriedItemId: "",
        category: null
      })
    ],
    [
      "enchant",
      makeEffectFixture("enchant", "enchant", {
        target: "weapon",
        bonus: 2
      } as unknown as NonNullable<Effect["enchant"]>)
    ]
  ];

  it.each(outOfBoundsRows)(
    "rejects out-of-bounds %s effects without changing serialized state",
    (_name, effect) => {
      const state = createInitialState(`effect-oob-${effect.kind}`);
      const before = serialize(state);
      const result = executeBundle(
        state,
        bundle([effect]),
        context(`effect-oob-${effect.kind}`)
      );

      expect(serialize(result.state)).toBe(before);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.type).toBe("effect_rejected");
      expect(result.events[0]?.data).toMatchObject({
        verb: effect.kind,
        effectIndex: 0,
        code: "bounds"
      });
    }
  );

  it("rolls back earlier core effects when a later effect rejects", () => {
    const state = createInitialState("effect-core-atomic");
    const before = serialize(state);
    const result = executeBundle(
      state,
      bundle([
        makeEffectFixture("damage", "damage", {
          amount: 1
        }),
        makeEffectFixture("heal", "heal", {
          amount: bounds.effectVocabulary.verbs.heal.amount.max + 1
        })
      ]),
      context("effect-core-atomic")
    );

    expect(serialize(result.state)).toBe(before);
    expect(result.events).toEqual([
      {
        turn: 0,
        type: "effect_rejected",
        data: {
          verb: "heal",
          effectIndex: 1,
          code: "bounds",
          message: "heal.amount must be 1-20",
          sourceId: "player",
          targetId: "player",
          origin: null
        }
      }
    ]);
  });
});

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

const withPlayerHp = (
  state: GameState,
  current: number,
  max: number
): GameState => ({
  ...state,
  player: {
    ...state.player,
    hp: {
      current,
      max
    }
  }
});

const withPlayerFullness = (
  state: GameState,
  current: number,
  max: number
): GameState => ({
  ...state,
  player: {
    ...state.player,
    fullness: {
      current,
      max
    }
  }
});

const withEnemy = (
  state: GameState,
  enemyEntity: EnemyEntityInstance
): GameState => ({
  ...state,
  entities: {
    ...state.entities,
    [enemyEntity.id]: enemyEntity
  }
});

const enemy = (
  id: EntityId,
  hp: number,
  position: Position = { x: 1, y: 0 },
  overrides: Partial<EnemyDefinition["stats"]> = {}
): EnemyEntityInstance => {
  const stats = {
    ...validEnemyDefinitionFixture.stats,
    hp,
    ...overrides
  };

  return {
    id,
    kind: "enemy",
    definition: {
      ...validEnemyDefinitionFixture,
      stats
    } as unknown as EnemyEntityInstance["definition"],
    position,
    currentHP: hp,
    statuses: [],
    behaviorRuntime: {}
  };
};

const withInventory = (
  state: GameState,
  stacks: readonly PlayerItemStack[]
): GameState => ({
  ...state,
  player: {
    ...state.player,
    inventory: [
      ...stacks,
      ...Array.from(
        { length: state.player.inventory.length - stacks.length },
        () => null
      )
    ]
  }
});

const withEquipment = (
  state: GameState,
  equipment: Partial<GameState["player"]["equipment"]>
): GameState => ({
  ...state,
  player: {
    ...state.player,
    equipment: {
      ...state.player.equipment,
      ...equipment
    }
  }
});

const carried = (
  itemInstanceId: string,
  definition: ItemDefinition,
  identified: boolean
): PlayerItemStack => ({
  itemInstanceId,
  definition,
  quantity: 1,
  identified
});

const weaponWithBonus = (attackBonus: number): ItemDefinition => ({
  ...validWeaponItemFixture,
  weapon: {
    attackBonus
  }
});

const eventOfType = <Type extends TurnEvent["type"]>(
  events: readonly TurnEvent[],
  type: Type
): Extract<TurnEvent, { readonly type: Type }> => {
  const event = events.find(
    (candidate): candidate is Extract<TurnEvent, { readonly type: Type }> =>
      candidate.type === type
  );

  if (event === undefined) {
    throw new Error(`missing event ${type}`);
  }

  return event;
};
