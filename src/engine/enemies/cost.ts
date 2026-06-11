import { bounds, config } from "../../config/index.js";
import type {
  Behavior,
  DepthBand,
  EnemyDefinition,
} from "../../schemas/entities/index.js";
import type {
  Effect,
  EffectBundle,
  TargetingShape,
  Trigger,
} from "../../schemas/vocab/index.js";

const costWeights = config.enemyDesign.costWeights;

export const costOf = (definition: EnemyDefinition): number =>
  statCost(definition) +
  definition.behaviors.reduce(
    (total, behavior) => total + behaviorCost(behavior),
    0,
  ) +
  definition.abilities.reduce(
    (total, bundle) => total + abilityBundleCost(bundle),
    0,
  );

export const statsWithinBand = (
  definition: EnemyDefinition,
  band: DepthBand,
): boolean => {
  if (definition.stats.band !== band) {
    return false;
  }

  const budget = bounds.enemyDesign.statBudgetsByBand[band];

  return (
    inRange(definition.stats.hp, budget.hp) &&
    inRange(definition.stats.attack, budget.attack) &&
    inRange(definition.stats.defense, budget.defense) &&
    inRange(definition.stats.xpYield, budget.xpYield)
  );
};

export const rosterCost = (definitions: readonly EnemyDefinition[]): number =>
  definitions.reduce((total, definition) => total + costOf(definition), 0);

export const rosterAffordable = (
  definitions: readonly EnemyDefinition[],
  band: DepthBand,
): boolean =>
  definitions.every((definition) => statsWithinBand(definition, band)) &&
  rosterCost(definitions) <= config.enemyDesign.spawnBudgetPoints[band];

export const xpYieldFromCost = (cost: number, band: DepthBand): number => {
  const mapping = costWeights.xpYieldByCost[band];
  const xpBounds = bounds.enemyDesign.statBudgetsByBand[band].xpYield;
  const mapped = Math.floor(cost / mapping.pointsPerXp) + mapping.offset;

  return clamp(mapped, xpBounds.min, xpBounds.max);
};

export const xpYieldOf = (definition: EnemyDefinition): number =>
  xpYieldFromCost(costOf(definition), definition.stats.band);

export const statCost = (definition: EnemyDefinition): number => {
  const band = definition.stats.band;
  const bandBudget = bounds.enemyDesign.statBudgetsByBand[band];
  const statWeights = costWeights.stats;

  return (
    statWeights.baseByBand[band] +
    ceilDiv(
      nonNegativeDelta(definition.stats.hp, bandBudget.hp.min),
      statWeights.hpDeltaDivisor,
    ) +
    nonNegativeDelta(definition.stats.attack, bandBudget.attack.min) *
      statWeights.attackDelta +
    nonNegativeDelta(definition.stats.defense, bandBudget.defense.min) *
      statWeights.defenseDelta
  );
};

export const behaviorCost = (behavior: Behavior): number =>
  costWeights.behaviors[behavior.kind];

export const abilityBundleCost = (bundle: EffectBundle): number =>
  bundle.effects.reduce((total, effect) => total + effectCost(effect), 0) +
  triggerCost(bundle.trigger) +
  targetingCost(bundle.targeting);

export const effectCost = (effect: Effect): number => {
  const verbBase = costWeights.effects.verbs[effect.kind];
  const divisors = costWeights.effects.magnitudeDivisors;

  switch (effect.kind) {
    case "damage":
      return verbBase + ceilDiv(effect.damage?.amount ?? 0, divisors.damageAmount);
    case "heal":
      return verbBase + ceilDiv(effect.heal?.amount ?? 0, divisors.healAmount);
    case "apply_status":
      return (
        verbBase +
        ceilDiv(effect.applyStatus?.duration ?? 0, divisors.statusDuration)
      );
    case "cure_status":
      return verbBase + (effect.cureStatus?.status === "all" ? 1 : 0);
    case "buff_stat": {
      const payload = effect.buffStat;
      const magnitudeDuration =
        payload === null ? 0 : Math.abs(payload.magnitude) * payload.duration;

      return (
        verbBase +
        ceilDiv(magnitudeDuration, divisors.buffMagnitudeDurationProduct)
      );
    }
    case "nutrition":
      return (
        verbBase +
        ceilDiv(effect.nutrition?.fullness ?? 0, divisors.nutritionFullness)
      );
    case "teleport_self":
    case "teleport_target":
    case "reveal":
    case "identify":
      return verbBase;
    case "blink":
      return (
        verbBase +
        ceilDiv(effect.blink?.distanceTiles ?? 0, divisors.blinkDistanceTiles)
      );
    case "knockback":
      return (
        verbBase +
        ceilDiv(effect.knockback?.pushTiles ?? 0, divisors.knockbackPushTiles) +
        ceilDiv(
          effect.knockback?.collisionDamage ?? 0,
          divisors.knockbackCollisionDamage,
        )
      );
    case "enchant":
      return verbBase + (effect.enchant?.bonus ?? 0);
    case "summon":
      return verbBase + ceilDiv(effect.summon?.count ?? 0, divisors.summonCount);
    case "transform":
      return verbBase;
    case "dig":
      return (
        verbBase +
        ceilDiv(effect.dig?.lengthTiles ?? 0, divisors.digLengthTiles)
      );
    default:
      throw new RangeError(`unsupported enemy effect cost ${String(effect.kind)}`);
  }
};

export const triggerCost = (trigger: Trigger): number => {
  const base = costWeights.effects.trigger[trigger.kind];
  const divisors = costWeights.effects.magnitudeDivisors;

  switch (trigger.kind) {
    case "on_hit":
      return (
        base +
        ceilDiv(
          trigger.onHit?.procChancePercent ?? 0,
          divisors.procChancePercent,
        )
      );
    case "on_struck":
      return (
        base +
        ceilDiv(
          trigger.onStruck?.procChancePercent ?? 0,
          divisors.procChancePercent,
        )
      );
    case "use":
      return base + ceilDiv(trigger.use?.charges ?? 0, divisors.useCharges);
    case "quaff":
    case "read":
    case "throw_hit":
    case "equip_passive":
    case "step":
      return base;
    default:
      throw new RangeError(
        `unsupported enemy trigger cost ${String(trigger.kind)}`,
      );
  }
};

export const targetingCost = (targeting: TargetingShape): number => {
  const base = costWeights.effects.targeting[targeting.kind];
  const divisors = costWeights.effects.magnitudeDivisors;

  switch (targeting.kind) {
    case "bolt":
      return (
        base +
        ceilDiv(targeting.bolt?.rangeTiles ?? 0, divisors.boltRangeTiles)
      );
    case "burst":
      return (
        base +
        ceilDiv(targeting.burst?.radiusTiles ?? 0, divisors.burstRadiusTiles)
      );
    case "self":
    case "melee":
    case "floor":
      return base;
    default:
      throw new RangeError(
        `unsupported enemy targeting cost ${String(targeting.kind)}`,
      );
  }
};

const ceilDiv = (value: number, divisor: number): number => {
  if (value <= 0) {
    return 0;
  }

  return Math.ceil(value / divisor);
};

const nonNegativeDelta = (value: number, floor: number): number =>
  Math.max(0, value - floor);

const inRange = (
  value: number,
  range: { readonly min: number; readonly max: number },
): boolean => value >= range.min && value <= range.max;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
