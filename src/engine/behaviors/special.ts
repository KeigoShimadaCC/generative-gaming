import { bounds } from "../../config/index.js";
import type { Behavior } from "../../schemas/entities/index.js";
import type { EffectBundle } from "../../schemas/vocab/index.js";
import { executeBundle } from "../effects/registry.js";
import { chebyshevDistance } from "../map/index.js";
import {
  allocateEntityId,
  type EngineLogEventDataByType,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type GroundItemEntityInstance,
  type PlayerItemStack,
  type Position,
  type SerializableRecord,
  type SerializableValue,
} from "../state/index.js";
import {
  registerAttackInterceptor,
  registerLootDropHook,
  resolveAttack,
  type CombatActorId,
  type LootDropResult,
} from "../systems/combat.js";
import { removeFromInventory } from "../systems/inventory.js";
import { isStunned } from "../systems/status.js";
import type {
  ActorTurnHook,
  PlayerAction,
  TurnEvent,
  TurnHookResult,
  TurnHooks,
} from "../turn/index.js";
import {
  behaviorConditionFires as movementBehaviorConditionFires,
  createAiRngContext,
  evaluateBehavior as evaluateMovementBehavior,
  executeBehaviorAction as executeMovementBehaviorAction,
  type AiRngContext,
  type BehaviorAction,
} from "./movement.js";
import {
  alliesWithTag,
  distanceTo,
  enemyEntity,
  isTerritorialProvoked,
  playerVisible,
} from "./perception.js";

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly enemy_ability_used: {
      readonly actorId: EntityId;
      readonly abilityIndex: number;
      readonly targetId: CombatActorId | null;
      readonly cooldownTurns: number;
    };
    readonly thief_item_stolen: {
      readonly actorId: EntityId;
      readonly itemInstanceId: string;
      readonly definitionId: string;
      readonly quantity: number;
    };
    readonly ambusher_revealed: {
      readonly actorId: EntityId;
    };
    readonly mimic_revealed: {
      readonly actorId: EntityId;
    };
    readonly pack_hunter_engaged: {
      readonly actorId: EntityId;
      readonly allyIds: readonly EntityId[];
      readonly threshold: number;
    };
  }
}

export type SpecialBehaviorAction =
  | BehaviorAction
  | {
      readonly kind: "ability";
      readonly abilityIndex: number;
      readonly targetId: CombatActorId | null;
      readonly origin: Position;
      readonly cooldownTurns: number;
    }
  | {
      readonly kind: "thief_attack";
      readonly targetId: "player";
    };

const AI_RNG_STREAM_ID = "ai";
const ROOT_RNG_STREAM_ID = "root";

const COOLDOWN_BOUNDS =
  bounds.enemyDesign.behaviorVocabulary.parameters.casterCooldownTurns;
const PACK_HUNTER_BOUNDS =
  bounds.enemyDesign.behaviorVocabulary.parameters.packHunter;
const TERRITORIAL_BOUNDS =
  bounds.enemyDesign.behaviorVocabulary.parameters.territorialRadiusTiles;

const APPROACH_MELEE_BEHAVIOR = {
  kind: "approach_melee",
  approachMelee: {},
  keepRange: null,
  fleeLowHp: null,
  packHunter: null,
  ambusher: null,
  territorial: null,
  guard: null,
  patrol: null,
  thief: null,
  caster: null,
  bodyguard: null,
  mimic: null,
} as const satisfies Behavior;

const FLEE_BEHAVIOR = {
  kind: "flee_low_hp",
  approachMelee: null,
  keepRange: null,
  fleeLowHp: {
    thresholdPercent:
      bounds.enemyDesign.behaviorVocabulary.parameters
        .fleeLowHpThresholdPercent.min,
  },
  packHunter: null,
  ambusher: null,
  territorial: null,
  guard: null,
  patrol: null,
  thief: null,
  caster: null,
  bodyguard: null,
  mimic: null,
} as const satisfies Behavior;

export const evaluateBehaviors = (
  state: GameState,
  enemyId: EntityId,
  rng: AiRngContext = createAiRngContext(state),
): SpecialBehaviorAction => {
  const enemy = enemyEntity(state, enemyId);

  if (enemy === null) {
    return { kind: "wait" };
  }

  if (isMimicDisguised(enemy)) {
    return { kind: "wait" };
  }

  const casterAbility = evaluateCasterAbility(state, enemy, rng);
  if (casterAbility !== null) {
    return casterAbility;
  }

  const thiefAbility = evaluateThiefEscapeAbility(state, enemy, rng);
  if (thiefAbility !== null) {
    return thiefAbility;
  }

  for (const behavior of enemy.definition.behaviors) {
    if (isSpecialBehavior(behavior)) {
      return evaluateSpecialBehavior(state, enemy, behavior, rng);
    }

    if (
      hasBehavior(enemy, "caster") &&
      behavior.kind === "territorial"
    ) {
      return { kind: "wait" };
    }

    if (!movementBehaviorConditionFires(state, enemy, behavior)) {
      continue;
    }

    return evaluateMovementBehavior(state, enemy.id, behavior, rng);
  }

  return { kind: "wait" };
};

export const executeBehaviorAction = (
  state: GameState,
  enemyId: EntityId,
  action: SpecialBehaviorAction,
  rng: AiRngContext = createAiRngContext(state),
): TurnHookResult => {
  if (action.kind === "ability") {
    return executeAbilityAction(state, enemyId, action, rng);
  }

  if (action.kind === "thief_attack") {
    return executeThiefAttack(state, enemyId);
  }

  return executeMovementBehaviorAction(state, enemyId, action);
};

export const specialBehaviorActorTurnHook: ActorTurnHook = ({
  state,
  actor,
  action,
}) => {
  if (actor.kind !== "enemy") {
    return { state };
  }

  const enemy = enemyEntity(state, actor.id);

  if (enemy === null || enemy.definition.behaviors.length === 0) {
    return { state };
  }

  if (isStunned(enemy.statuses)) {
    return executeMovementBehaviorAction(state, actor.id, { kind: "wait" });
  }

  const prepared = prepareSpecialRuntimeForActorTurn(state, actor.id, action);
  const rngContext = createAiRngContext(prepared.state);
  const decided = evaluateBehaviors(prepared.state, actor.id, rngContext);
  const result = normalizeHookResult(
    executeBehaviorAction(prepared.state, actor.id, decided, rngContext),
  );

  return {
    state: withAiRngCursor(result.state, rngContext),
    events: [...prepared.events, ...result.events],
  };
};

export const specialBehaviorTurnHooks = (): TurnHooks => ({
  actorTurn: specialBehaviorActorTurnHook,
});

export const registerBodyguardAttackInterceptor = (): (() => void) =>
  registerAttackInterceptor((state, attackerId, intendedDefenderId) => {
    const wardPosition = combatActorPosition(state, intendedDefenderId);

    if (wardPosition === null) {
      return intendedDefenderId;
    }

    const bodyguard = Object.values(state.entities)
      .filter(
        (entity): entity is EnemyEntityInstance =>
          entity.kind === "enemy" &&
          entity.id !== attackerId &&
          entity.id !== intendedDefenderId &&
          hasBehavior(entity, "bodyguard") &&
          readString(entity.behaviorRuntime.wardId) === intendedDefenderId &&
          areAdjacent(entity.position, wardPosition),
      )
      .sort((left, right) => left.id.localeCompare(right.id))[0];

    return bodyguard?.id ?? intendedDefenderId;
  });

export const registerThiefLootDropHook = (): (() => void) =>
  registerLootDropHook(({ state, victim }): LootDropResult => {
    const stolenLoot = readStolenLoot(victim);

    if (stolenLoot.length === 0) {
      return state;
    }

    let nextState = state;
    const events: TurnEvent[] = [];

    for (const stack of stolenLoot) {
      const allocation = allocateEntityId(nextState.ids.entityCounters, "item");
      const entity: GroundItemEntityInstance = {
        id: allocation.id,
        kind: "item",
        definition: stack.definition,
        position: victim.position,
        currentHP: null,
        statuses: [],
        behaviorRuntime: {},
        quantity: stack.quantity,
        identified: stack.identified,
      };

      nextState = {
        ...nextState,
        ids: {
          ...nextState.ids,
          entityCounters: allocation.entityCounters,
        },
        entities: {
          ...nextState.entities,
          [entity.id]: entity,
        },
      };
      events.push(
        specialEvent(state, "item_dropped", {
          itemInstanceId: stack.itemInstanceId,
          entityId: entity.id,
          definitionId: stack.definition.id,
          quantity: stack.quantity,
          position: victim.position,
        }),
      );
    }

    return {
      state: nextState,
      events,
    };
  });

export const unregisterSpecialBodyguardAttackInterceptor =
  registerBodyguardAttackInterceptor();

export const unregisterSpecialThiefLootDropHook = registerThiefLootDropHook();

const prepareSpecialRuntimeForActorTurn = (
  state: GameState,
  enemyId: EntityId,
  action: PlayerAction,
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  let nextState = tickAbilityCooldowns(state, enemyId);
  const events: TurnEvent[] = [];

  const mimic = enemyEntity(nextState, enemyId);
  if (
    mimic !== null &&
    hasBehavior(mimic, "mimic") &&
    isMimicDisguised(mimic) &&
    mimicRevealTriggered(nextState, mimic, action)
  ) {
    nextState = withEnemyBehaviorRuntime(nextState, enemyId, {
      disguisedAsItem: false,
      mimicRevealed: true,
    });
    events.push(specialEvent(state, "mimic_revealed", { actorId: enemyId }));
  }

  const ambusher = enemyEntity(nextState, enemyId);
  if (
    ambusher !== null &&
    hasBehavior(ambusher, "ambusher") &&
    !isAmbusherAwake(ambusher) &&
    ambusherShouldWake(nextState, ambusher)
  ) {
    nextState = withEnemyBehaviorRuntime(nextState, enemyId, {
      ambusherAwake: true,
      hidden: false,
    });
    events.push(specialEvent(state, "ambusher_revealed", { actorId: enemyId }));
  }

  const packHunter = enemyEntity(nextState, enemyId);
  if (
    packHunter !== null &&
    hasBehavior(packHunter, "pack_hunter") &&
    !isPackHunterEngaged(packHunter)
  ) {
    const engagement = packHunterEngagement(nextState, packHunter);

    if (engagement !== null) {
      nextState = withPackHunterEngaged(nextState, packHunter, engagement.allyIds);
      events.push(
        specialEvent(state, "pack_hunter_engaged", {
          actorId: enemyId,
          allyIds: engagement.allyIds,
          threshold: engagement.threshold,
        }),
      );
    }
  }

  return { state: nextState, events };
};

const evaluateSpecialBehavior = (
  state: GameState,
  enemy: EnemyEntityInstance,
  behavior: Behavior,
  rng: AiRngContext,
): SpecialBehaviorAction => {
  switch (behavior.kind) {
    case "pack_hunter":
      return evaluatePackHunter(state, enemy, behavior, rng);
    case "ambusher":
      return evaluateAmbusher(state, enemy, behavior, rng);
    case "thief":
      return evaluateThief(state, enemy, rng);
    case "caster":
      return { kind: "wait" };
    case "bodyguard":
      return { kind: "wait" };
    case "mimic":
      return isMimicDisguised(enemy)
        ? { kind: "wait" }
        : evaluateMovementBehavior(state, enemy.id, APPROACH_MELEE_BEHAVIOR, rng);
    default:
      return { kind: "wait" };
  }
};

const evaluateCasterAbility = (
  state: GameState,
  enemy: EnemyEntityInstance,
  rng: AiRngContext,
): SpecialBehaviorAction | null => {
  const caster = enemy.definition.behaviors.find(
    (behavior) => behavior.kind === "caster",
  );

  if (caster === undefined || !casterEngagementAllowed(state, enemy)) {
    return null;
  }

  const cooldownTurns =
    caster.caster?.cooldownTurns ?? rollAbilityCooldown(rng);

  return readyAbilityAction(state, enemy, () => cooldownTurns, "caster");
};

const evaluateThiefEscapeAbility = (
  state: GameState,
  enemy: EnemyEntityInstance,
  rng: AiRngContext,
): SpecialBehaviorAction | null => {
  if (!hasBehavior(enemy, "thief") || readStolenLoot(enemy).length === 0) {
    return null;
  }

  return readyAbilityAction(state, enemy, () => rollAbilityCooldown(rng), "flee");
};

const readyAbilityAction = (
  state: GameState,
  enemy: EnemyEntityInstance,
  cooldownTurns: () => number,
  intent: "caster" | "flee",
): SpecialBehaviorAction | null => {
  for (let index = 0; index < enemy.definition.abilities.length; index += 1) {
    const bundle = enemy.definition.abilities[index];

    if (
      bundle === undefined ||
      abilityCooldownFor(enemy, index) > 0
    ) {
      continue;
    }

    const target = abilityTargetFor(state, enemy, bundle, intent);

    if (target === null) {
      continue;
    }

    return {
      kind: "ability",
      abilityIndex: index,
      targetId: target.targetId,
      origin: target.origin,
      cooldownTurns: cooldownTurns(),
    };
  }

  return null;
};

const evaluatePackHunter = (
  state: GameState,
  enemy: EnemyEntityInstance,
  behavior: Behavior,
  rng: AiRngContext,
): SpecialBehaviorAction => {
  if (
    isPackHunterEngaged(enemy) ||
    packHunterEngagement(state, enemy, behavior) !== null
  ) {
    return evaluateMovementBehavior(state, enemy.id, APPROACH_MELEE_BEHAVIOR, rng);
  }

  return { kind: "wait" };
};

const evaluateAmbusher = (
  state: GameState,
  enemy: EnemyEntityInstance,
  behavior: Behavior,
  rng: AiRngContext,
): SpecialBehaviorAction => {
  if (isAmbusherAwake(enemy) || ambusherShouldWake(state, enemy, behavior)) {
    return evaluateMovementBehavior(state, enemy.id, APPROACH_MELEE_BEHAVIOR, rng);
  }

  return { kind: "wait" };
};

const evaluateThief = (
  state: GameState,
  enemy: EnemyEntityInstance,
  rng: AiRngContext,
): SpecialBehaviorAction => {
  if (readStolenLoot(enemy).length > 0) {
    return evaluateMovementBehavior(state, enemy.id, FLEE_BEHAVIOR, rng);
  }

  if (areAdjacent(enemy.position, state.player.position)) {
    return { kind: "thief_attack", targetId: "player" };
  }

  return evaluateMovementBehavior(state, enemy.id, APPROACH_MELEE_BEHAVIOR, rng);
};

const executeAbilityAction = (
  state: GameState,
  enemyId: EntityId,
  action: Extract<SpecialBehaviorAction, { readonly kind: "ability" }>,
  rng: AiRngContext,
): TurnHookResult => {
  const enemy = enemyEntity(state, enemyId);
  const bundle = enemy?.definition.abilities[action.abilityIndex];

  if (enemy === null || bundle === undefined) {
    return executeMovementBehaviorAction(state, enemyId, { kind: "wait" });
  }

  const result = executeBundle(state, bundle, {
    sourceId: enemyId,
    targetId: action.targetId,
    origin: action.origin,
    rng: rng.rng,
  });

  if (result.rejected === true) {
    return {
      state: result.state,
      events: result.events,
    };
  }

  return {
    state: withAbilityCooldown(
      result.state,
      enemyId,
      action.abilityIndex,
      action.cooldownTurns,
    ),
    events: [
      specialEvent(state, "enemy_ability_used", {
        actorId: enemyId,
        abilityIndex: action.abilityIndex,
        targetId: action.targetId,
        cooldownTurns: action.cooldownTurns,
      }),
      ...result.events,
    ],
  };
};

const executeThiefAttack = (
  state: GameState,
  enemyId: EntityId,
): TurnHookResult => {
  const result = resolveAttack(state, enemyId, "player");

  if ("illegal" in result) {
    return executeMovementBehaviorAction(state, enemyId, { kind: "wait" });
  }

  const hit = result.events.some(
    (event) =>
      event.type === "attack_hit" &&
      event.data.actorId === enemyId &&
      event.data.defenderId === "player",
  );

  if (!hit) {
    return result;
  }

  return stealOneInventoryItem(result.state, state, enemyId, result.events);
};

const stealOneInventoryItem = (
  stateAfterHit: GameState,
  stateBeforeHit: GameState,
  enemyId: EntityId,
  events: readonly TurnEvent[],
): TurnHookResult => {
  const slotIndex = stateAfterHit.player.inventory.findIndex(
    (slot) => slot !== null,
  );

  if (slotIndex === -1) {
    return {
      state: stateAfterHit,
      events,
    };
  }

  const slot = stateAfterHit.player.inventory[slotIndex];

  if (slot === null || slot === undefined) {
    return {
      state: stateAfterHit,
      events,
    };
  }

  const removed = removeFromInventory(stateAfterHit, slot.itemInstanceId, 1);

  if ("illegal" in removed) {
    return {
      state: stateAfterHit,
      events,
    };
  }

  const stolen: PlayerItemStack = {
    itemInstanceId:
      slot.quantity === 1
        ? slot.itemInstanceId
        : `${slot.itemInstanceId}#stolen-${enemyId}-${stateBeforeHit.run.turn}`,
    definition: slot.definition,
    quantity: 1,
    identified: slot.identified,
  };
  const thief = enemyEntity(removed.state, enemyId);
  const carried = thief === null ? [] : readStolenLoot(thief);

  return {
    state: withEnemyBehaviorRuntime(removed.state, enemyId, {
      stolenLoot: [...carried, stolen] as unknown as SerializableValue,
    }),
    events: [
      ...events,
      specialEvent(stateBeforeHit, "thief_item_stolen", {
        actorId: enemyId,
        itemInstanceId: stolen.itemInstanceId,
        definitionId: stolen.definition.id,
        quantity: stolen.quantity,
      }),
    ],
  };
};

type AbilityTarget = {
  readonly targetId: CombatActorId | null;
  readonly origin: Position;
};

const abilityTargetFor = (
  state: GameState,
  enemy: EnemyEntityInstance,
  bundle: EffectBundle,
  intent: "caster" | "flee",
): AbilityTarget | null => {
  if (intent === "flee") {
    return bundle.targeting.kind === "self"
      ? {
          targetId: enemy.id,
          origin: fleeOriginFromPlayer(state, enemy),
        }
      : null;
  }

  if (!playerVisible(state, enemy.id)) {
    return null;
  }

  switch (bundle.targeting.kind) {
    case "self":
      return {
        targetId: enemy.id,
        origin: enemy.position,
      };
    case "melee":
      return areAdjacent(enemy.position, state.player.position)
        ? {
            targetId: "player",
            origin: enemy.position,
          }
        : null;
    case "bolt": {
      const range =
        bundle.targeting.bolt?.rangeTiles ??
        bounds.effectVocabulary.targetingShapes.boltRangeTiles.max;

      return distanceTo(state, enemy.id) <= range
        ? {
            targetId: "player",
            origin: enemy.position,
          }
        : null;
    }
    case "burst": {
      const radius =
        bundle.targeting.burst?.radiusTiles ??
        bounds.effectVocabulary.targetingShapes.burstRadiusTiles.max;

      return distanceTo(state, enemy.id) <= radius
        ? {
            targetId: "player",
            origin: enemy.position,
          }
        : null;
    }
    case "floor":
      return {
        targetId: null,
        origin: enemy.position,
      };
  }
};

const casterEngagementAllowed = (
  state: GameState,
  enemy: EnemyEntityInstance,
): boolean => {
  if (isMimicDisguised(enemy)) {
    return false;
  }

  for (const behavior of enemy.definition.behaviors) {
    if (
      behavior.kind === "territorial" &&
      !territorialAllowsEngagement(state, enemy, behavior)
    ) {
      return false;
    }

    if (
      behavior.kind === "ambusher" &&
      !isAmbusherAwake(enemy) &&
      !ambusherShouldWake(state, enemy, behavior)
    ) {
      return false;
    }

    if (
      behavior.kind === "pack_hunter" &&
      !isPackHunterEngaged(enemy) &&
      packHunterEngagement(state, enemy, behavior) === null
    ) {
      return false;
    }
  }

  return true;
};

const territorialAllowsEngagement = (
  state: GameState,
  enemy: EnemyEntityInstance,
  behavior: Behavior,
): boolean => {
  const radius =
    behavior.territorial?.radiusTiles ?? TERRITORIAL_BOUNDS.min;

  return (
    isTerritorialProvoked(enemy) ||
    (playerVisible(state, enemy.id) && distanceTo(state, enemy.id) <= radius)
  );
};

const ambusherShouldWake = (
  state: GameState,
  enemy: EnemyEntityInstance,
  behavior = enemy.definition.behaviors.find(
    (candidate) => candidate.kind === "ambusher",
  ),
): boolean => {
  const radius =
    behavior?.kind === "ambusher"
      ? behavior.ambusher?.wakeRadiusTiles ??
        bounds.enemyDesign.behaviorVocabulary.parameters
          .ambusherWakeRadiusTiles.min
      : bounds.enemyDesign.behaviorVocabulary.parameters
        .ambusherWakeRadiusTiles.min;

  return distanceTo(state, enemy.id) <= radius;
};

const packHunterEngagement = (
  state: GameState,
  enemy: EnemyEntityInstance,
  behavior = enemy.definition.behaviors.find(
    (candidate) => candidate.kind === "pack_hunter",
  ),
): {
  readonly allyIds: readonly EntityId[];
  readonly threshold: number;
} | null => {
  const threshold =
    behavior?.kind === "pack_hunter"
      ? behavior.packHunter?.allyCount ?? PACK_HUNTER_BOUNDS.allyCountMin
      : PACK_HUNTER_BOUNDS.allyCountMin;
  const visibleAllies = alliesWithTag(state, enemy.id, false)
    .filter((ally) => playerVisible(state, ally.id))
    .map((ally) => ally.id)
    .sort((left, right) => left.localeCompare(right));

  return visibleAllies.length >= threshold
    ? {
        allyIds: visibleAllies,
        threshold,
      }
    : null;
};

const withPackHunterEngaged = (
  state: GameState,
  enemy: EnemyEntityInstance,
  allyIds: readonly EntityId[],
): GameState => {
  let nextState = withEnemyBehaviorRuntime(state, enemy.id, {
    packHunterEngaged: true,
  });

  for (const allyId of allyIds) {
    const ally = enemyEntity(nextState, allyId);

    if (ally !== null && hasBehavior(ally, "pack_hunter")) {
      nextState = withEnemyBehaviorRuntime(nextState, ally.id, {
        packHunterEngaged: true,
      });
    }
  }

  return nextState;
};

const tickAbilityCooldowns = (
  state: GameState,
  enemyId: EntityId,
): GameState => {
  const enemy = enemyEntity(state, enemyId);

  if (enemy === null || enemy.definition.abilities.length === 0) {
    return state;
  }

  const current = abilityCooldownsFor(enemy);
  const next = Array.from(
    { length: enemy.definition.abilities.length },
    (_, index) => Math.max(0, (current[index] ?? 0) - 1),
  );

  return withEnemyBehaviorRuntime(state, enemyId, {
    abilityCooldowns: next,
  });
};

const withAbilityCooldown = (
  state: GameState,
  enemyId: EntityId,
  abilityIndex: number,
  cooldownTurns: number,
): GameState => {
  const enemy = enemyEntity(state, enemyId);

  if (enemy === null) {
    return state;
  }

  const cooldowns = [...abilityCooldownsFor(enemy)];
  cooldowns[abilityIndex] = cooldownTurns;

  return withEnemyBehaviorRuntime(state, enemyId, {
    abilityCooldowns: cooldowns,
  });
};

const abilityCooldownFor = (
  enemy: EnemyEntityInstance,
  abilityIndex: number,
): number => abilityCooldownsFor(enemy)[abilityIndex] ?? 0;

const abilityCooldownsFor = (
  enemy: EnemyEntityInstance,
): readonly number[] => {
  const raw = enemy.behaviorRuntime.abilityCooldowns;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry) =>
    typeof entry === "number" && Number.isSafeInteger(entry) && entry > 0
      ? entry
      : 0,
  );
};

const rollAbilityCooldown = (rng: AiRngContext): number =>
  rng.rng.int(COOLDOWN_BOUNDS.min, COOLDOWN_BOUNDS.max);

const isSpecialBehavior = (behavior: Behavior): boolean => {
  switch (behavior.kind) {
    case "pack_hunter":
    case "ambusher":
    case "thief":
    case "caster":
    case "bodyguard":
    case "mimic":
      return true;
    default:
      return false;
  }
};

const hasBehavior = (
  enemy: EnemyEntityInstance,
  behaviorKind: Behavior["kind"],
): boolean =>
  enemy.definition.behaviors.some((behavior) => behavior.kind === behaviorKind);

const isMimicDisguised = (enemy: EnemyEntityInstance): boolean =>
  enemy.behaviorRuntime.disguisedAsItem === true &&
  enemy.behaviorRuntime.mimicRevealed !== true;

const isAmbusherAwake = (enemy: EnemyEntityInstance): boolean =>
  enemy.behaviorRuntime.ambusherAwake === true ||
  enemy.behaviorRuntime.hidden === false;

const isPackHunterEngaged = (enemy: EnemyEntityInstance): boolean =>
  enemy.behaviorRuntime.packHunterEngaged === true;

const mimicRevealTriggered = (
  state: GameState,
  enemy: EnemyEntityInstance,
  action: PlayerAction,
): boolean =>
  areAdjacent(enemy.position, state.player.position) &&
  (action.kind === "pickup" || action.kind === "move");

const readStolenLoot = (
  enemy: EnemyEntityInstance,
): readonly PlayerItemStack[] => {
  const raw = enemy.behaviorRuntime.stolenLoot;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(isPlayerItemStack);
};

const isPlayerItemStack = (value: unknown): value is PlayerItemStack => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as {
    readonly itemInstanceId?: unknown;
    readonly definition?: { readonly id?: unknown };
    readonly quantity?: unknown;
    readonly identified?: unknown;
  };

  return (
    typeof record.itemInstanceId === "string" &&
    typeof record.definition?.id === "string" &&
    typeof record.quantity === "number" &&
    Number.isSafeInteger(record.quantity) &&
    record.quantity > 0 &&
    typeof record.identified === "boolean"
  );
};

const combatActorPosition = (
  state: GameState,
  actorId: CombatActorId,
): Position | null => {
  if (actorId === "player") {
    return state.player.position;
  }

  return state.entities[actorId]?.position ?? null;
};

const withEnemyBehaviorRuntime = (
  state: GameState,
  enemyId: EntityId,
  patch: SerializableRecord,
): GameState => {
  const enemy = enemyEntity(state, enemyId);

  if (enemy === null) {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [enemyId]: {
        ...enemy,
        behaviorRuntime: {
          ...enemy.behaviorRuntime,
          ...patch,
        },
      },
    },
  };
};

const fleeOriginFromPlayer = (
  state: GameState,
  enemy: EnemyEntityInstance,
): Position => ({
  x: enemy.position.x + sign(enemy.position.x - state.player.position.x),
  y: enemy.position.y + sign(enemy.position.y - state.player.position.y),
});

const sign = (value: number): -1 | 0 | 1 => {
  if (value < 0) {
    return -1;
  }

  if (value > 0) {
    return 1;
  }

  return 0;
};

const areAdjacent = (left: Position, right: Position): boolean =>
  !samePosition(left, right) && chebyshevDistance(left, right) <= 1;

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;

const readString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const withAiRngCursor = (
  state: GameState,
  context: AiRngContext,
): GameState => {
  const existing = state.rng.streams[AI_RNG_STREAM_ID];

  return {
    ...state,
    rng: {
      ...state.rng,
      streams: {
        ...state.rng.streams,
        [AI_RNG_STREAM_ID]: {
          streamId: AI_RNG_STREAM_ID,
          seed: existing?.seed ?? state.rng.rootSeed,
          parentStreamId: existing?.parentStreamId ?? ROOT_RNG_STREAM_ID,
          draws: context.initialDraws + context.drawsUsed,
        },
      },
    },
  };
};

const normalizeHookResult = (
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

const specialEvent = <Type extends SpecialLogEventType>(
  state: GameState,
  type: Type,
  data: EngineLogEventDataByType[Type],
): Extract<TurnEvent, { readonly type: Type }> =>
  ({
    turn: state.run.turn,
    type,
    data,
  }) as Extract<TurnEvent, { readonly type: Type }>;

type SpecialLogEventType =
  | "enemy_ability_used"
  | "thief_item_stolen"
  | "ambusher_revealed"
  | "mimic_revealed"
  | "pack_hunter_engaged"
  | "item_dropped";
