import { describe, expect, it } from "vitest";

import { bounds } from "../../config/index.js";
import {
  EffectBundleSchema,
  EffectSchema,
  RuntimeStatusApplicationSchema,
  STATUS_IDS,
  StatusApplicationSchema,
  TargetingShapeSchema,
  TriggerSchema,
} from "./index.js";
import {
  makeEffectBundleFixture,
  makeEffectFixture,
  makeTargetingFixture,
  makeTriggerFixture,
  validBoltTargetingFixture,
  validBurstTargetingFixture,
  validDamageEffectFixture,
  validEffectBundleFixture,
  validEffectFixtures,
  validOnHitTriggerFixture,
  validOnStruckTriggerFixture,
  validTargetingFixtures,
  validTriggerFixtures,
  validUseTriggerFixture,
} from "../fixtures/vocab.js";

const expectPasses = (schema: SchemaLike, value: unknown): void => {
  expect(schema.safeParse(value).success).toBe(true);
};

const expectFails = (schema: SchemaLike, value: unknown): void => {
  expect(schema.safeParse(value).success).toBe(false);
};

type SchemaLike = {
  readonly safeParse: (value: unknown) => { readonly success: boolean };
};

describe("status vocabulary schemas", () => {
  it("accepts a valid status application fixture", () => {
    expectPasses(StatusApplicationSchema, {
      status: "poison",
      duration: bounds.statusVocabulary.durationTurns.poison.min,
    });
  });

  it("rejects every per-status duration below and above bounds", () => {
    for (const status of STATUS_IDS) {
      const durationBounds = bounds.statusVocabulary.durationTurns[status];

      expectFails(StatusApplicationSchema, {
        status,
        duration: durationBounds.min - 1,
      });
      expectFails(StatusApplicationSchema, {
        status,
        duration: durationBounds.max + 1,
      });
    }
  });

  it("rejects malformed and extra-property status applications", () => {
    expectFails(StatusApplicationSchema, {
      status: "not_a_status",
      duration: bounds.statusVocabulary.durationTurns.poison.min,
    });
    expectFails(StatusApplicationSchema, {
      status: "poison",
      duration: bounds.statusVocabulary.durationTurns.poison.min,
      extra: true,
    });
  });

  it("keeps authoring minimums while runtime status durations may decay", () => {
    const burnBounds = bounds.statusVocabulary.durationTurns.burn;

    expectFails(StatusApplicationSchema, {
      status: "burn",
      duration: burnBounds.min - 1,
    });
    expectPasses(RuntimeStatusApplicationSchema, {
      status: "burn",
      duration: burnBounds.min - 1,
    });
    expectPasses(RuntimeStatusApplicationSchema, {
      status: "burn",
      duration: 0,
    });
    expectFails(RuntimeStatusApplicationSchema, {
      status: "burn",
      duration: -1,
    });
    expectFails(RuntimeStatusApplicationSchema, {
      status: "burn",
      duration: burnBounds.max + 1,
    });
  });
});

describe("effect vocabulary schemas", () => {
  it("accepts valid fixtures for every effect verb", () => {
    for (const effect of validEffectFixtures) {
      expectPasses(EffectSchema, effect);
    }
  });

  it("rejects damage and heal amounts outside bounds", () => {
    const damageBounds = bounds.effectVocabulary.verbs.damage.amount;
    expectFails(
      EffectSchema,
      makeEffectFixture("damage", "damage", {
        amount: damageBounds.min - 1,
      }),
    );
    expectFails(
      EffectSchema,
      makeEffectFixture("damage", "damage", {
        amount: damageBounds.max + 1,
      }),
    );

    const healBounds = bounds.effectVocabulary.verbs.heal.amount;
    expectFails(
      EffectSchema,
      makeEffectFixture("heal", "heal", {
        amount: healBounds.min - 1,
      }),
    );
    expectFails(
      EffectSchema,
      makeEffectFixture("heal", "heal", {
        amount: healBounds.max + 1,
      }),
    );
  });

  it("rejects apply_status durations outside the selected status bounds", () => {
    const burnBounds = bounds.statusVocabulary.durationTurns.burn;

    expectFails(
      EffectSchema,
      makeEffectFixture("apply_status", "applyStatus", {
        status: "burn",
        duration: burnBounds.min - 1,
      }),
    );
    expectFails(
      EffectSchema,
      makeEffectFixture("apply_status", "applyStatus", {
        status: "burn",
        duration: burnBounds.max + 1,
      }),
    );
  });

  it("rejects buff_stat magnitude and duration outside bounds", () => {
    const magnitudeBounds = bounds.effectVocabulary.verbs.buffStat.magnitudeAbs;
    const durationBounds = bounds.effectVocabulary.verbs.buffStat.durationTurns;

    for (const magnitude of [
      0,
      magnitudeBounds.max + 1,
      -(magnitudeBounds.max + 1),
    ]) {
      expectFails(
        EffectSchema,
        makeEffectFixture("buff_stat", "buffStat", {
          stat: "ATK",
          magnitude,
          duration: durationBounds.min,
        }),
      );
    }

    expectFails(
      EffectSchema,
      makeEffectFixture("buff_stat", "buffStat", {
        stat: "DEF",
        magnitude: magnitudeBounds.min,
        duration: durationBounds.min - 1,
      }),
    );
    expectFails(
      EffectSchema,
      makeEffectFixture("buff_stat", "buffStat", {
        stat: "DEF",
        magnitude: magnitudeBounds.min,
        duration: durationBounds.max + 1,
      }),
    );
  });

  it("rejects nutrition, blink, knockback, summon, and dig values outside bounds", () => {
    const nutritionBounds = bounds.effectVocabulary.verbs.nutrition.fullness;
    expectFails(
      EffectSchema,
      makeEffectFixture("nutrition", "nutrition", {
        fullness: nutritionBounds.min - 1,
      }),
    );
    expectFails(
      EffectSchema,
      makeEffectFixture("nutrition", "nutrition", {
        fullness: nutritionBounds.max + 1,
      }),
    );

    const blinkBounds = bounds.effectVocabulary.verbs.blink.distanceTiles;
    expectFails(
      EffectSchema,
      makeEffectFixture("blink", "blink", {
        distanceTiles: blinkBounds.min - 1,
      }),
    );
    expectFails(
      EffectSchema,
      makeEffectFixture("blink", "blink", {
        distanceTiles: blinkBounds.max + 1,
      }),
    );

    const knockbackBounds = bounds.effectVocabulary.verbs.knockback;
    expectFails(
      EffectSchema,
      makeEffectFixture("knockback", "knockback", {
        pushTiles: knockbackBounds.pushTiles.min - 1,
        collisionDamage: knockbackBounds.collisionDamage.min,
      }),
    );
    expectFails(
      EffectSchema,
      makeEffectFixture("knockback", "knockback", {
        pushTiles: knockbackBounds.pushTiles.max + 1,
        collisionDamage: knockbackBounds.collisionDamage.min,
      }),
    );
    expectFails(
      EffectSchema,
      makeEffectFixture("knockback", "knockback", {
        pushTiles: knockbackBounds.pushTiles.min,
        collisionDamage: knockbackBounds.collisionDamage.min - 1,
      }),
    );
    expectFails(
      EffectSchema,
      makeEffectFixture("knockback", "knockback", {
        pushTiles: knockbackBounds.pushTiles.min,
        collisionDamage: knockbackBounds.collisionDamage.max + 1,
      }),
    );

    const summonBounds = bounds.effectVocabulary.verbs.summon.count;
    expectFails(
      EffectSchema,
      makeEffectFixture("summon", "summon", {
        count: summonBounds.min - 1,
        rosterEntityId: "enemy-1",
      }),
    );
    expectFails(
      EffectSchema,
      makeEffectFixture("summon", "summon", {
        count: summonBounds.max + 1,
        rosterEntityId: "enemy-1",
      }),
    );

    const digBounds = bounds.effectVocabulary.verbs.dig.lengthTiles;
    expectFails(
      EffectSchema,
      makeEffectFixture("dig", "dig", {
        lengthTiles: digBounds.min - 1,
      }),
    );
    expectFails(
      EffectSchema,
      makeEffectFixture("dig", "dig", {
        lengthTiles: digBounds.max + 1,
      }),
    );
  });

  it("rejects malformed, inactive, and extra-property effect objects", () => {
    expectFails(EffectSchema, {
      ...validDamageEffectFixture,
      kind: "not_a_verb",
    });
    expectFails(EffectSchema, {
      ...validDamageEffectFixture,
      damage: null,
    });
    expectFails(EffectSchema, {
      ...validDamageEffectFixture,
      heal: { amount: bounds.effectVocabulary.verbs.heal.amount.min },
    });
    expectFails(EffectSchema, {
      ...validDamageEffectFixture,
      extra: true,
    });
    expectFails(EffectSchema, {
      ...validDamageEffectFixture,
      damage: {
        amount: bounds.effectVocabulary.verbs.damage.amount.min,
        extra: true,
      },
    });
  });
});

describe("trigger vocabulary schemas", () => {
  it("accepts valid fixtures for every trigger", () => {
    for (const trigger of validTriggerFixtures) {
      expectPasses(TriggerSchema, trigger);
    }
  });

  it("rejects proc chance and tool charges outside bounds", () => {
    const onHitBounds =
      bounds.effectVocabulary.triggers.procChancePercent.onHit;
    expectFails(
      TriggerSchema,
      makeTriggerFixture("on_hit", "onHit", {
        procChancePercent: onHitBounds.min - 1,
      }),
    );
    expectFails(
      TriggerSchema,
      makeTriggerFixture("on_hit", "onHit", {
        procChancePercent: onHitBounds.max + 1,
      }),
    );

    const onStruckBounds =
      bounds.effectVocabulary.triggers.procChancePercent.onStruck;
    expectFails(
      TriggerSchema,
      makeTriggerFixture("on_struck", "onStruck", {
        procChancePercent: onStruckBounds.min - 1,
      }),
    );
    expectFails(
      TriggerSchema,
      makeTriggerFixture("on_struck", "onStruck", {
        procChancePercent: onStruckBounds.max + 1,
      }),
    );

    const chargeBounds = bounds.effectVocabulary.triggers.toolCharges;
    expectFails(
      TriggerSchema,
      makeTriggerFixture("use", "use", {
        charges: chargeBounds.min - 1,
      }),
    );
    expectFails(
      TriggerSchema,
      makeTriggerFixture("use", "use", {
        charges: chargeBounds.max + 1,
      }),
    );
  });

  it("rejects malformed and extra-property trigger objects", () => {
    expectFails(TriggerSchema, {
      ...validOnHitTriggerFixture,
      kind: "not_a_trigger",
    });
    expectFails(TriggerSchema, {
      ...validOnStruckTriggerFixture,
      extra: true,
    });
    expectFails(TriggerSchema, {
      ...validUseTriggerFixture,
      use: {
        charges: bounds.effectVocabulary.triggers.toolCharges.min,
        extra: true,
      },
    });
  });
});

describe("targeting vocabulary schemas", () => {
  it("accepts valid fixtures for every targeting shape", () => {
    for (const targeting of validTargetingFixtures) {
      expectPasses(TargetingShapeSchema, targeting);
    }
  });

  it("rejects bolt range and burst radius outside bounds", () => {
    const rangeBounds = bounds.effectVocabulary.targetingShapes.boltRangeTiles;
    expectFails(
      TargetingShapeSchema,
      makeTargetingFixture("bolt", "bolt", {
        rangeTiles: rangeBounds.min - 1,
      }),
    );
    expectFails(
      TargetingShapeSchema,
      makeTargetingFixture("bolt", "bolt", {
        rangeTiles: rangeBounds.max + 1,
      }),
    );

    const radiusBounds =
      bounds.effectVocabulary.targetingShapes.burstRadiusTiles;
    expectFails(
      TargetingShapeSchema,
      makeTargetingFixture("burst", "burst", {
        radiusTiles: radiusBounds.min - 1,
        center: "self",
      }),
    );
    expectFails(
      TargetingShapeSchema,
      makeTargetingFixture("burst", "burst", {
        radiusTiles: radiusBounds.max + 1,
        center: "impact",
      }),
    );
  });

  it("rejects malformed and extra-property targeting objects", () => {
    expectFails(TargetingShapeSchema, {
      ...validBoltTargetingFixture,
      kind: "not_targeting",
    });
    expectFails(TargetingShapeSchema, {
      ...validBurstTargetingFixture,
      extra: true,
    });
  });
});

describe("effect bundle schema", () => {
  it("accepts a valid effect bundle fixture", () => {
    expectPasses(EffectBundleSchema, validEffectBundleFixture);
  });

  it("rejects effect counts outside bundle bounds", () => {
    expectFails(
      EffectBundleSchema,
      makeEffectBundleFixture(
        [],
        validEffectBundleFixture.trigger,
        validEffectBundleFixture.targeting,
      ),
    );
    expectFails(
      EffectBundleSchema,
      makeEffectBundleFixture(
        [
          validDamageEffectFixture,
          validDamageEffectFixture,
          validDamageEffectFixture,
          validDamageEffectFixture,
        ],
        validEffectBundleFixture.trigger,
        validEffectBundleFixture.targeting,
      ),
    );
  });

  it("rejects extra properties on bundles", () => {
    expectFails(EffectBundleSchema, {
      ...validEffectBundleFixture,
      extra: true,
    });
  });
});
