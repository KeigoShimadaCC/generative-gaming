import { describe, expect, it } from "vitest";

import { bounds, config } from "../config/index.js";
import { rosterAffordable } from "../engine/enemies/cost.js";
import { depthBandForDepth } from "../engine/state/init.js";
import { placementLethalityCheck } from "../engine/systems/traps.js";
import {
  BEHAVIOR_IDS,
  type DepthBand,
  type ItemDefinition,
} from "../schemas/entities/index.js";
import {
  EFFECT_VERB_IDS,
  type Effect,
  type EffectBundle,
  type Trigger,
  type TargetingShape,
} from "../schemas/vocab/index.js";
import { QUEST_OBJECTIVE_IDS } from "../schemas/entities/quests.js";
import { TRIGGER_IDS } from "../schemas/vocab/triggers.js";
import { TARGETING_SHAPE_IDS } from "../schemas/vocab/targeting.js";
import {
  getFallbackFloor,
  loadFallbackContentPack,
  type FallbackContentPack,
} from "./content-loader.js";

const pack = loadFallbackContentPack();

describe("fallback content loader", () => {
  it("loads and validates the full Old Stock pack", () => {
    expect(pack.items.size).toBeGreaterThanOrEqual(25);
    expect(pack.enemies.size).toBeGreaterThanOrEqual(18);
    expect(pack.traps.size).toBeGreaterThanOrEqual(8);
    expect(pack.npcs.size).toBe(4);
    expect(pack.quests.size).toBeGreaterThanOrEqual(4);
    expect(pack.floors.size).toBe(12);
  });

  it("resolves typed floor accessors by depth", () => {
    const floor = getFallbackFloor(pack, 5);
    expect(floor.depth).toBe(5);
    expect(floor.band).toBe("middle");
    expect(floor.roster.length).toBeGreaterThan(0);
    expect(floor.items.length).toBeGreaterThanOrEqual(4);
    expect(floor.npcs[0]?.id).toBe("oldstock-keeper-tomas");
    expect(floor.quest?.id).toBe("oldstock-quest-clear-spores");
  });
});

describe("fallback pack roster affordability", () => {
  it("keeps every floor roster within band spawn budgets", () => {
    for (let depth = 1; depth <= config.runStructure.depthFloors; depth += 1) {
      const floor = getFallbackFloor(pack, depth);
      expect(
        rosterAffordable(floor.roster, floor.band),
        `depth ${depth} roster exceeds ${floor.band} budget`,
      ).toBe(true);
    }
  });
});

describe("fallback pack trap lethality", () => {
  it("keeps every referenced trap non-lethal from band-typical full HP", () => {
    for (let depth = 1; depth <= config.runStructure.depthFloors; depth += 1) {
      const floor = getFallbackFloor(pack, depth);
      for (const trap of floor.traps) {
        const result = placementLethalityCheck(trap, floor.band);
        expect(result.ok, `${trap.id} on depth ${depth}`).toBe(true);
      }
    }
  });
});

describe("fallback pack food-floor rule", () => {
  it("includes at least one food item on every Shallows and Middle floor", () => {
    for (let depth = 1; depth <= config.runStructure.depthFloors; depth += 1) {
      const band = depthBandForDepth(depth);
      if (
        !(
          bounds.itemsEconomy.antiStarvationFoodFloorRule.requiredBands as readonly DepthBand[]
        ).includes(band)
      ) {
        continue;
      }

      const floor = getFallbackFloor(pack, depth);
      const foodCount = floor.items.filter((item) => item.kind === "food").length;
      expect(
        foodCount,
        `depth ${depth} (${band}) must include food`,
      ).toBeGreaterThanOrEqual(bounds.itemsEconomy.antiStarvationFoodFloorRule.minFoodItems);
    }
  });
});

describe("fallback pack vocabulary coverage", () => {
  it("uses every effect verb, trigger, targeting shape, behavior, and quest objective type", () => {
    const coverage = collectVocabularyCoverage(pack);

    expect(Object.fromEntries([...EFFECT_VERB_IDS].map((id) => [id, coverage.verbs.has(id)]))).toEqual(
      Object.fromEntries(EFFECT_VERB_IDS.map((id) => [id, true])),
    );
    expect(Object.fromEntries([...TRIGGER_IDS].map((id) => [id, coverage.triggers.has(id)]))).toEqual(
      Object.fromEntries(TRIGGER_IDS.map((id) => [id, true])),
    );
    expect(
      Object.fromEntries(
        [...TARGETING_SHAPE_IDS].map((id) => [id, coverage.targeting.has(id)]),
      ),
    ).toEqual(Object.fromEntries(TARGETING_SHAPE_IDS.map((id) => [id, true])));
    expect(
      Object.fromEntries([...BEHAVIOR_IDS].map((id) => [id, coverage.behaviors.has(id)])),
    ).toEqual(Object.fromEntries(BEHAVIOR_IDS.map((id) => [id, true])));
    expect(
      Object.fromEntries(
        [...QUEST_OBJECTIVE_IDS].map((id) => [id, coverage.questObjectives.has(id)]),
      ),
    ).toEqual(Object.fromEntries(QUEST_OBJECTIVE_IDS.map((id) => [id, true])));
  });
});

describe("fallback pack content requirements", () => {
  it("includes proc weapons, cursed gear, and all item categories", () => {
    const items = [...pack.items.values()];
    const categories = new Set(items.map((item) => item.kind));

    expect(items.some((item) => item.weapon?.onHit !== null)).toBe(true);
    expect(
      items.some(
        (item) =>
          item.weapon?.cursed === true ||
          item.armor?.cursed === true ||
          item.charm?.cursed === true,
      ),
    ).toBe(true);

    for (const category of [
      "weapon",
      "armor",
      "charm",
      "draught",
      "note",
      "throwable",
      "food",
      "tool",
      "key_item",
      "coin",
    ] as const) {
      expect(categories.has(category), `missing category ${category}`).toBe(true);
    }
  });

  it("uses Old Stock origin for enemies and covers at least four quest objective types", () => {
    expect([...pack.enemies.values()].every((enemy) => enemy.origin === "old_stock")).toBe(
      true,
    );

    const objectiveKinds = new Set(
      [...pack.quests.values()].map((quest) => quest.objective.kind),
    );
    expect(objectiveKinds.size).toBeGreaterThanOrEqual(4);
  });
});

type VocabularyCoverage = {
  readonly verbs: Set<string>;
  readonly triggers: Set<string>;
  readonly targeting: Set<string>;
  readonly behaviors: Set<string>;
  readonly questObjectives: Set<string>;
};

const collectVocabularyCoverage = (content: FallbackContentPack): VocabularyCoverage => {
  const verbs = new Set<string>();
  const triggers = new Set<string>();
  const targeting = new Set<string>();
  const behaviors = new Set<string>();
  const questObjectives = new Set<string>();

  for (const item of content.items.values()) {
    collectItemCoverage(item, verbs, triggers, targeting);
  }

  for (const enemy of content.enemies.values()) {
    for (const behavior of enemy.behaviors) {
      behaviors.add(behavior.kind);
    }
    for (const ability of enemy.abilities) {
      collectBundleCoverage(ability, verbs, triggers, targeting);
    }
  }

  for (const trap of content.traps.values()) {
    collectBundleCoverage(trap.effectBundle, verbs, triggers, targeting);
  }

  for (const quest of content.quests.values()) {
    questObjectives.add(quest.objective.kind);
  }

  for (const npc of content.npcs.values()) {
    if (npc.questHook !== null) {
      questObjectives.add(npc.questHook.objective.kind);
    }
  }

  return { verbs, triggers, targeting, behaviors, questObjectives };
};

const collectItemCoverage = (
  item: ItemDefinition,
  verbs: Set<string>,
  triggers: Set<string>,
  targeting: Set<string>,
): void => {
  if (item.weapon?.onHit !== null && item.weapon?.onHit !== undefined) {
    collectBundleCoverage(item.weapon.onHit.bundle, verbs, triggers, targeting);
  }
  if (item.armor?.onStruck !== null && item.armor?.onStruck !== undefined) {
    collectBundleCoverage(item.armor.onStruck.bundle, verbs, triggers, targeting);
  }
  if (item.charm !== null) {
    collectBundleCoverage(item.charm.passive, verbs, triggers, targeting);
  }
  if (item.draught !== null) {
    collectBundleCoverage(item.draught.effect, verbs, triggers, targeting);
  }
  if (item.note !== null) {
    collectBundleCoverage(item.note.effect, verbs, triggers, targeting);
  }
  if (item.throwable !== null) {
    collectBundleCoverage(item.throwable.effect, verbs, triggers, targeting);
  }
  if (item.food !== null) {
    collectBundleCoverage(item.food.effect, verbs, triggers, targeting);
  }
  if (item.tool !== null) {
    collectBundleCoverage(item.tool.effect, verbs, triggers, targeting);
  }
};

const collectBundleCoverage = (
  bundle: EffectBundle,
  verbs: Set<string>,
  triggers: Set<string>,
  targeting: Set<string>,
): void => {
  for (const effect of bundle.effects) {
    collectEffectCoverage(effect, verbs);
  }
  collectTriggerCoverage(bundle.trigger, triggers);
  collectTargetingCoverage(bundle.targeting, targeting);
};

const collectEffectCoverage = (effect: Effect, verbs: Set<string>): void => {
  verbs.add(effect.kind);
};

const collectTriggerCoverage = (trigger: Trigger, triggers: Set<string>): void => {
  triggers.add(trigger.kind);
};

const collectTargetingCoverage = (
  shape: TargetingShape,
  targeting: Set<string>,
): void => {
  targeting.add(shape.kind);
};
