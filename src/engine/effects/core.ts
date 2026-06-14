import { bounds } from "../../config/index.js";
import type {
  ItemCategory,
  ItemDefinition
} from "../../schemas/entities/index.js";
import type {
  Effect,
  EffectVerbKind,
  StatusApplication,
  StatusId
} from "../../schemas/vocab/index.js";
import type { CombatActorId, DeathAttribution } from "../systems/combat.js";
import { applyDeath, deriveCombatStats } from "../systems/combat.js";
import { applyNutrition } from "../systems/player.js";
import { applyStatus, type StatusEntityId } from "../systems/status.js";
import type {
  EnemyEntityInstance,
  EntityId,
  EntityInstance,
  GameState,
  InventorySlot,
  PlayerItemStack
} from "../state/index.js";
import type { TurnEvent } from "../turn/index.js";
import {
  effectExecutedEvent,
  registerEffectExecutor,
  rejectEffect,
  type EffectActorId,
  type EffectExecutionContext,
  type EffectExecutor,
  type EffectExecutorResult
} from "./registry.js";

type CoreEffectVerb =
  | "damage"
  | "heal"
  | "apply_status"
  | "cure_status"
  | "buff_stat"
  | "nutrition"
  | "identify"
  | "enchant";

type ActorWithHp =
  | {
      readonly id: "player";
      readonly hpCurrent: number;
      readonly hpMax: number;
    }
  | {
      readonly id: EntityId;
      readonly entity: EnemyEntityInstance;
      readonly hpCurrent: number;
      readonly hpMax: number;
    };

type RuntimeBuffStatus = StatusApplication & {
  readonly kind: "buff_stat";
  readonly stat: "ATK" | "DEF";
  readonly magnitude: number;
};

const CORE_EXECUTORS = {
  damage: executeDamage,
  heal: executeHeal,
  apply_status: executeApplyStatus,
  cure_status: executeCureStatus,
  buff_stat: executeBuffStat,
  nutrition: executeNutrition,
  identify: executeIdentify,
  enchant: executeEnchant
} as const satisfies Record<CoreEffectVerb, EffectExecutor>;

export const registerCoreEffectExecutors = (): (() => void) => {
  const unregisterers = Object.entries(CORE_EXECUTORS).map(([verb, executor]) =>
    registerEffectExecutor(verb as EffectVerbKind, executor)
  );

  return () => {
    for (let index = unregisterers.length - 1; index >= 0; index -= 1) {
      unregisterers[index]?.();
    }
  };
};

export const unregisterCoreEffectExecutors = registerCoreEffectExecutors();

function executeDamage(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.damage === null) {
    return missingPayload(state, effect, ctx);
  }

  const amount = effect.damage.amount;
  const amountBounds = bounds.effectVocabulary.verbs.damage.amount;
  if (!isSafeIntegerInBounds(amount, amountBounds)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      `damage.amount must be ${amountBounds.min}-${amountBounds.max}`,
      ctx
    );
  }

  const target = resolveHpTarget(state, ctx);
  if (target === null) {
    return invalidTarget(
      state,
      effect,
      ctx,
      "damage requires a player or enemy target"
    );
  }

  const hpAfter = Math.max(0, target.hpCurrent - amount);
  const damagedState = withActorHp(state, target, hpAfter);
  const executed = effectExecutedEvent(
    state,
    "damage",
    withResolvedTarget(ctx, target.id),
    {
      amount,
      hpBefore: target.hpCurrent,
      hpAfter
    }
  );

  if (hpAfter > 0) {
    return {
      state: damagedState,
      events: [executed]
    };
  }

  const death = applyDeath(damagedState, target.id, {
    attribution: deathAttributionFor(ctx.sourceId)
  });

  return {
    state: death.state,
    events: [executed, ...death.events]
  };
}

function executeHeal(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.heal === null) {
    return missingPayload(state, effect, ctx);
  }

  const amount = effect.heal.amount;
  const amountBounds = bounds.effectVocabulary.verbs.heal.amount;
  if (!isSafeIntegerInBounds(amount, amountBounds)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      `heal.amount must be ${amountBounds.min}-${amountBounds.max}`,
      ctx
    );
  }

  const target = resolveHpTarget(state, ctx);
  if (target === null) {
    return invalidTarget(
      state,
      effect,
      ctx,
      "heal requires a player or enemy target"
    );
  }

  const hpAfter = Math.min(target.hpMax, target.hpCurrent + amount);

  return {
    state: withActorHp(state, target, hpAfter),
    events: [
      effectExecutedEvent(state, "heal", withResolvedTarget(ctx, target.id), {
        amount,
        hpBefore: target.hpCurrent,
        hpAfter
      })
    ]
  };
}

function executeApplyStatus(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.applyStatus === null) {
    return missingPayload(state, effect, ctx);
  }

  const { status, duration } = effect.applyStatus;
  if (!isStatusId(status)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      "apply_status.status must be a known status",
      ctx
    );
  }

  const durationBounds = bounds.statusVocabulary.durationTurns[status];
  if (!isSafeIntegerInBounds(duration, durationBounds)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      `${status} duration must be ${durationBounds.min}-${durationBounds.max}`,
      ctx
    );
  }

  const targetId = resolveStatusTargetId(state, ctx);
  if (targetId === null) {
    return invalidTarget(
      state,
      effect,
      ctx,
      "apply_status requires an existing target"
    );
  }

  const applied = applyStatus(state, targetId, status, duration);

  return {
    state: applied.state,
    events: [
      effectExecutedEvent(
        state,
        "apply_status",
        withResolvedTarget(ctx, targetId),
        {
          status,
          duration
        }
      ),
      ...applied.events
    ]
  };
}

function executeCureStatus(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.cureStatus === null) {
    return missingPayload(state, effect, ctx);
  }

  const status = effect.cureStatus.status;
  if (
    status !== bounds.effectVocabulary.verbs.cureStatus.allKeyword &&
    !isStatusId(status)
  ) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      "cure_status.status must be a known status or all",
      ctx
    );
  }

  const targetId = resolveStatusTargetId(state, ctx);
  if (targetId === null) {
    return invalidTarget(
      state,
      effect,
      ctx,
      "cure_status requires an existing target"
    );
  }

  const previousStatuses = statusesForEntity(state, targetId);
  const nextStatuses =
    status === bounds.effectVocabulary.verbs.cureStatus.allKeyword
      ? []
      : previousStatuses.filter((entry) => entry.status !== status);
  const curedCount = previousStatuses.length - nextStatuses.length;

  return {
    state: withEntityStatuses(state, targetId, nextStatuses),
    events: [
      effectExecutedEvent(
        state,
        "cure_status",
        withResolvedTarget(ctx, targetId),
        {
          status,
          curedCount
        }
      )
    ]
  };
}

function executeBuffStat(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.buffStat === null) {
    return missingPayload(state, effect, ctx);
  }

  const { stat, magnitude, duration } = effect.buffStat;
  const magnitudeBounds = bounds.effectVocabulary.verbs.buffStat.magnitudeAbs;
  const durationBounds = bounds.effectVocabulary.verbs.buffStat.durationTurns;
  if (stat !== "ATK" && stat !== "DEF") {
    return rejectEffect(
      state,
      effect,
      "bounds",
      "buff_stat.stat must be ATK or DEF",
      ctx
    );
  }

  if (
    !isSafeInteger(magnitude) ||
    Math.abs(magnitude) < magnitudeBounds.min ||
    Math.abs(magnitude) > magnitudeBounds.max
  ) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      `buff_stat.magnitude absolute value must be ${magnitudeBounds.min}-${magnitudeBounds.max}`,
      ctx
    );
  }

  if (!isSafeIntegerInBounds(duration, durationBounds)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      `buff_stat.duration must be ${durationBounds.min}-${durationBounds.max}`,
      ctx
    );
  }

  const target = resolveHpTarget(state, ctx);
  if (target === null) {
    return invalidTarget(
      state,
      effect,
      ctx,
      "buff_stat requires a combat target"
    );
  }

  const targetId = target.id;
  const applied = appendStatusWithCap(
    state,
    targetId,
    statusesForEntity(state, targetId),
    runtimeBuffStatus({
      stat,
      magnitude,
      duration
    })
  );
  const nextState = withEntityStatuses(state, targetId, applied.statuses);
  const statsAfter = deriveCombatStats(nextState, targetId);

  return {
    state: nextState,
    events: [
      effectExecutedEvent(
        state,
        "buff_stat",
        withResolvedTarget(ctx, targetId),
        {
          stat,
          magnitude,
          duration,
          attackAfter: statsAfter?.attack ?? null,
          defenseAfter: statsAfter?.defense ?? null
        }
      ),
      ...applied.events
    ]
  };
}

function executeNutrition(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.nutrition === null) {
    return missingPayload(state, effect, ctx);
  }

  const fullness = effect.nutrition.fullness;
  const fullnessBounds = bounds.effectVocabulary.verbs.nutrition.fullness;
  if (!isSafeIntegerInBounds(fullness, fullnessBounds)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      `nutrition.fullness must be ${fullnessBounds.min}-${fullnessBounds.max}`,
      ctx
    );
  }

  const fullnessBefore = state.player.fullness.current;
  const nourished = applyNutrition(state, fullness);

  return {
    state: nourished.state,
    events: [
      effectExecutedEvent(
        state,
        "nutrition",
        withResolvedTarget(ctx, "player"),
        {
          fullness,
          fullnessBefore,
          fullnessAfter: nourished.state.player.fullness.current,
          fullnessMaxAfter: nourished.state.player.fullness.max
        }
      ),
      ...nourished.events
    ]
  };
}

function executeIdentify(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.identify === null) {
    return missingPayload(state, effect, ctx);
  }

  const identify = effect.identify;
  if (identify.mode === "carried_item") {
    if (
      !isNonEmptyString(identify.carriedItemId) ||
      identify.category !== null
    ) {
      return rejectEffect(
        state,
        effect,
        "bounds",
        "identify carried_item requires carriedItemId only",
        ctx
      );
    }

    const result = updateCarriedItems(state, (stack) =>
      stack.itemInstanceId === identify.carriedItemId
        ? { matched: true, stack: { ...stack, identified: true } }
        : { matched: false, stack }
    );

    if (result.matchedCount === 0) {
      return invalidTarget(
        state,
        effect,
        ctx,
        `carried item ${identify.carriedItemId} was not found`
      );
    }

    return {
      state: result.state,
      events: [
        effectExecutedEvent(state, "identify", ctx, {
          mode: identify.mode,
          carriedItemId: identify.carriedItemId,
          identifiedCount: result.changedCount
        })
      ]
    };
  }

  if (identify.mode !== "category") {
    return rejectEffect(
      state,
      effect,
      "bounds",
      "identify.mode is invalid",
      ctx
    );
  }

  if (identify.carriedItemId !== null || !isItemCategory(identify.category)) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      "identify category requires category only",
      ctx
    );
  }

  const result = updateCarriedItems(state, (stack) =>
    stack.definition.kind === identify.category
      ? { matched: true, stack: { ...stack, identified: true } }
      : { matched: false, stack }
  );

  if (result.matchedCount === 0) {
    return invalidTarget(
      state,
      effect,
      ctx,
      `no carried ${identify.category} items were found`
    );
  }

  return {
    state: result.state,
    events: [
      effectExecutedEvent(state, "identify", ctx, {
        mode: identify.mode,
        category: identify.category,
        identifiedCount: result.changedCount
      })
    ]
  };
}

function executeEnchant(
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult {
  if (effect.enchant === null) {
    return missingPayload(state, effect, ctx);
  }

  const { target, bonus } = effect.enchant;
  if (target !== "weapon" && target !== "armor") {
    return rejectEffect(
      state,
      effect,
      "bounds",
      "enchant.target must be weapon or armor",
      ctx
    );
  }

  if (bonus !== bounds.effectVocabulary.verbs.enchant.bonus) {
    return rejectEffect(
      state,
      effect,
      "bounds",
      `enchant.bonus must be ${bounds.effectVocabulary.verbs.enchant.bonus}`,
      ctx
    );
  }

  const stack = state.player.equipment[target];
  if (stack === null) {
    return invalidTarget(state, effect, ctx, `no ${target} is equipped`);
  }

  const currentBonus = equipmentBonus(stack.definition, target);
  if (currentBonus === null) {
    return invalidTarget(state, effect, ctx, `equipped ${target} is malformed`);
  }

  if (isCursedEquipment(stack, target)) {
    const liftedStack = withEquipmentCurse(stack, target, false);

    return {
      state: {
        ...state,
        player: {
          ...state.player,
          equipment: {
            ...state.player.equipment,
            [target]: liftedStack
          }
        }
      },
      events: [
        effectExecutedEvent(state, "enchant", ctx, {
          target,
          bonus,
          bonusBefore: currentBonus,
          bonusAfter: currentBonus,
          curseLifted: true
        })
      ]
    };
  }

  const maxBonus = enchantRuntimeMax(target);
  const bonusAfter = Math.min(maxBonus, currentBonus + bonus);
  const enchantedStack = withEquipmentBonus(stack, target, bonusAfter);

  return {
    state: {
      ...state,
      player: {
        ...state.player,
        equipment: {
          ...state.player.equipment,
          [target]: enchantedStack
        }
      }
    },
    events: [
      effectExecutedEvent(state, "enchant", ctx, {
        target,
        bonus,
        bonusBefore: currentBonus,
        bonusAfter,
        cap: maxBonus
      })
    ]
  };
}

const resolveHpTarget = (
  state: GameState,
  ctx: EffectExecutionContext
): ActorWithHp | null => {
  const targetId = ctx.targetId ?? ctx.sourceId;
  if (targetId === null) {
    return null;
  }

  if (targetId === "player") {
    return {
      id: "player",
      hpCurrent: state.player.hp.current,
      hpMax: state.player.hp.max
    };
  }

  const entity = state.entities[targetId];
  if (entity?.kind !== "enemy") {
    return null;
  }

  return {
    id: entity.id,
    entity,
    hpCurrent: entity.currentHP,
    hpMax: entity.definition.stats.hp
  };
};

const resolveStatusTargetId = (
  state: GameState,
  ctx: EffectExecutionContext
): StatusEntityId | null => {
  const targetId = ctx.targetId ?? ctx.sourceId;
  if (targetId === null) {
    return null;
  }

  if (targetId === "player") {
    return "player";
  }

  return state.entities[targetId] === undefined ? null : targetId;
};

const withActorHp = (
  state: GameState,
  actor: ActorWithHp,
  current: number
): GameState => {
  if (actor.id === "player") {
    return {
      ...state,
      player: {
        ...state.player,
        hp: {
          ...state.player.hp,
          current
        }
      }
    };
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [actor.id]: {
        ...actor.entity,
        currentHP: current
      }
    }
  };
};

const statusesForEntity = (
  state: GameState,
  entityId: StatusEntityId
): readonly StatusApplication[] => {
  if (entityId === "player") {
    return state.player.statuses;
  }

  return state.entities[entityId]?.statuses ?? [];
};

const withEntityStatuses = (
  state: GameState,
  entityId: StatusEntityId,
  statuses: readonly StatusApplication[]
): GameState => {
  if (entityId === "player") {
    return {
      ...state,
      player: {
        ...state.player,
        statuses
      }
    };
  }

  const entity = state.entities[entityId];
  if (entity === undefined) {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [entityId]: {
        ...entity,
        statuses
      } satisfies EntityInstance
    }
  };
};

const appendStatusWithCap = (
  state: GameState,
  entityId: StatusEntityId,
  statuses: readonly StatusApplication[],
  status: StatusApplication
): {
  readonly statuses: readonly StatusApplication[];
  readonly events: readonly TurnEvent[];
} => {
  const max = bounds.statusVocabulary.maxConcurrentPerActor;
  const existingIndex = statuses.findIndex((entry) => entry.status === status.status);

  if (existingIndex >= 0) {
    return {
      statuses: statuses.map((entry, index) =>
        index === existingIndex ? status : entry
      ),
      events: [
        statusEvent(state, "status_refreshed", {
          entityId,
          status: status.status,
          duration: status.duration
        })
      ]
    };
  }

  const events: TurnEvent[] = [];
  let kept = statuses;
  if (statuses.length >= max) {
    const dropped = statuses[0];
    kept = statuses.slice(1);
    if (dropped !== undefined) {
      events.push(
        statusEvent(state, "status_dropped_oldest", {
          entityId,
          status: dropped.status
        })
      );
    }
  }

  return {
    statuses: [...kept, status],
    events: [
      ...events,
      statusEvent(state, "status_applied", {
        entityId,
        status: status.status,
        duration: status.duration
      })
    ]
  };
};

const statusEvent = <Type extends TurnEvent["type"]>(
  state: GameState,
  type: Type,
  data: Extract<TurnEvent, { readonly type: Type }>["data"]
): Extract<TurnEvent, { readonly type: Type }> =>
  ({
    turn: state.run.turn,
    type,
    data
  }) as Extract<TurnEvent, { readonly type: Type }>;

const runtimeBuffStatus = (input: {
  readonly stat: "ATK" | "DEF";
  readonly magnitude: number;
  readonly duration: number;
}): RuntimeBuffStatus =>
  ({
    status: "buff_stat" as StatusId,
    duration: input.duration,
    kind: "buff_stat",
    stat: input.stat,
    magnitude: input.magnitude
  }) as RuntimeBuffStatus;

type CarriedItemUpdate = {
  readonly matched: boolean;
  readonly stack: PlayerItemStack;
};

const updateCarriedItems = (
  state: GameState,
  update: (stack: PlayerItemStack) => CarriedItemUpdate
): {
  readonly state: GameState;
  readonly matchedCount: number;
  readonly changedCount: number;
} => {
  let matchedCount = 0;
  let changedCount = 0;
  const apply = (stack: PlayerItemStack): PlayerItemStack => {
    const result = update(stack);
    if (result.matched) {
      matchedCount += 1;
    }

    if (result.stack !== stack) {
      changedCount += 1;
    }

    return result.stack;
  };
  const inventory = state.player.inventory.map(
    (slot): InventorySlot => (slot === null ? null : apply(slot))
  );
  const weapon =
    state.player.equipment.weapon === null
      ? null
      : apply(state.player.equipment.weapon);
  const armor =
    state.player.equipment.armor === null
      ? null
      : apply(state.player.equipment.armor);
  const charms = state.player.equipment.charms.map((slot) =>
    slot === null ? null : apply(slot)
  );

  return {
    state: {
      ...state,
      player: {
        ...state.player,
        inventory,
        equipment: {
          weapon,
          armor,
          charms
        }
      }
    },
    matchedCount,
    changedCount
  };
};

const equipmentBonus = (
  definition: ItemDefinition,
  target: "weapon" | "armor"
): number | null => {
  if (target === "weapon") {
    return definition.weapon?.attackBonus ?? null;
  }

  return definition.armor?.defenseBonus ?? null;
};

const withEquipmentBonus = (
  stack: PlayerItemStack,
  target: "weapon" | "armor",
  bonus: number
): PlayerItemStack => {
  if (target === "weapon") {
    return {
      ...stack,
      definition: {
        ...stack.definition,
        weapon:
          stack.definition.weapon === null
            ? null
            : {
                ...stack.definition.weapon,
                attackBonus: bonus
              }
      }
    };
  }

  return {
    ...stack,
    definition: {
      ...stack.definition,
      armor:
        stack.definition.armor === null
          ? null
          : {
              ...stack.definition.armor,
              defenseBonus: bonus
            }
    }
  };
};

const isCursedEquipment = (
  stack: PlayerItemStack,
  target: "weapon" | "armor"
): boolean => {
  if (target === "weapon") {
    return stack.definition.weapon?.cursed ?? false;
  }

  return stack.definition.armor?.cursed ?? false;
};

const withEquipmentCurse = (
  stack: PlayerItemStack,
  target: "weapon" | "armor",
  cursed: boolean
): PlayerItemStack => {
  if (target === "weapon") {
    return {
      ...stack,
      definition: {
        ...stack.definition,
        weapon:
          stack.definition.weapon === null
            ? null
            : {
                ...stack.definition.weapon,
                cursed
              }
      }
    };
  }

  return {
    ...stack,
    definition: {
      ...stack.definition,
      armor:
        stack.definition.armor === null
          ? null
          : {
              ...stack.definition.armor,
              cursed
            }
    }
  };
};

const enchantRuntimeMax = (target: "weapon" | "armor"): number => {
  const authoredMax =
    target === "weapon"
      ? bounds.itemsEconomy.weaponAtkBonus.max
      : bounds.itemsEconomy.armorDefBonus.max;

  return authoredMax + bounds.effectVocabulary.verbs.enchant.itemCapIncrease;
};

const deathAttributionFor = (
  sourceId: EffectActorId | null
): DeathAttribution => {
  if (sourceId === null) {
    return { kind: "none" };
  }

  return {
    kind: "killer",
    killerId: sourceId as CombatActorId
  };
};

const missingPayload = (
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
): EffectExecutorResult =>
  rejectEffect(
    state,
    effect,
    "missing_payload",
    `${effect.kind} payload is missing`,
    ctx
  );

const invalidTarget = (
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext,
  message: string
): EffectExecutorResult =>
  rejectEffect(state, effect, "invalid_target", message, ctx);

const withResolvedTarget = (
  ctx: EffectExecutionContext,
  targetId: EffectActorId
): EffectExecutionContext => ({
  ...ctx,
  targetId
});

const isSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const isSafeIntegerInBounds = (
  value: unknown,
  range: { readonly min: number; readonly max: number }
): value is number =>
  isSafeInteger(value) && value >= range.min && value <= range.max;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const STATUS_IDS: ReadonlySet<string> = new Set(
  bounds.statusVocabulary.closedList
);

const isStatusId = (value: unknown): value is StatusId =>
  typeof value === "string" && STATUS_IDS.has(value);

const ITEM_CATEGORIES: ReadonlySet<string> = new Set([
  "weapon",
  "armor",
  "charm",
  "draught",
  "note",
  "throwable",
  "food",
  "tool",
  "key_item",
  "coin"
] satisfies readonly ItemCategory[]);

const isItemCategory = (value: unknown): value is ItemCategory =>
  typeof value === "string" && ITEM_CATEGORIES.has(value);
