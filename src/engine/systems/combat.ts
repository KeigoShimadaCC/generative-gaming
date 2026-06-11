import { bounds, config } from "../../config/index.js";
import type { Effect, StatusApplication } from "../../schemas/vocab/index.js";
import {
  canSee,
  chebyshevDistance,
  getTile,
  inBounds,
  isTransparentTile,
  line,
  type TileGrid,
} from "../map/index.js";
import { createRng, type Rng } from "../rng/index.js";
import type {
  EngineLogEventDataByType,
  EnemyEntityInstance,
  EntityId,
  GameState,
  PlayerItemStack,
  Position,
  SerializableRecord,
} from "../state/index.js";
import {
  registerActionResolver,
  type ActionResolver,
  type ActionResolverResult,
  type AttackAction,
  type TurnEvent,
} from "../turn/index.js";

export type PlayerActorId = "player";
export type CombatActorId = PlayerActorId | EntityId;

export type CombatStats = {
  readonly attack: number;
  readonly defense: number;
};

export type DeathAttribution =
  | {
      readonly kind: "killer";
      readonly killerId: CombatActorId;
    }
  | {
      readonly kind: "none";
    };

export type ApplyDeathOptions = {
  readonly attribution: DeathAttribution;
};

export type CombatResolutionEventType = "attack_hit" | "attack_missed";

export type AttackMissReason =
  | "hit_roll"
  | "line_of_sight_blocked"
  | "no_target";

export type LootDropContext = {
  readonly state: GameState;
  readonly victim: EnemyEntityInstance;
  readonly attribution: DeathAttribution;
  readonly killerId: CombatActorId | null;
};

export type LootDropResult =
  | GameState
  | {
      readonly state: GameState;
      readonly events?: readonly TurnEvent[];
    };

export type LootDropHook = (context: LootDropContext) => LootDropResult;

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly attack_hit: {
      readonly actorId: CombatActorId;
      readonly defenderId: CombatActorId;
      readonly attackerAttack: number;
      readonly defenderDefense: number;
      readonly baseDamage: number;
      readonly damage: number;
      readonly hitRoll: number;
      readonly hitChancePercent: number;
      readonly varianceMultiplier: number;
      readonly defenderHpBefore: number;
      readonly defenderHpAfter: number;
    };
    readonly attack_missed: {
      readonly actorId: CombatActorId;
      readonly defenderId: CombatActorId | null;
      readonly attackerAttack: number | null;
      readonly defenderDefense: number | null;
      readonly hitRoll: number | null;
      readonly hitChancePercent: number;
      readonly reason: AttackMissReason;
    };
    readonly entity_died: {
      readonly entityId: CombatActorId;
      readonly kind: "enemy" | "player";
      readonly position: Position;
      readonly xpYield: number;
    };
    readonly xp_gained: {
      readonly actorId: PlayerActorId;
      readonly sourceEntityId: EntityId;
      readonly amount: number;
      readonly totalXp: number;
    };
  }
}

const COMBAT_RNG_STREAM_ID = "combat";
const ROOT_RNG_STREAM_ID = "root";
const UINT32_SIZE = 0x1_0000_0000;
const HIT_ROLL_MIN = 1;
const HIT_ROLL_MAX = 100;

let lootDropHook: LootDropHook = ({ state }) => state;

type CombatActor =
  | {
      readonly id: PlayerActorId;
      readonly kind: "player";
      readonly position: Position;
      readonly hp: number;
      readonly statuses: readonly StatusApplication[];
    }
  | {
      readonly id: EntityId;
      readonly kind: "enemy";
      readonly entity: EnemyEntityInstance;
      readonly position: Position;
      readonly hp: number;
      readonly statuses: readonly StatusApplication[];
    };

type MutableRngContext = {
  readonly rng: Rng;
  readonly initialDraws: number;
  drawsUsed: number;
};

type BoltTargetResult =
  | {
      readonly status: "target";
      readonly actor: CombatActor;
    }
  | {
      readonly status: "miss";
      readonly reason: Exclude<AttackMissReason, "hit_roll">;
    };

export const deriveCombatStats = (
  state: GameState,
  actorId: CombatActorId,
): CombatStats | null => {
  const actor = combatActor(state, actorId);

  if (actor === null) {
    return null;
  }

  const stats =
    actor.kind === "player"
      ? playerBaseStats(state)
      : {
          attack: actor.entity.definition.stats.attack,
          defense: actor.entity.definition.stats.defense,
        };

  const withStatusModifiers = applyStatusModifiers(stats, actor.statuses);

  return {
    attack: Math.max(
      config.combatMath.minimumDamage,
      withStatusModifiers.attack,
    ),
    defense: withStatusModifiers.defense,
  };
};

export const calculateBaseDamage = (
  attackerAttack: number,
  defenderDefense: number,
): number =>
  Math.max(
    config.combatMath.minimumDamage,
    attackerAttack - defenderDefense,
  );

export const calculateDamage = (
  attackerAttack: number,
  defenderDefense: number,
  varianceMultiplier: number,
): number =>
  Math.max(
    config.combatMath.minimumDamage,
    Math.round(
      calculateBaseDamage(attackerAttack, defenderDefense) *
        varianceMultiplier,
    ),
  );

export const resolveAttack = (
  state: GameState,
  attackerId: CombatActorId,
  defenderId: CombatActorId,
): ActionResolverResult => {
  const attacker = combatActor(state, attackerId);
  const defender = combatActor(state, defenderId);

  if (attacker === null) {
    return {
      illegal: true,
      reason: `attacker ${attackerId} is not a combat actor`,
    };
  }

  if (defender === null) {
    return {
      illegal: true,
      reason: `defender ${defenderId} is not a combat actor`,
    };
  }

  if (!isAdjacent(attacker.position, defender.position)) {
    return {
      illegal: true,
      reason: `defender ${defenderId} is not adjacent to attacker ${attackerId}`,
    };
  }

  return resolveAttackRoll(state, attacker, defender);
};

export type BoltAttackOptions = {
  readonly range?: number;
};

export const resolveBoltAttack = (
  state: GameState,
  attackerId: CombatActorId,
  targetCell: Position,
  options: BoltAttackOptions = {},
): ActionResolverResult => {
  const attacker = combatActor(state, attackerId);

  if (attacker === null) {
    return {
      illegal: true,
      reason: `attacker ${attackerId} is not a combat actor`,
    };
  }

  const grid = gridFromState(state);
  if (grid === null) {
    return {
      illegal: true,
      reason: "floor geometry is not loaded",
    };
  }

  if (!inBounds(grid, targetCell)) {
    return {
      illegal: true,
      reason: `bolt target cell (${targetCell.x}, ${targetCell.y}) is outside the map`,
    };
  }

  const range =
    options.range ?? bounds.effectVocabulary.targetingShapes.boltRangeTiles.max;
  const rangeBounds = bounds.effectVocabulary.targetingShapes.boltRangeTiles;

  if (
    !Number.isSafeInteger(range) ||
    range < rangeBounds.min ||
    range > rangeBounds.max
  ) {
    return {
      illegal: true,
      reason: `bolt range must be ${rangeBounds.min}-${rangeBounds.max}`,
    };
  }

  const target = findBoltTarget(state, grid, attacker, targetCell, range);

  if (target.status === "miss") {
    return {
      state,
      events: [
        combatEvent(state, "attack_missed", {
          actorId: attacker.id,
          defenderId: null,
          attackerAttack: null,
          defenderDefense: null,
          hitRoll: null,
          hitChancePercent: config.combatMath.hitChancePercent,
          reason: target.reason,
        }),
      ],
    };
  }

  return resolveAttackRoll(state, attacker, target.actor);
};

export const resolveAttackAction: ActionResolver<AttackAction> = (
  state,
  action,
): ActionResolverResult => resolveAttack(state, "player", action.targetId);

export const registerCombatActionResolver = (): (() => void) =>
  registerActionResolver("attack", resolveAttackAction);

export const unregisterCombatActionResolver = registerCombatActionResolver();

export const registerLootDropHook = (hook: LootDropHook): (() => void) => {
  const previous = lootDropHook;
  lootDropHook = hook;

  return () => {
    if (lootDropHook === hook) {
      lootDropHook = previous;
    }
  };
};

const resolveAttackRoll = (
  state: GameState,
  attacker: CombatActor,
  defender: CombatActor,
): ActionResolverResult => {
  const attackerStats = deriveCombatStats(state, attacker.id);
  const defenderStats = deriveCombatStats(state, defender.id);

  if (attackerStats === null || defenderStats === null) {
    return {
      illegal: true,
      reason: "combat stats could not be derived",
    };
  }

  const rngContext = combatRngContextFor(state);
  const hitRoll = rollInt(rngContext, HIT_ROLL_MIN, HIT_ROLL_MAX);

  if (hitRoll > config.combatMath.hitChancePercent) {
    return {
      state: withCombatRngCursor(state, rngContext),
      events: [
        combatEvent(state, "attack_missed", {
          actorId: attacker.id,
          defenderId: defender.id,
          attackerAttack: attackerStats.attack,
          defenderDefense: defenderStats.defense,
          hitRoll,
          hitChancePercent: config.combatMath.hitChancePercent,
          reason: "hit_roll",
        }),
      ],
    };
  }

  const varianceMultiplier = rollVarianceMultiplier(rngContext);
  const baseDamage = calculateBaseDamage(
    attackerStats.attack,
    defenderStats.defense,
  );
  const damage = Math.max(
    config.combatMath.minimumDamage,
    Math.round(baseDamage * varianceMultiplier),
  );
  const defenderHpAfter = Math.max(0, defender.hp - damage);
  const damagedState = withActorHp(
    withCombatRngCursor(state, rngContext),
    defender,
    defenderHpAfter,
  );
  const events: TurnEvent[] = [
    combatEvent(state, "attack_hit", {
      actorId: attacker.id,
      defenderId: defender.id,
      attackerAttack: attackerStats.attack,
      defenderDefense: defenderStats.defense,
      baseDamage,
      damage,
      hitRoll,
      hitChancePercent: config.combatMath.hitChancePercent,
      varianceMultiplier,
      defenderHpBefore: defender.hp,
      defenderHpAfter,
    }),
  ];

  if (defenderHpAfter > 0) {
    return {
      state: damagedState,
      events,
    };
  }

  const deathResult = applyDeath(damagedState, defender.id, {
    attribution: {
      kind: "killer",
      killerId: attacker.id,
    },
  });

  return {
    state: deathResult.state,
    events: [...events, ...deathResult.events],
  };
};

const playerBaseStats = (state: GameState): CombatStats => {
  const attackGrowth = config.playerCharacter.stats.baseAttack;
  const defenseGrowth = config.playerCharacter.stats.baseDefense;
  const levelOffset = Math.max(
    0,
    state.player.level - config.playerCharacter.stats.level.start,
  );
  const weaponBonus =
    state.player.equipment.weapon?.definition.weapon?.attackBonus ?? 0;
  const armorBonus =
    state.player.equipment.armor?.definition.armor?.defenseBonus ?? 0;
  const charmModifiers = equipmentBuffModifiers(state.player.equipment.charms);

  return {
    attack:
      attackGrowth.start +
      Math.floor(levelOffset / attackGrowth.growthEveryLevels) *
        attackGrowth.growthAmount +
      weaponBonus +
      charmModifiers.attack,
    defense:
      defenseGrowth.start +
      Math.floor(levelOffset / defenseGrowth.growthEveryLevels) *
        defenseGrowth.growthAmount +
      armorBonus +
      charmModifiers.defense,
  };
};

const equipmentBuffModifiers = (
  charms: readonly (PlayerItemStack | null)[],
): CombatStats => {
  let attack = 0;
  let defense = 0;

  for (const charm of charms) {
    const effects = charm?.definition.charm?.passive.effects ?? [];

    for (const effect of effects) {
      const modifier = buffModifierFromEffect(effect);

      if (modifier?.stat === "ATK") {
        attack += modifier.magnitude;
      }

      if (modifier?.stat === "DEF") {
        defense += modifier.magnitude;
      }
    }
  }

  return { attack, defense };
};

const applyStatusModifiers = (
  stats: CombatStats,
  statuses: readonly StatusApplication[],
): CombatStats => {
  let attack = stats.attack;
  let defense = stats.defense;

  for (const status of statuses) {
    if (status.status === "shield") {
      defense += config.statusMagnitudes.shieldDefBonus;
    }

    if (status.status === "weaken") {
      attack += config.statusMagnitudes.weakenAtkPenalty;
    }

    const modifier = buffModifierFromRuntimeStatus(status);
    if (modifier?.stat === "ATK") {
      attack += modifier.magnitude;
    }

    if (modifier?.stat === "DEF") {
      defense += modifier.magnitude;
    }
  }

  return { attack, defense };
};

const buffModifierFromEffect = (
  effect: Effect,
): { readonly stat: "ATK" | "DEF"; readonly magnitude: number } | null => {
  if (effect.kind !== "buff_stat" || effect.buffStat === null) {
    return null;
  }

  return {
    stat: effect.buffStat.stat,
    magnitude: effect.buffStat.magnitude,
  };
};

const buffModifierFromRuntimeStatus = (
  status: StatusApplication,
): { readonly stat: "ATK" | "DEF"; readonly magnitude: number } | null => {
  const runtime = status as unknown as {
    readonly kind?: unknown;
    readonly stat?: unknown;
    readonly magnitude?: unknown;
    readonly buffStat?: {
      readonly stat?: unknown;
      readonly magnitude?: unknown;
    };
  };

  if (
    runtime.kind === "buff_stat" &&
    isCombatStat(runtime.stat) &&
    isSafeIntegerNumber(runtime.magnitude)
  ) {
    return {
      stat: runtime.stat,
      magnitude: runtime.magnitude,
    };
  }

  if (
    runtime.buffStat !== undefined &&
    isCombatStat(runtime.buffStat.stat) &&
    isSafeIntegerNumber(runtime.buffStat.magnitude)
  ) {
    return {
      stat: runtime.buffStat.stat,
      magnitude: runtime.buffStat.magnitude,
    };
  }

  return null;
};

const isCombatStat = (value: unknown): value is "ATK" | "DEF" =>
  value === "ATK" || value === "DEF";

const isSafeIntegerNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const combatRngContextFor = (state: GameState): MutableRngContext => {
  const previousDraws = state.rng.streams[COMBAT_RNG_STREAM_ID]?.draws ?? 0;
  const rng = createRng(state.rng.rootSeed);
  const combatRng = rng.fork("combat");

  for (let index = 0; index < previousDraws; index += 1) {
    combatRng.nextUint32();
  }

  return {
    rng: combatRng,
    initialDraws: previousDraws,
    drawsUsed: 0,
  };
};

const withCombatRngCursor = (
  state: GameState,
  context: MutableRngContext,
): GameState => {
  const existing = state.rng.streams[COMBAT_RNG_STREAM_ID];

  return {
    ...state,
    rng: {
      ...state.rng,
      streams: {
        ...state.rng.streams,
        [COMBAT_RNG_STREAM_ID]: {
          streamId: COMBAT_RNG_STREAM_ID,
          seed: existing?.seed ?? state.rng.rootSeed,
          parentStreamId: existing?.parentStreamId ?? ROOT_RNG_STREAM_ID,
          draws: context.initialDraws + context.drawsUsed,
        },
      },
    },
  };
};

const rollInt = (
  context: MutableRngContext,
  min: number,
  max: number,
): number => {
  const range = max - min + 1;
  const limit = UINT32_SIZE - (UINT32_SIZE % range);
  let value = drawUint32(context);

  while (value >= limit) {
    value = drawUint32(context);
  }

  return min + (value % range);
};

const rollVarianceMultiplier = (context: MutableRngContext): number => {
  const unit = drawUint32(context) / UINT32_SIZE;
  const variance = config.combatMath.varianceMultiplier;

  return variance.min + unit * (variance.max - variance.min);
};

const drawUint32 = (context: MutableRngContext): number => {
  context.drawsUsed += 1;

  return context.rng.nextUint32();
};

const findBoltTarget = (
  state: GameState,
  grid: TileGrid,
  attacker: CombatActor,
  targetCell: Position,
  range: number,
): BoltTargetResult => {
  const cells = line(attacker.position, targetCell).slice(1, range + 1);
  let blocked = false;

  for (const cell of cells) {
    if (!inBounds(grid, cell)) {
      break;
    }

    const tile = getTile(grid, cell);
    if (!isTransparentTile(tile)) {
      blocked = true;
      break;
    }

    const target = damageableActorAt(state, cell, attacker.id);
    if (target !== null) {
      return canSee(grid, attacker.position, target.position, { radius: range })
        ? { status: "target", actor: target }
        : { status: "miss", reason: "line_of_sight_blocked" };
    }
  }

  return {
    status: "miss",
    reason: blocked ? "line_of_sight_blocked" : "no_target",
  };
};

const damageableActorAt = (
  state: GameState,
  position: Position,
  excludedActorId: CombatActorId,
): CombatActor | null => {
  if (
    excludedActorId !== "player" &&
    samePosition(state.player.position, position)
  ) {
    return combatActor(state, "player");
  }

  for (const entity of Object.values(state.entities).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (
      entity.id !== excludedActorId &&
      entity.kind === "enemy" &&
      samePosition(entity.position, position)
    ) {
      return combatActor(state, entity.id);
    }
  }

  return null;
};

export const applyDeath = (
  state: GameState,
  entityId: CombatActorId,
  options: ApplyDeathOptions,
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  const victim = combatActor(state, entityId);

  if (victim === null) {
    return { state, events: [] };
  }

  const events: TurnEvent[] = [
    combatEvent(state, "entity_died", {
      entityId: victim.id,
      kind: victim.kind,
      position: victim.position,
      xpYield: victim.kind === "enemy" ? victim.entity.definition.stats.xpYield : 0,
    }),
  ];

  if (victim.kind === "player") {
    return {
      state: {
        ...state,
        player: {
          ...state.player,
          hp: {
            ...state.player.hp,
            current: 0,
          },
        },
        run: {
          ...state.run,
          terminalStatus: config.runStructure.terminalStates.loss,
        },
      },
      events,
    };
  }

  let nextState = withoutEntity(state, victim.id);

  if (
    options.attribution.kind === "killer" &&
    options.attribution.killerId === "player"
  ) {
    const xpYield = victim.entity.definition.stats.xpYield;
    const totalXp = nextState.player.xp + xpYield;
    nextState = {
      ...nextState,
      player: {
        ...nextState.player,
        xp: totalXp,
      },
    };
    events.push(
      combatEvent(state, "xp_gained", {
        actorId: "player",
        sourceEntityId: victim.id,
        amount: xpYield,
        totalXp,
      }),
    );
  }

  const killerId =
    options.attribution.kind === "killer" ? options.attribution.killerId : null;
  const lootResult = normalizeLootDropResult(
    lootDropHook({
      state: nextState,
      victim: victim.entity,
      attribution: options.attribution,
      killerId,
    }),
  );

  return {
    state: lootResult.state,
    events: [...events, ...lootResult.events],
  };
};

const withActorHp = (
  state: GameState,
  actor: CombatActor,
  hp: number,
): GameState => {
  if (actor.kind === "player") {
    return {
      ...state,
      player: {
        ...state.player,
        hp: {
          ...state.player.hp,
          current: hp,
        },
      },
    };
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [actor.id]: {
        ...actor.entity,
        currentHP: hp,
      },
    },
  };
};

const withoutEntity = (state: GameState, entityId: EntityId): GameState => {
  const remaining = { ...state.entities };
  delete remaining[entityId];

  return {
    ...state,
    entities: remaining,
  };
};

const normalizeLootDropResult = (
  result: LootDropResult,
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  if ("state" in result) {
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

const combatActor = (
  state: GameState,
  actorId: CombatActorId,
): CombatActor | null => {
  if (actorId === "player") {
    return {
      id: "player",
      kind: "player",
      position: state.player.position,
      hp: state.player.hp.current,
      statuses: state.player.statuses,
    };
  }

  const entity = state.entities[actorId];

  if (entity?.kind !== "enemy") {
    return null;
  }

  return {
    id: entity.id,
    kind: "enemy",
    entity,
    position: entity.position,
    hp: entity.currentHP,
    statuses: entity.statuses,
  };
};

const gridFromState = (state: GameState): TileGrid | null => {
  const opaque = state.floor.geometry.opaque;

  if (!isTileGridRecord(opaque)) {
    return null;
  }

  return opaque as unknown as TileGrid;
};

const isTileGridRecord = (
  value: SerializableRecord | null,
): value is SerializableRecord => {
  if (value === null) {
    return false;
  }

  const record = value as {
    readonly kind?: unknown;
    readonly width?: unknown;
    readonly height?: unknown;
    readonly tiles?: unknown;
  };

  return (
    record.kind === "tile-grid" &&
    Number.isSafeInteger(record.width) &&
    Number.isSafeInteger(record.height) &&
    Array.isArray(record.tiles)
  );
};

const isAdjacent = (a: Position, b: Position): boolean =>
  !samePosition(a, b) && chebyshevDistance(a, b) <= 1;

const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const combatEvent = <Type extends CombatLogEventType>(
  state: GameState,
  type: Type,
  data: EngineLogEventDataByType[Type],
): Extract<TurnEvent, { readonly type: Type }> =>
  ({
    turn: state.run.turn,
    type,
    data,
  }) as Extract<TurnEvent, { readonly type: Type }>;

type CombatLogEventType =
  | "attack_hit"
  | "attack_missed"
  | "entity_died"
  | "xp_gained";
