import { describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import type {
  Behavior,
  DepthBand,
  EnemyDefinition,
} from "../../schemas/entities/index.js";
import {
  makeBehaviorFixture,
  validApproachMeleeBehaviorFixture,
  validFleeLowHpBehaviorFixture,
} from "../../schemas/fixtures/entities.js";
import {
  makeEffectBundleFixture,
  makeEffectFixture,
  validMeleeTargetingFixture,
  validSelfTargetingFixture,
  validUseTriggerFixture,
  validBuffStatEffectFixture,
} from "../../schemas/fixtures/vocab.js";
import type { Effect, EffectBundle, TargetingShape } from "../../schemas/vocab/index.js";
import { createRng } from "../rng/index.js";
import { createInitialState, deserialize, serialize } from "../state/index.js";
import type { GameState } from "../state/index.js";
import { assemble } from "./assembly.js";
import {
  costOf,
  effectCost,
  rosterAffordable,
  statsWithinBand,
  xpYieldFromCost,
  xpYieldOf,
} from "./cost.js";

describe("enemy cost reference table", () => {
  it("prices reference enemies exactly", () => {
    const referenceEnemies = [
      {
        name: "Shallows rat",
        definition: enemyDefinition({
          id: "shallows-rat",
          band: "shallows",
          hp: 4,
          attack: 2,
          defense: 0,
          xpYield: 2,
          behaviors: [validApproachMeleeBehaviorFixture],
        }),
        // Stats: base 1. Behavior: approach_melee 1. Total 2.
        expectedCost: 2,
        expectedXp: 2,
      },
      {
        name: "Shallows bog bat",
        definition: enemyDefinition({
          id: "shallows-bog-bat",
          band: "shallows",
          hp: 6,
          attack: 3,
          defense: 0,
          xpYield: 3,
          behaviors: [
            validApproachMeleeBehaviorFixture,
            ambusherBehavior(1),
          ],
        }),
        // Stats: base 1 + hp 1 + atk 2 = 4. Behaviors: approach 1 + ambusher 3 = 4. Total 8.
        expectedCost: 8,
        expectedXp: 3,
      },
      {
        name: "Shallows gutter thief",
        definition: enemyDefinition({
          id: "shallows-gutter-thief",
          band: "shallows",
          hp: 8,
          attack: 3,
          defense: 1,
          xpYield: 5,
          behaviors: [thiefBehavior(), validFleeLowHpBehaviorFixture],
          abilities: [blinkSelfAbility(2)],
        }),
        // Stats: base 1 + hp 2 + atk 2 + def 3 = 8. Behaviors: thief 4 + flee 2 = 6.
        // Ability: blink 3 + use trigger 2 + self targeting 0 = 5. Total 19.
        expectedCost: 19,
        expectedXp: 5,
      },
      {
        name: "Middle pack wolf",
        definition: enemyDefinition({
          id: "middle-pack-wolf",
          band: "middle",
          hp: 18,
          attack: 7,
          defense: 2,
          xpYield: 7,
          behaviors: [
            packHunterBehavior(2),
            validApproachMeleeBehaviorFixture,
          ],
        }),
        // Stats: base 4 + hp 3 + atk 4 + def 3 = 14. Behaviors: pack 3 + approach 1 = 4. Total 18.
        expectedCost: 18,
        expectedXp: 7,
      },
      {
        name: "Middle range cultist",
        definition: enemyDefinition({
          id: "middle-range-cultist",
          band: "middle",
          hp: 16,
          attack: 5,
          defense: 1,
          xpYield: 7,
          behaviors: [keepRangeBehavior(3), casterBehavior(4)],
          abilities: [damageBoltAbility(6, 3)],
        }),
        // Stats: base 4 + hp 2 = 6. Behaviors: keep_range 2 + caster 4 = 6.
        // Ability: damage 4 + use trigger 2 + bolt targeting 2 = 8. Total 20.
        expectedCost: 20,
        expectedXp: 7,
      },
      {
        name: "Middle oath bodyguard",
        definition: enemyDefinition({
          id: "middle-oath-bodyguard",
          band: "middle",
          hp: 24,
          attack: 8,
          defense: 4,
          xpYield: 11,
          behaviors: [
            guardBehavior(2),
            bodyguardBehavior(),
            validApproachMeleeBehaviorFixture,
          ],
        }),
        // Stats: base 4 + hp 6 + atk 6 + def 9 = 25. Behaviors: guard 2 + bodyguard 4 + approach 1 = 7. Total 32.
        expectedCost: 32,
        expectedXp: 11,
      },
      {
        name: "Lowest ash caster",
        definition: enemyDefinition({
          id: "lowest-ash-caster",
          band: "lowest",
          hp: 30,
          attack: 10,
          defense: 3,
          xpYield: 12,
          behaviors: [territorialBehavior(3), casterBehavior(5)],
          abilities: [burnBoltAbility(2, 3)],
        }),
        // Stats: base 8 + hp 3 + atk 2 = 13. Behaviors: territorial 2 + caster 4 = 6.
        // Ability: apply_status 3 + use trigger 2 + bolt targeting 2 = 7. Total 26.
        expectedCost: 26,
        expectedXp: 12,
      },
      {
        name: "Lowest iron mimic",
        definition: enemyDefinition({
          id: "lowest-iron-mimic",
          band: "lowest",
          hp: 42,
          attack: 14,
          defense: 6,
          xpYield: 20,
          behaviors: [
            mimicBehavior(),
            ambusherBehavior(2),
            validApproachMeleeBehaviorFixture,
          ],
          abilities: [knockbackMeleeAbility(2, 2)],
        }),
        // Stats: base 8 + hp 9 + atk 10 + def 9 = 36. Behaviors: mimic 5 + ambusher 3 + approach 1 = 9.
        // Ability: knockback 6 + use trigger 2 + melee targeting 0 = 8. Total 53.
        expectedCost: 53,
        expectedXp: 20,
      },
    ] as const;

    const priced = referenceEnemies.map((entry) => ({
      name: entry.name,
      cost: costOf(entry.definition),
      xp: xpYieldOf(entry.definition),
    }));

    expect(priced).toMatchInlineSnapshot(`
      [
        {
          "cost": 2,
          "name": "Shallows rat",
          "xp": 2,
        },
        {
          "cost": 8,
          "name": "Shallows bog bat",
          "xp": 3,
        },
        {
          "cost": 19,
          "name": "Shallows gutter thief",
          "xp": 5,
        },
        {
          "cost": 18,
          "name": "Middle pack wolf",
          "xp": 7,
        },
        {
          "cost": 20,
          "name": "Middle range cultist",
          "xp": 7,
        },
        {
          "cost": 32,
          "name": "Middle oath bodyguard",
          "xp": 11,
        },
        {
          "cost": 26,
          "name": "Lowest ash caster",
          "xp": 12,
        },
        {
          "cost": 53,
          "name": "Lowest iron mimic",
          "xp": 20,
        },
      ]
    `);

    for (const entry of referenceEnemies) {
      expect(costOf(entry.definition)).toBe(entry.expectedCost);
      expect(xpYieldOf(entry.definition)).toBe(entry.expectedXp);
    }
  });
});

describe("enemy cost monotonicity", () => {
  it("never prices a stronger seeded superset below its base", () => {
    const rng = createRng("phase-16-enemy-cost-monotonicity");
    const bands = ["shallows", "middle", "lowest"] as const;

    for (let index = 0; index < 96; index += 1) {
      const band = rng.pick(bands);
      const statBounds = bounds.enemyDesign.statBudgetsByBand[band];
      const hp = rng.int(statBounds.hp.min, statBounds.hp.max - 2);
      const attack = rng.int(statBounds.attack.min, statBounds.attack.max - 1);
      const defense = rng.int(
        statBounds.defense.min,
        statBounds.defense.max - 1,
      );
      const damage = rng.int(
        bounds.effectVocabulary.verbs.damage.amount.min,
        bounds.effectVocabulary.verbs.damage.amount.max - 2,
      );
      const range = rng.int(
        bounds.effectVocabulary.targetingShapes.boltRangeTiles.min,
        bounds.effectVocabulary.targetingShapes.boltRangeTiles.max - 1,
      );

      const base = enemyDefinition({
        id: `base-${index}`,
        band,
        hp,
        attack,
        defense,
        xpYield: statBounds.xpYield.min,
        behaviors: [validApproachMeleeBehaviorFixture],
        abilities: [damageBoltAbility(damage, range)],
      });
      const stronger = enemyDefinition({
        id: `stronger-${index}`,
        band,
        hp: rng.int(hp, statBounds.hp.max),
        attack: rng.int(attack, statBounds.attack.max),
        defense: rng.int(defense, statBounds.defense.max),
        xpYield: statBounds.xpYield.min,
        behaviors: [
          validApproachMeleeBehaviorFixture,
          territorialBehavior(2),
          casterBehavior(3),
        ],
        abilities: [
          damageBoltAbility(
            rng.int(damage, bounds.effectVocabulary.verbs.damage.amount.max),
            rng.int(
              range,
              bounds.effectVocabulary.targetingShapes.boltRangeTiles.max,
            ),
          ),
          blinkSelfAbility(bounds.effectVocabulary.verbs.blink.distanceTiles.min),
        ],
      });

      expect(costOf(stronger), `case ${index}`).toBeGreaterThanOrEqual(
        costOf(base),
      );
    }
  });
});

describe("effect cost payload tolerance", () => {
  it("prices an undefined buff_stat payload as zero magnitude-duration", () => {
    const withoutPayload = { ...validBuffStatEffectFixture } as Partial<Effect>;
    delete withoutPayload.buffStat;

    expect(effectCost(withoutPayload as Effect)).toBe(
      config.enemyDesign.costWeights.effects.verbs.buff_stat,
    );
  });
});

describe("enemy band validation and XP yield", () => {
  it("checks stat rows against GAME_DESIGN section 9.1 bands", () => {
    const bands = ["shallows", "middle", "lowest"] as const;

    for (const band of bands) {
      const statBounds = bounds.enemyDesign.statBudgetsByBand[band];
      const minDefinition = enemyDefinition({
        id: `${band}-min`,
        band,
        hp: statBounds.hp.min,
        attack: statBounds.attack.min,
        defense: statBounds.defense.min,
        xpYield: statBounds.xpYield.min,
        behaviors: [validApproachMeleeBehaviorFixture],
      });
      const maxDefinition = enemyDefinition({
        id: `${band}-max`,
        band,
        hp: statBounds.hp.max,
        attack: statBounds.attack.max,
        defense: statBounds.defense.max,
        xpYield: statBounds.xpYield.max,
        behaviors: [validApproachMeleeBehaviorFixture],
      });
      const overHp = enemyDefinition({
        id: `${band}-over-hp`,
        band,
        hp: statBounds.hp.max + 1,
        attack: statBounds.attack.min,
        defense: statBounds.defense.min,
        xpYield: statBounds.xpYield.min,
        behaviors: [validApproachMeleeBehaviorFixture],
      });
      const underXp = enemyDefinition({
        id: `${band}-under-xp`,
        band,
        hp: statBounds.hp.min,
        attack: statBounds.attack.min,
        defense: statBounds.defense.min,
        xpYield: statBounds.xpYield.min - 1,
        behaviors: [validApproachMeleeBehaviorFixture],
      });

      expect(statsWithinBand(minDefinition, band)).toBe(true);
      expect(statsWithinBand(maxDefinition, band)).toBe(true);
      expect(statsWithinBand(overHp, band)).toBe(false);
      expect(statsWithinBand(underXp, band)).toBe(false);
    }
  });

  it("answers roster affordability in one call", () => {
    const rat = enemyDefinition({
      id: "affordable-rat",
      band: "shallows",
      hp: 4,
      attack: 2,
      defense: 0,
      xpYield: 2,
      behaviors: [validApproachMeleeBehaviorFixture],
    });
    const expensive = enemyDefinition({
      id: "unaffordable-thief",
      band: "shallows",
      hp: 8,
      attack: 3,
      defense: 1,
      xpYield: 5,
      behaviors: [thiefBehavior(), validFleeLowHpBehaviorFixture],
      abilities: [blinkSelfAbility(2)],
    });

    expect(rosterAffordable(Array.from({ length: 10 }, () => rat), "shallows"))
      .toBe(true);
    expect(rosterAffordable([expensive, expensive], "shallows")).toBe(false);
    expect(rosterAffordable([rat], "middle")).toBe(false);
  });

  it("maps cost to band-clamped XP yield", () => {
    expect(xpYieldFromCost(0, "shallows")).toBe(
      bounds.enemyDesign.statBudgetsByBand.shallows.xpYield.min,
    );
    expect(xpYieldFromCost(1000, "lowest")).toBe(
      bounds.enemyDesign.statBudgetsByBand.lowest.xpYield.max,
    );
    expect(xpYieldFromCost(20, "middle")).toBe(7);
  });
});

describe("enemy assembly", () => {
  it("creates live entities with behavior runtime and stable serialization", () => {
    const definition = enemyDefinition({
      id: "assembled-mimic-caster",
      band: "shallows",
      hp: 10,
      attack: 3,
      defense: 1,
      xpYield: 4,
      behaviors: [mimicBehavior(), ambusherBehavior(1), casterBehavior(3)],
      abilities: [damageBoltAbility(4, 3)],
    });
    const entity = assemble(definition, {
      id: "enemy#1",
      position: { x: 2, y: 3 },
    });
    const state = withEntity(createInitialState("enemy-assembly"), entity);
    const serialized = serialize(state);
    const deserialized = deserialize(serialized);
    const roundTripped = deserialized.entities["enemy#1"];

    expect(entity).toMatchObject({
      id: "enemy#1",
      kind: "enemy",
      position: { x: 2, y: 3 },
      currentHP: 10,
      behaviorRuntime: {
        abilityCooldowns: [0],
        disguisedAsItem: true,
        mimicRevealed: false,
        hidden: true,
        ambusherAwake: false,
      },
    });
    expect(serialize(deserialized)).toBe(serialized);
    expect(roundTripped?.kind).toBe("enemy");
    expect(roundTripped?.behaviorRuntime).toEqual(entity.behaviorRuntime);
  });
});

interface EnemyDefinitionInput {
  readonly id: string;
  readonly band: DepthBand;
  readonly hp: number;
  readonly attack: number;
  readonly defense: number;
  readonly xpYield: number;
  readonly behaviors: readonly Behavior[];
  readonly abilities?: readonly EffectBundle[];
}

const enemyDefinition = (input: EnemyDefinitionInput): EnemyDefinition => ({
  id: input.id,
  name: input.id,
  glyph: "e",
  origin: "made",
  stats: {
    band: input.band,
    hp: input.hp,
    attack: input.attack,
    defense: input.defense,
    xpYield: input.xpYield,
  },
  behaviors: [...input.behaviors],
  abilities: [...(input.abilities ?? [])],
});

const keepRangeBehavior = (distanceTiles: number): Behavior =>
  makeBehaviorFixture("keep_range", "keepRange", { distanceTiles });

const ambusherBehavior = (wakeRadiusTiles: number): Behavior =>
  makeBehaviorFixture("ambusher", "ambusher", { wakeRadiusTiles });

const territorialBehavior = (radiusTiles: number): Behavior =>
  makeBehaviorFixture("territorial", "territorial", { radiusTiles });

const guardBehavior = (tetherRadiusTiles: number): Behavior =>
  makeBehaviorFixture("guard", "guard", {
    tetherId: "guard-post",
    tetherRadiusTiles,
  });

const packHunterBehavior = (allyCount: number): Behavior =>
  makeBehaviorFixture("pack_hunter", "packHunter", { allyCount });

const thiefBehavior = (): Behavior => makeBehaviorFixture("thief", "thief", {});

const casterBehavior = (cooldownTurns: number): Behavior =>
  makeBehaviorFixture("caster", "caster", { cooldownTurns });

const bodyguardBehavior = (): Behavior =>
  makeBehaviorFixture("bodyguard", "bodyguard", {});

const mimicBehavior = (): Behavior => makeBehaviorFixture("mimic", "mimic", {});

const damageBoltAbility = (
  amount: number,
  rangeTiles: number,
): EffectBundle =>
  makeEffectBundleFixture(
    [makeEffectFixture("damage", "damage", { amount })],
    validUseTriggerFixture,
    boltTargeting(rangeTiles),
  );

const burnBoltAbility = (
  duration: number,
  rangeTiles: number,
): EffectBundle =>
  makeEffectBundleFixture(
    [
      makeEffectFixture("apply_status", "applyStatus", {
        status: "burn",
        duration,
      }),
    ],
    validUseTriggerFixture,
    boltTargeting(rangeTiles),
  );

const blinkSelfAbility = (distanceTiles: number): EffectBundle =>
  makeEffectBundleFixture(
    [makeEffectFixture("blink", "blink", { distanceTiles })],
    validUseTriggerFixture,
    validSelfTargetingFixture,
  );

const knockbackMeleeAbility = (
  pushTiles: number,
  collisionDamage: number,
): EffectBundle =>
  makeEffectBundleFixture(
    [
      makeEffectFixture("knockback", "knockback", {
        pushTiles,
        collisionDamage,
      }),
    ],
    validUseTriggerFixture,
    validMeleeTargetingFixture,
  );

const boltTargeting = (rangeTiles: number): TargetingShape => ({
  kind: "bolt",
  self: null,
  melee: null,
  bolt: { rangeTiles },
  burst: null,
  floor: null,
});

const withEntity = (
  state: GameState,
  entity: ReturnType<typeof assemble>,
): GameState => ({
  ...state,
  entities: {
    ...state.entities,
    [entity.id]: entity,
  },
  ids: {
    ...state.ids,
    entityCounters: {
      ...state.ids.entityCounters,
      enemy: 1,
    },
  },
});
