import { bounds, config } from "../../config/index.js";
import type { ItemDefinition, TrapDefinition } from "../../schemas/entities/index.js";
import type { EffectBundle, TargetingShape } from "../../schemas/vocab/index.js";
import {
  getTile,
  inBounds,
  isTransparentTile,
  line,
  type TileGrid,
} from "../map/index.js";
import { createRng, type Rng } from "../rng/index.js";
import {
  type EntityId,
  type EntityInstance,
  type GameState,
  type PlayerItemStack,
  type Position,
  type RngStreamCursor,
  type SerializableRecord,
} from "../state/index.js";
import { resolveAttack, type CombatActorId } from "../systems/combat.js";
import {
  equipItem,
  removeFromInventory,
} from "../systems/inventory.js";
import {
  registerActionResolver,
  type ActionResolver,
  type ActionResolverResult,
  type AttackAction,
  type MoveDirection,
  type TurnEvent,
  type UseItemAction,
} from "../turn/index.js";
import { gridFromState } from "../turn/actions.js";
import { resolveTargetingGeometry } from "../effects/geometry.js";
import {
  executeBundle,
  type EffectActorId,
} from "../effects/registry.js";
import {
  identifyDefinitionByUse,
  revealEquipmentBonus,
} from "./identify.js";

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly item_triggered: {
      readonly itemInstanceId: string;
      readonly definitionId: string;
      readonly trigger: ItemTriggerEventKind;
      readonly targetIds: readonly string[];
      readonly cells: readonly SerializableRecord[];
      readonly whiffed: boolean;
    };
    readonly item_identified: {
      readonly itemInstanceId: string;
      readonly definitionId: string;
      readonly category: ItemDefinition["kind"];
    };
    readonly item_consumed: {
      readonly itemInstanceId: string;
      readonly definitionId: string;
      readonly quantityBefore: number;
      readonly quantityAfter: number;
    };
    readonly item_charge_used: {
      readonly itemInstanceId: string;
      readonly definitionId: string;
      readonly chargesBefore: number;
      readonly chargesAfter: number;
    };
    readonly item_depleted: {
      readonly itemInstanceId: string;
      readonly definitionId: string;
    };
    readonly item_proc_checked: {
      readonly itemInstanceId: string;
      readonly definitionId: string;
      readonly trigger: "on_hit" | "on_struck";
      readonly chancePercent: number;
      readonly triggered: boolean;
    };
    readonly item_proc_triggered: {
      readonly itemInstanceId: string;
      readonly definitionId: string;
      readonly trigger: "on_hit" | "on_struck";
      readonly targetIds: readonly string[];
    };
    readonly trap_step_triggered: {
      readonly trapId: EntityId;
      readonly definitionId: string;
      readonly actorId: EffectActorId;
    };
  }
}

export type ItemTriggerEventKind =
  | "quaff"
  | "read"
  | "throw_hit"
  | "equip_passive"
  | "on_hit"
  | "on_struck"
  | "use"
  | "step";

export type ItemProcDispatchInput = {
  readonly stateBefore: GameState;
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
};

export type ItemProcRoll = {
  readonly state: GameState;
  readonly triggered: boolean;
};

type MutableRngContext = {
  readonly rng: Rng;
  readonly initialDraws: number;
  drawsUsed: number;
};

type TriggerDispatchOptions = {
  readonly item: PlayerItemStack;
  readonly bundle: EffectBundle;
  readonly trigger: ItemTriggerEventKind;
  readonly action: UseItemAction;
};

type BundleDispatchOptions = {
  readonly itemInstanceId: string;
  readonly definitionId: string;
  readonly trigger: ItemTriggerEventKind;
  readonly bundle: EffectBundle;
  readonly sourceId: EffectActorId;
  readonly origin: Position;
  readonly targetCell?: Position;
};

type ThrowImpact = {
  readonly cells: readonly Position[];
  readonly impactCell: Position | null;
  readonly targetIds: readonly EffectActorId[];
};

const ITEMS_RNG_STREAM_ID = "items";
const ROOT_RNG_STREAM_ID = "root";
const UINT32_SIZE = 0x1_0000_0000;

const DIRECTION_OFFSETS = {
  northwest: { x: -1, y: -1 },
  north: { x: 0, y: -1 },
  northeast: { x: 1, y: -1 },
  west: { x: -1, y: 0 },
  east: { x: 1, y: 0 },
  southwest: { x: -1, y: 1 },
  south: { x: 0, y: 1 },
  southeast: { x: 1, y: 1 },
} as const satisfies Record<MoveDirection, Position>;

export const resolveUseItemAction: ActionResolver<UseItemAction> = (
  state,
  action,
): ActionResolverResult => {
  const item = state.player.inventory.find(
    (slot) => slot?.itemInstanceId === action.itemId,
  );

  if (item === null || item === undefined) {
    return {
      illegal: true,
      reason: `item ${action.itemId} is not carried`,
    };
  }

  switch (item.definition.kind) {
    case "weapon":
    case "armor":
    case "charm":
      return useEquipmentItem(state, item);
    case "draught":
      return useBundledItem(state, {
        item,
        bundle: item.definition.draught?.effect ?? null,
        trigger: "quaff",
        action,
        consume: true,
      });
    case "note":
      return useBundledItem(state, {
        item,
        bundle: item.definition.note?.effect ?? null,
        trigger: "read",
        action,
        consume: true,
      });
    case "throwable":
      return useBundledItem(state, {
        item,
        bundle: item.definition.throwable?.effect ?? null,
        trigger: "throw_hit",
        action,
        consume: true,
      });
    case "food":
      return useBundledItem(state, {
        item,
        bundle: item.definition.food?.effect ?? null,
        trigger: "use",
        action,
        consume: true,
      });
    case "tool":
      return useToolItem(state, item, action);
    case "key_item":
    case "coin":
      return {
        illegal: true,
        reason: `${item.definition.kind} items cannot be used directly`,
      };
  }
};

export const resolveItemAwareAttackAction: ActionResolver<AttackAction> = (
  state,
  action,
): ActionResolverResult => {
  const combat = resolveAttack(state, "player", action.targetId);

  if ("illegal" in combat) {
    return combat;
  }

  return dispatchCombatItemProcs({
    stateBefore: state,
    state: combat.state,
    events: combat.events,
  });
};

export const dispatchCombatItemProcs = ({
  stateBefore,
  state,
  events,
}: ItemProcDispatchInput): ActionResolverResult => {
  let nextState = state;
  const procEvents: TurnEvent[] = [];

  for (const event of events) {
    if (event.type !== "attack_hit") {
      continue;
    }

    const onHit = dispatchOnHitProc(stateBefore, nextState, event);
    nextState = onHit.state;
    procEvents.push(...onHit.events);

    const onStruck = dispatchOnStruckProc(stateBefore, nextState, event);
    nextState = onStruck.state;
    procEvents.push(...onStruck.events);
  }

  return {
    state: nextState,
    events: [...events, ...procEvents],
  };
};

export const rollItemProcChance = (
  state: GameState,
  chancePercent: number,
): ItemProcRoll => rollItemsPercent(state, chancePercent);

export const rollGeneratedGearCursed = (
  state: GameState,
): ItemProcRoll => {
  const chancePercent = Math.floor(config.itemsEconomy.cursedRate * 100);
  const cappedChance = Math.min(
    chancePercent,
    config.itemsEconomy.cursedGearChanceMaxPercent,
  );

  return rollItemsPercent(state, cappedChance);
};

export const dispatchStepTrigger = (
  state: GameState,
  trapId: EntityId,
  actorId: EffectActorId = "player",
): ActionResolverResult => {
  const trap = state.entities[trapId];

  if (trap?.kind !== "trap") {
    return {
      illegal: true,
      reason: `trap ${trapId} does not exist`,
    };
  }

  if (!trap.armed) {
    return {
      state,
      events: [],
    };
  }

  const bundle = trap.definition.effectBundle;
  if (bundle.trigger.kind !== "step") {
    return {
      illegal: true,
      reason: `trap ${trapId} does not have a step trigger`,
    };
  }

  const dispatched = dispatchBundleToTargeting(state, {
    itemInstanceId: trapId,
    definitionId: trap.definition.id,
    trigger: "step",
    bundle,
    sourceId: trapId,
    origin: trap.position,
    targetCell: actorPosition(state, actorId) ?? trap.position,
  });

  return {
    state: dispatched.state,
    events: [
      triggerTrapEvent(state, trapId, trap.definition, actorId),
      ...dispatched.events,
    ],
  };
};

export const registerItemActionResolvers = (): (() => void) => {
  const unregisterUse = registerActionResolver("use_item", resolveUseItemAction);
  const unregisterAttack = registerActionResolver(
    "attack",
    resolveItemAwareAttackAction,
  );

  return () => {
    unregisterAttack();
    unregisterUse();
  };
};

export const unregisterItemActionResolvers = registerItemActionResolvers();

const useEquipmentItem = (
  state: GameState,
  item: PlayerItemStack,
): ActionResolverResult => {
  const equipped = equipItem(state, item.itemInstanceId);

  if ("illegal" in equipped) {
    return equipped;
  }

  let nextState = equipped.state;
  const events = [...equipped.events];

  if (item.definition.kind === "weapon" || item.definition.kind === "armor") {
    nextState = revealEquipmentBonus(nextState, item.itemInstanceId);
  }

  if (item.definition.kind === "charm") {
    nextState = identifyDefinitionByUse(nextState, item.definition);
    const passive = item.definition.charm?.passive;

    if (passive !== undefined && passive !== null) {
      events.push(
        itemTriggeredEvent(state, {
          itemInstanceId: item.itemInstanceId,
          definitionId: item.definition.id,
          trigger: "equip_passive",
          targetIds: ["player"],
          cells: [state.player.position],
          whiffed: false,
        }),
      );
    }
  }

  return {
    state: nextState,
    events: maybeIdentifiedEvent(state, item, nextState, events),
  };
};

const useBundledItem = (
  state: GameState,
  options: Omit<TriggerDispatchOptions, "bundle"> & {
    readonly bundle: EffectBundle | null;
    readonly consume: boolean;
  },
): ActionResolverResult => {
  const { item, bundle, trigger, action } = options;

  if (bundle === null) {
    return {
      illegal: true,
      reason: `${item.definition.kind} item ${item.itemInstanceId} has no effect bundle`,
    };
  }

  if (bundle.trigger.kind !== trigger) {
    return {
      illegal: true,
      reason: `${item.definition.kind} item ${item.itemInstanceId} does not declare a ${trigger} trigger`,
    };
  }

  const dispatched = dispatchItemTrigger(state, {
    item,
    bundle,
    trigger,
    action,
  });
  let nextState = identifyDefinitionByUse(dispatched.state, item.definition);
  let events = maybeIdentifiedEvent(state, item, nextState, dispatched.events);

  if (options.consume) {
    const consumed = consumeOne(nextState, item);
    nextState = consumed.state;
    events = [...events, ...consumed.events];
  }

  return {
    state: nextState,
    events,
  };
};

const useToolItem = (
  state: GameState,
  item: PlayerItemStack,
  action: UseItemAction,
): ActionResolverResult => {
  const bundle = item.definition.tool?.effect ?? null;

  if (bundle === null) {
    return {
      illegal: true,
      reason: `tool item ${item.itemInstanceId} has no effect bundle`,
    };
  }

  if (bundle.trigger.kind !== "use" || bundle.trigger.use === null) {
    return {
      illegal: true,
      reason: `tool item ${item.itemInstanceId} does not declare a use trigger`,
    };
  }

  const chargesBefore =
    state.run.itemKnowledge.chargesByItemInstanceId[item.itemInstanceId] ??
    bundle.trigger.use.charges;

  if (chargesBefore < 1) {
    return {
      illegal: true,
      reason: `tool item ${item.itemInstanceId} has no charges`,
    };
  }

  const dispatched = dispatchItemTrigger(state, {
    item,
    bundle,
    trigger: "use",
    action,
  });
  const chargesAfter = chargesBefore - 1;
  let nextState = withToolCharges(
    identifyDefinitionByUse(dispatched.state, item.definition),
    item.itemInstanceId,
    chargesAfter,
  );
  let events = maybeIdentifiedEvent(state, item, nextState, [
    ...dispatched.events,
    itemChargeUsedEvent(state, item, chargesBefore, chargesAfter),
  ]);

  if (chargesAfter === 0) {
    const consumed = consumeOne(nextState, item);
    nextState = consumed.state;
    events = [
      ...events,
      ...consumed.events,
      itemDepletedEvent(state, item),
    ];
  }

  return {
    state: nextState,
    events,
  };
};

const dispatchItemTrigger = (
  state: GameState,
  options: TriggerDispatchOptions,
): {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
} => {
  if (options.trigger === "quaff") {
    return dispatchBundleToTargeting(state, {
      itemInstanceId: options.item.itemInstanceId,
      definitionId: options.item.definition.id,
      trigger: options.trigger,
      bundle: options.bundle,
      sourceId: "player",
      origin: state.player.position,
      targetCell: state.player.position,
    });
  }

  if (options.trigger === "throw_hit") {
    return dispatchThrowHit(state, options);
  }

  const targetCell = targetCellForAction(state, options.action, options.bundle.targeting);

  return dispatchBundleToTargeting(state, {
    itemInstanceId: options.item.itemInstanceId,
    definitionId: options.item.definition.id,
    trigger: options.trigger,
    bundle: options.bundle,
    sourceId: "player",
    origin: state.player.position,
    targetCell,
  });
};

const dispatchThrowHit = (
  state: GameState,
  options: TriggerDispatchOptions,
): {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
} => {
  const grid = gridFromState(state);

  if (grid === null) {
    return {
      state,
      events: [],
    };
  }

  const range = rangeForThrow(options.bundle.targeting);
  const targetCell = targetCellForAction(state, options.action, options.bundle.targeting);
  const aimedCell =
    targetCell ?? cellInDirection(state.player.position, options.action.direction, range);

  if (aimedCell === null) {
    return {
      state,
      events: [
        itemTriggeredEvent(state, {
          itemInstanceId: options.item.itemInstanceId,
          definitionId: options.item.definition.id,
          trigger: "throw_hit",
          targetIds: [],
          cells: [],
          whiffed: true,
        }),
      ],
    };
  }

  const impact = throwImpact(state, grid, state.player.position, aimedCell, range);
  if (impact.impactCell === null) {
    return {
      state,
      events: [
        itemTriggeredEvent(state, {
          itemInstanceId: options.item.itemInstanceId,
          definitionId: options.item.definition.id,
          trigger: "throw_hit",
          targetIds: [],
          cells: impact.cells,
          whiffed: true,
        }),
      ],
    };
  }

  const dispatched = dispatchBundleToTargeting(state, {
    itemInstanceId: options.item.itemInstanceId,
    definitionId: options.item.definition.id,
    trigger: "throw_hit",
    bundle: options.bundle,
    sourceId: "player",
    origin: state.player.position,
    targetCell: impact.impactCell,
  });

  return {
    state: dispatched.state,
    events: dispatched.events,
  };
};

const dispatchBundleToTargeting = (
  state: GameState,
  options: BundleDispatchOptions,
): {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
} => {
  const geometry = resolveTargetingGeometry(
    state,
    options.origin,
    options.bundle.targeting,
    {
      originActorId: options.sourceId,
      targetCell: options.targetCell,
    },
  );
  const targetIds = targetIdsForBundle(options.bundle, geometry.entityIds);
  const events: TurnEvent[] = [
    itemTriggeredEvent(state, {
      itemInstanceId: options.itemInstanceId,
      definitionId: options.definitionId,
      trigger: options.trigger,
      targetIds,
      cells: geometry.cells,
      whiffed:
        targetIds.length === 0 &&
        options.bundle.targeting.kind !== "floor",
    }),
  ];
  let nextState = state;

  if (targetIds.length === 0 && options.bundle.targeting.kind !== "floor") {
    return {
      state: nextState,
      events,
    };
  }

  const executionTargets =
    targetIds.length === 0 ? [null] : targetIds;
  const rngContext = itemsRngContextFor(nextState);
  nextState = withItemsRngCursor(nextState, rngContext);

  for (const targetId of executionTargets) {
    const result = executeBundle(nextState, options.bundle, {
      sourceId: options.sourceId,
      targetId,
      origin: options.origin,
      rng: rngContext.rng,
    });
    nextState = result.state;
    events.push(...result.events);
  }

  return {
    state: nextState,
    events,
  };
};

const targetIdsForBundle = (
  bundle: EffectBundle,
  entityIds: readonly EffectActorId[],
): readonly EffectActorId[] => {
  if (bundle.targeting.kind === "self") {
    return ["player"];
  }

  return entityIds;
};

const dispatchOnHitProc = (
  stateBefore: GameState,
  state: GameState,
  event: Extract<TurnEvent, { readonly type: "attack_hit" }>,
): {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
} => {
  if (event.data.actorId !== "player") {
    return { state, events: [] };
  }

  const weapon = stateBefore.player.equipment.weapon;
  const proc = weapon?.definition.weapon?.onHit ?? null;

  if (weapon === null || proc === null) {
    return { state, events: [] };
  }

  const rolled = rollItemsPercent(state, proc.chancePercent);
  const checked = itemProcCheckedEvent(state, weapon, "on_hit", proc.chancePercent, rolled.triggered);

  if (!rolled.triggered) {
    return {
      state: rolled.state,
      events: [checked],
    };
  }

  const defenderPosition = actorPosition(stateBefore, event.data.defenderId);
  if (defenderPosition === null) {
    return {
      state: rolled.state,
      events: [checked],
    };
  }

  const dispatched = dispatchBundleToTargeting(rolled.state, {
    itemInstanceId: weapon.itemInstanceId,
    definitionId: weapon.definition.id,
    trigger: "on_hit",
    bundle: proc.bundle,
    sourceId: "player",
    origin: stateBefore.player.position,
    targetCell: defenderPosition,
  });

  return {
    state: dispatched.state,
    events: [
      checked,
      itemProcTriggeredEvent(state, weapon, "on_hit", procTargets(dispatched.events)),
      ...dispatched.events,
    ],
  };
};

const dispatchOnStruckProc = (
  stateBefore: GameState,
  state: GameState,
  event: Extract<TurnEvent, { readonly type: "attack_hit" }>,
): {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
} => {
  if (event.data.defenderId !== "player") {
    return { state, events: [] };
  }

  const armor = stateBefore.player.equipment.armor;
  const proc = armor?.definition.armor?.onStruck ?? null;

  if (armor === null || proc === null) {
    return { state, events: [] };
  }

  const rolled = rollItemsPercent(state, proc.chancePercent);
  const checked = itemProcCheckedEvent(state, armor, "on_struck", proc.chancePercent, rolled.triggered);

  if (!rolled.triggered) {
    return {
      state: rolled.state,
      events: [checked],
    };
  }

  const attackerPosition = actorPosition(stateBefore, event.data.actorId);
  if (attackerPosition === null) {
    return {
      state: rolled.state,
      events: [checked],
    };
  }

  const dispatched = dispatchBundleToTargeting(rolled.state, {
    itemInstanceId: armor.itemInstanceId,
    definitionId: armor.definition.id,
    trigger: "on_struck",
    bundle: proc.bundle,
    sourceId: "player",
    origin: stateBefore.player.position,
    targetCell: attackerPosition,
  });

  return {
    state: dispatched.state,
    events: [
      checked,
      itemProcTriggeredEvent(state, armor, "on_struck", procTargets(dispatched.events)),
      ...dispatched.events,
    ],
  };
};

const rollItemsPercent = (
  state: GameState,
  chancePercent: number,
): ItemProcRoll => {
  const rngContext = itemsRngContextFor(state);
  const roll = rollInt(rngContext, 1, 100);

  return {
    state: withItemsRngCursor(state, rngContext),
    triggered: roll <= chancePercent,
  };
};

const itemsRngContextFor = (state: GameState): MutableRngContext => {
  const previousDraws = state.rng.streams[ITEMS_RNG_STREAM_ID]?.draws ?? 0;
  const itemsRng = createRng(state.rng.rootSeed).fork(ITEMS_RNG_STREAM_ID);

  for (let index = 0; index < previousDraws; index += 1) {
    itemsRng.nextUint32();
  }

  return {
    rng: itemsRng,
    initialDraws: previousDraws,
    drawsUsed: 0,
  };
};

const withItemsRngCursor = (
  state: GameState,
  context: MutableRngContext,
): GameState => {
  const existing = state.rng.streams[ITEMS_RNG_STREAM_ID];
  const cursor: RngStreamCursor = {
    streamId: ITEMS_RNG_STREAM_ID,
    seed: existing?.seed ?? state.rng.rootSeed,
    parentStreamId: existing?.parentStreamId ?? ROOT_RNG_STREAM_ID,
    draws: context.initialDraws + context.drawsUsed,
  };

  return {
    ...state,
    rng: {
      ...state.rng,
      streams: {
        ...state.rng.streams,
        [ITEMS_RNG_STREAM_ID]: cursor,
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

const drawUint32 = (context: MutableRngContext): number => {
  context.drawsUsed += 1;

  return context.rng.nextUint32();
};

const consumeOne = (
  state: GameState,
  item: PlayerItemStack,
): {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
} => {
  const removed = removeFromInventory(state, item.itemInstanceId, 1);

  if ("illegal" in removed) {
    return {
      state,
      events: [],
    };
  }

  return {
    state: removed.state,
    events: [
      itemConsumedEvent(state, item, item.quantity, item.quantity - 1),
    ],
  };
};

const withToolCharges = (
  state: GameState,
  itemInstanceId: string,
  charges: number,
): GameState => {
  const entries = Object.entries(
    state.run.itemKnowledge.chargesByItemInstanceId,
  ).filter(([id]) => id !== itemInstanceId);
  const chargesByItemInstanceId =
    charges > 0
      ? Object.fromEntries([...entries, [itemInstanceId, charges]].sort())
      : Object.fromEntries(entries);

  return {
    ...state,
    run: {
      ...state.run,
      itemKnowledge: {
        ...state.run.itemKnowledge,
        chargesByItemInstanceId,
      },
    },
  };
};

const targetCellForAction = (
  state: GameState,
  action: UseItemAction,
  targeting: TargetingShape,
): Position | undefined => {
  if (action.target?.kind === "cell") {
    return action.target.cell;
  }

  if (action.target?.kind === "entity") {
    return actorPosition(state, action.target.entityId) ?? undefined;
  }

  if (action.direction !== undefined) {
    return cellInDirection(state.player.position, action.direction, rangeForThrow(targeting)) ?? undefined;
  }

  if (targeting.kind === "self") {
    return state.player.position;
  }

  return undefined;
};

const cellInDirection = (
  origin: Position,
  direction: MoveDirection | undefined,
  range: number,
): Position | null => {
  if (direction === undefined) {
    return null;
  }

  const offset = DIRECTION_OFFSETS[direction];

  return {
    x: origin.x + offset.x * range,
    y: origin.y + offset.y * range,
  };
};

const rangeForThrow = (targeting: TargetingShape): number =>
  targeting.kind === "bolt"
    ? targeting.bolt?.rangeTiles ?? bounds.effectVocabulary.targetingShapes.boltRangeTiles.max
    : bounds.effectVocabulary.targetingShapes.boltRangeTiles.max;

const throwImpact = (
  state: GameState,
  grid: TileGrid,
  origin: Position,
  targetCell: Position,
  range: number,
): ThrowImpact => {
  const cells: Position[] = [];

  for (const cell of line(origin, targetCell).slice(1, range + 1)) {
    if (!inBounds(grid, cell)) {
      break;
    }

    const tile = getTile(grid, cell);
    if (!isTransparentTile(tile)) {
      break;
    }

    cells.push(cell);
    const occupants = entitiesAt(state, cell).filter((id) => id !== "player");

    if (occupants.length > 0) {
      return {
        cells,
        impactCell: cell,
        targetIds: occupants,
      };
    }
  }

  return {
    cells,
    impactCell: cells.at(-1) ?? null,
    targetIds: [],
  };
};

const entitiesAt = (
  state: GameState,
  position: Position,
): readonly EffectActorId[] => {
  const ids: EffectActorId[] = [];

  if (samePosition(state.player.position, position)) {
    ids.push("player");
  }

  for (const entity of sortedEntities(state)) {
    if (samePosition(entity.position, position)) {
      ids.push(entity.id);
    }
  }

  return ids;
};

const sortedEntities = (state: GameState): readonly EntityInstance[] =>
  Object.values(state.entities).sort((left, right) =>
    left.id.localeCompare(right.id),
  );

const actorPosition = (
  state: GameState,
  actorId: EffectActorId | CombatActorId,
): Position | null => {
  if (actorId === "player") {
    return state.player.position;
  }

  return state.entities[actorId]?.position ?? null;
};

const maybeIdentifiedEvent = (
  stateBefore: GameState,
  item: PlayerItemStack,
  stateAfter: GameState,
  events: readonly TurnEvent[],
): readonly TurnEvent[] => {
  const wasKnown = stateBefore.run.itemKnowledge.identifiedDefinitionIds.includes(
    item.definition.id,
  );
  const isKnown = stateAfter.run.itemKnowledge.identifiedDefinitionIds.includes(
    item.definition.id,
  );

  return !wasKnown && isKnown
    ? [...events, itemIdentifiedEvent(stateBefore, item)]
    : events;
};

const procTargets = (events: readonly TurnEvent[]): readonly string[] => {
  const triggered = events.find((event) => event.type === "item_triggered");

  return triggered?.type === "item_triggered"
    ? triggered.data.targetIds
    : [];
};

const itemTriggeredEvent = (
  state: GameState,
  input: {
    readonly itemInstanceId: string;
    readonly definitionId: string;
    readonly trigger: ItemTriggerEventKind;
    readonly targetIds: readonly EffectActorId[];
    readonly cells: readonly Position[];
    readonly whiffed: boolean;
  },
): Extract<TurnEvent, { readonly type: "item_triggered" }> => ({
  turn: state.run.turn,
  type: "item_triggered",
  data: {
    itemInstanceId: input.itemInstanceId,
    definitionId: input.definitionId,
    trigger: input.trigger,
    targetIds: input.targetIds,
    cells: input.cells.map(serializablePosition),
    whiffed: input.whiffed,
  },
});

const itemIdentifiedEvent = (
  state: GameState,
  item: PlayerItemStack,
): Extract<TurnEvent, { readonly type: "item_identified" }> => ({
  turn: state.run.turn,
  type: "item_identified",
  data: {
    itemInstanceId: item.itemInstanceId,
    definitionId: item.definition.id,
    category: item.definition.kind,
  },
});

const itemConsumedEvent = (
  state: GameState,
  item: PlayerItemStack,
  quantityBefore: number,
  quantityAfter: number,
): Extract<TurnEvent, { readonly type: "item_consumed" }> => ({
  turn: state.run.turn,
  type: "item_consumed",
  data: {
    itemInstanceId: item.itemInstanceId,
    definitionId: item.definition.id,
    quantityBefore,
    quantityAfter,
  },
});

const itemChargeUsedEvent = (
  state: GameState,
  item: PlayerItemStack,
  chargesBefore: number,
  chargesAfter: number,
): Extract<TurnEvent, { readonly type: "item_charge_used" }> => ({
  turn: state.run.turn,
  type: "item_charge_used",
  data: {
    itemInstanceId: item.itemInstanceId,
    definitionId: item.definition.id,
    chargesBefore,
    chargesAfter,
  },
});

const itemDepletedEvent = (
  state: GameState,
  item: PlayerItemStack,
): Extract<TurnEvent, { readonly type: "item_depleted" }> => ({
  turn: state.run.turn,
  type: "item_depleted",
  data: {
    itemInstanceId: item.itemInstanceId,
    definitionId: item.definition.id,
  },
});

const itemProcCheckedEvent = (
  state: GameState,
  item: PlayerItemStack,
  trigger: "on_hit" | "on_struck",
  chancePercent: number,
  triggered: boolean,
): Extract<TurnEvent, { readonly type: "item_proc_checked" }> => ({
  turn: state.run.turn,
  type: "item_proc_checked",
  data: {
    itemInstanceId: item.itemInstanceId,
    definitionId: item.definition.id,
    trigger,
    chancePercent,
    triggered,
  },
});

const itemProcTriggeredEvent = (
  state: GameState,
  item: PlayerItemStack,
  trigger: "on_hit" | "on_struck",
  targetIds: readonly string[],
): Extract<TurnEvent, { readonly type: "item_proc_triggered" }> => ({
  turn: state.run.turn,
  type: "item_proc_triggered",
  data: {
    itemInstanceId: item.itemInstanceId,
    definitionId: item.definition.id,
    trigger,
    targetIds,
  },
});

const triggerTrapEvent = (
  state: GameState,
  trapId: EntityId,
  definition: TrapDefinition,
  actorId: EffectActorId,
): Extract<TurnEvent, { readonly type: "trap_step_triggered" }> => ({
  turn: state.run.turn,
  type: "trap_step_triggered",
  data: {
    trapId,
    definitionId: definition.id,
    actorId,
  },
});

const serializablePosition = (position: Position): SerializableRecord => ({
  x: position.x,
  y: position.y,
});

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;
