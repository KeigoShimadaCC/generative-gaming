import type {
  EngineLogEvent,
  EngineLogEventType,
} from "../events.js";
import type {
  Position,
} from "../state/index.js";

export const formatLogEvent = (event: EngineLogEvent): string => {
  const { type, data, turn } = event;

  switch (type) {
    case "state_created":
      return `t${turn} run ${data.runId} started (seed ${data.seed}, d${data.depth} ${data.band})`;
    case "state_serialized":
      return `t${turn} state serialized (${data.format})`;
    case "state_deserialized":
      return `t${turn} state deserialized (${data.format})`;
    case "run_action_resolved":
      return `t${turn} ${data.actionKind} resolved`;
    case "run_action_illegal":
      return `t${turn} cannot ${data.actionKind}: ${data.reason}`;
    case "run_floor_entered":
      return `t${turn} entered d${data.depth} ${data.band} (${data.rosterCost}/${data.spawnBudget})`;
    case "run_placement_deviation":
      return `t${turn} placement adjusted ${data.requestId}: ${data.reasons.join(", ")}`;
    case "run_boredom":
      return `t${turn} boredom wave ${data.wave} on d${data.depth}: ${formatBoredomReason(data.reason)}`;
    case "run_reinforcement_spawned":
      return `t${turn} reinforcement ${data.definitionId} at ${formatPos(data.position)} (${data.budgetRemaining} budget left)`;
    case "hoard_taken":
      return `t${turn} claimed ${data.name} at ${formatPos(data.position)}`;
    case "deep_narration":
      return `t${turn} Deep: ${data.text}`;
    case "moved":
      return `t${turn} ${data.actorId} moved ${data.direction} ${formatPos(data.from)}->${formatPos(data.to)}`;
    case "bumped_wall":
      return `t${turn} ${data.actorId} bumped ${data.direction}: ${data.reason}`;
    case "door_opened":
      return `t${turn} ${data.actorId} opened door ${formatPos(data.at)} (${data.direction})`;
    case "stepped_stairs":
      return `t${turn} ${data.actorId} stepped on ${data.stairs} ${formatPos(data.at)}`;
    case "attack_intent":
      return `t${turn} ${data.actorId} attacks ${data.targetId} (${data.direction})`;
    case "talk_intent":
      return `t${turn} ${data.actorId} talks to ${data.npcId} (${data.direction})`;
    case "attack_hit":
      return `t${turn} ${data.actorId} hit ${data.defenderId} for ${data.damage} (${data.defenderHpBefore}->${data.defenderHpAfter})`;
    case "attack_missed":
      return `t${turn} ${data.actorId} missed ${data.defenderId ?? "target"} (${data.reason})`;
    case "entity_died":
      return `t${turn} ${data.entityId} (${data.kind}) died at ${formatPos(data.position)} +${data.xpYield}xp`;
    case "xp_gained":
      return `t${turn} ${data.actorId} gained ${data.amount}xp from ${data.sourceEntityId} (total ${data.totalXp})`;
    case "status_applied":
      return `t${turn} ${data.status} applied to ${data.entityId} (${data.duration}t)`;
    case "status_refreshed":
      return `t${turn} ${data.status} refreshed on ${data.entityId} (${data.duration}t)`;
    case "status_expired":
      return `t${turn} ${data.status} expired on ${data.entityId}`;
    case "status_dropped_oldest":
      return `t${turn} ${data.status} dropped from ${data.entityId} (cap)`;
    case "status_tick":
      return `t${turn} ${data.status} tick on ${data.entityId} HP${data.hpDelta >= 0 ? "+" : ""}${data.hpDelta}`;
    case "level_up":
      return `t${turn} ${data.actorId} level ${data.levelBefore}->${data.levelAfter} HP ${data.maxHpBefore}/${data.currentHpBefore}->${data.maxHpAfter}/${data.currentHpAfter}`;
    case "starvation":
      return `t${turn} ${data.actorId} starved HP ${data.hpBefore}->${data.hpAfter} (fullness ${data.fullness})`;
    case "item_picked_up":
      return `t${turn} picked up ${data.definitionId} x${data.quantity}${data.stacked ? " (stacked)" : ""}`;
    case "item_dropped":
      return `t${turn} dropped ${data.definitionId} x${data.quantity} at ${formatPos(data.position)}`;
    case "item_equipped":
      return `t${turn} equipped ${data.definitionId} in ${formatEquipSlot(data.slot)}${data.swappedItemInstanceId === null ? "" : ` (swapped ${data.swappedItemInstanceId})`}`;
    case "item_unequipped":
      return `t${turn} unequipped ${data.definitionId} from ${formatEquipSlot(data.slot)} to slot ${data.inventorySlot}`;
    case "item_curse_announced":
      return `t${turn} curse revealed on ${data.definitionId} in ${formatEquipSlot(data.slot)}`;
    case "effect_executed":
      return `t${turn} effect ${data.verb} ${data.sourceId ?? "-"}->${data.targetId ?? "-"}`;
    case "effect_rejected":
      return `t${turn} effect ${data.verb} rejected (${data.code}): ${data.message}`;
    case "enemy_moved":
      return `t${turn} ${data.actorId} moved ${data.direction} ${formatPos(data.from)}->${formatPos(data.to)}`;
    case "enemy_waited":
      return `t${turn} ${data.actorId} waited`;
    case "enemy_ability_used":
      return `t${turn} ${data.actorId} used ability ${data.abilityIndex} on ${data.targetId ?? "-"} (cd ${data.cooldownTurns})`;
    case "thief_item_stolen":
      return `t${turn} ${data.actorId} stole ${data.definitionId} x${data.quantity}`;
    case "ambusher_revealed":
      return `t${turn} ambusher ${data.actorId} revealed`;
    case "mimic_revealed":
      return `t${turn} mimic ${data.actorId} revealed`;
    case "pack_hunter_engaged":
      return `t${turn} pack hunter ${data.actorId} engaged (${data.allyIds.length}/${data.threshold})`;
    case "item_triggered":
      return `t${turn} item ${data.definitionId} triggered (${data.trigger})${data.whiffed ? " whiff" : ""}`;
    case "item_identified":
      return `t${turn} identified ${data.definitionId} (${data.category})`;
    case "item_consumed":
      return `t${turn} consumed ${data.definitionId} x${data.quantityBefore}->${data.quantityAfter}`;
    case "item_charge_used":
      return `t${turn} used charge on ${data.definitionId} (${data.chargesBefore}->${data.chargesAfter})`;
    case "item_depleted":
      return `t${turn} depleted ${data.definitionId}`;
    case "item_proc_checked":
      return `t${turn} proc ${data.trigger} on ${data.definitionId} ${data.chancePercent}% -> ${data.triggered ? "yes" : "no"}`;
    case "item_proc_triggered":
      return `t${turn} proc ${data.trigger} fired on ${data.definitionId}`;
    case "trap_step_triggered":
      return `t${turn} trap ${data.definitionId} triggered by ${data.actorId}`;
    case "dialogue_opened":
      return `t${turn} dialogue with ${data.npcId} at ${data.nodeId}`;
    case "dialogue_choice_selected":
      return `t${turn} ${data.npcId} choice ${data.choiceId} at ${data.nodeId}`;
    case "dialogue_ended":
      return `t${turn} dialogue ended with ${data.npcId}`;
    case "dialogue_flag_set":
      return `t${turn} ${data.npcId} flag ${data.flag}`;
    case "barter_opened":
      return `t${turn} barter opened with ${data.npcId}`;
    case "quest_offer_hook":
      return `t${turn} quest hook ${data.questHookId} from ${data.npcId}`;
    case "quest_offered":
      return `t${turn} quest offered ${data.questId} from ${data.npcId}`;
    case "quest_accepted":
      return `t${turn} accepted quest ${data.questId}`;
    case "quest_refused":
      return `t${turn} refused quest ${data.questId}`;
    case "quest_completed":
      return `t${turn} completed quest ${data.questId}${data.rewardCoin === null ? "" : ` (+${data.rewardCoin} coin)`}`;
    case "quest_failed":
      return `t${turn} quest ${data.questId} failed: ${data.reason}`;
    case "quest_reward_paid":
      return `t${turn} quest reward ${data.questId} +${data.coin} coin${data.itemDefinitionIds.length === 0 ? "" : ` items:${data.itemDefinitionIds.join(",")}`}`;
    case "quest_reward_forfeited":
      return `t${turn} quest reward ${data.questId} forfeited ${data.coin} coin (${data.reason})`;
    case "quest_escort_moved":
      return "";
    case "quest_item_delivered":
      return `t${turn} delivered ${data.itemDefinitionId} for ${data.questId}`;
    case "barter_buy":
      return `t${turn} bought ${data.definitionId} for ${data.price} from ${data.npcId}`;
    case "barter_sell":
      return `t${turn} sold ${data.definitionId} for ${data.price} to ${data.npcId}`;
    case "action_illegal":
      return `t${turn} illegal ${data.actionKind}: ${data.reason}`;
    case "action_resolved":
      return `t${turn} resolved ${data.actionKind}`;
    case "actor_turn":
      return `t${turn} actor turn ${data.actorId}`;
    case "tick_hook":
      return `t${turn} tick ${data.hook}`;
    case "terminal_state":
      return `t${turn} ${data.status}: ${data.reason}`;
    case "resolver_probe":
      return `t${turn} resolver probe ${data.actionKind}: ${data.label}`;
    case "tick_registry_probe":
      return `t${turn} tick registry probe ${data.hook}: ${data.label}`;
    default:
      return assertNever(event);
  }
};

const formatPos = (position: Position): string =>
  `(${position.x},${position.y})`;

const formatEquipSlot = (
  slot:
    | { readonly kind: "weapon" }
    | { readonly kind: "armor" }
    | { readonly kind: "charm"; readonly index: number },
): string =>
  slot.kind === "charm" ? `charm[${slot.index}]` : slot.kind;

const formatBoredomReason = (
  reason: "reinforcement_spawned" | "budget_exhausted" | "no_legal_cell",
): string => {
  switch (reason) {
    case "reinforcement_spawned":
      return "reinforcements arrive";
    case "budget_exhausted":
      return "no budget remains";
    case "no_legal_cell":
      return "no room to enter";
  }
};

const assertNever = (value: never): never => {
  throw new Error(`unhandled log event: ${JSON.stringify(value)}`);
};

export const ALL_LOG_EVENT_TYPES = [
  "state_created",
  "state_serialized",
  "state_deserialized",
  "run_action_resolved",
  "run_action_illegal",
  "run_floor_entered",
  "run_placement_deviation",
  "run_boredom",
  "run_reinforcement_spawned",
  "hoard_taken",
  "deep_narration",
  "moved",
  "bumped_wall",
  "door_opened",
  "stepped_stairs",
  "attack_intent",
  "talk_intent",
  "attack_hit",
  "attack_missed",
  "entity_died",
  "xp_gained",
  "status_applied",
  "status_refreshed",
  "status_expired",
  "status_dropped_oldest",
  "status_tick",
  "level_up",
  "starvation",
  "item_picked_up",
  "item_dropped",
  "item_equipped",
  "item_unequipped",
  "item_curse_announced",
  "effect_executed",
  "effect_rejected",
  "enemy_moved",
  "enemy_waited",
  "enemy_ability_used",
  "thief_item_stolen",
  "ambusher_revealed",
  "mimic_revealed",
  "pack_hunter_engaged",
  "item_triggered",
  "item_identified",
  "item_consumed",
  "item_charge_used",
  "item_depleted",
  "item_proc_checked",
  "item_proc_triggered",
  "trap_step_triggered",
  "dialogue_opened",
  "dialogue_choice_selected",
  "dialogue_ended",
  "dialogue_flag_set",
  "barter_opened",
  "quest_offer_hook",
  "quest_offered",
  "quest_accepted",
  "quest_refused",
  "quest_completed",
  "quest_failed",
  "quest_reward_paid",
  "quest_reward_forfeited",
  "quest_escort_moved",
  "quest_item_delivered",
  "barter_buy",
  "barter_sell",
  "action_illegal",
  "action_resolved",
  "actor_turn",
  "tick_hook",
  "terminal_state",
  "resolver_probe",
  "tick_registry_probe",
] as const satisfies readonly EngineLogEventType[];

export const SILENT_LOG_EVENT_TYPES = ["quest_escort_moved"] as const satisfies readonly EngineLogEventType[];

export const dummyLogEvent = (
  type: EngineLogEventType,
  turn = 0,
): EngineLogEvent => {
  const data = dummyEventData(type);

  return {
    turn,
    type,
    data,
  } as EngineLogEvent;
};

const dummyEventData = (
  type: EngineLogEventType,
): EngineLogEvent["data"] => {
  switch (type) {
    case "state_created":
      return {
        runId: "run#dummy",
        seed: "dummy",
        depth: 1,
        band: "shallows",
      };
    case "state_serialized":
      return { format: "stable-json" };
    case "state_deserialized":
      return { format: "stable-json" };
    case "run_action_resolved":
      return {
        actionKind: "take_hoard",
      };
    case "run_action_illegal":
      return {
        actionKind: "take_hoard",
        reason: "not here",
      };
    case "run_floor_entered":
      return {
        floorId: "floor#1",
        depth: 1,
        band: "shallows",
        seed: "dummy-floor",
        rosterCost: 3,
        spawnBudget: 20,
        placementDeviationCount: 0,
        hoardFeatureId: null,
      };
    case "run_placement_deviation":
      return {
        requestId: "enemy:0:rat",
        reasons: ["preferred cell occupied"],
      };
    case "run_boredom":
      return {
        depth: 1,
        floorTurn: 900,
        wave: 1,
        budgetRemaining: 8,
        reason: "reinforcement_spawned",
      };
    case "run_reinforcement_spawned":
      return {
        entityId: "enemy#1",
        definitionId: "oldstock-cellar-rat",
        depth: 1,
        position: { x: 2, y: 3 },
        cost: 2,
        budgetRemaining: 6,
        wave: 1,
      };
    case "hoard_taken":
      return {
        featureId: "hoard",
        name: "The Hoard",
        depth: 12,
        position: { x: 5, y: 5 },
      };
    case "deep_narration":
      return {
        depth: 1,
        beatId: "floor-intro",
        beatKind: "floor_intro",
        triggerTag: null,
        text: "You hear the Deep breathe.",
      };
    case "moved":
      return {
        actorId: "player",
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
        direction: "east",
      };
    case "bumped_wall":
      return {
        actorId: "player",
        at: { x: 1, y: 0 },
        direction: "east",
        reason: "wall",
      };
    case "door_opened":
      return {
        actorId: "player",
        at: { x: 1, y: 0 },
        direction: "east",
      };
    case "stepped_stairs":
      return {
        actorId: "player",
        at: { x: 1, y: 0 },
        direction: "east",
        stairs: "stairs_down",
      };
    case "attack_intent":
      return {
        actorId: "player",
        targetId: "enemy#1",
        direction: "east",
      };
    case "talk_intent":
      return {
        actorId: "player",
        npcId: "npc#1",
        direction: "east",
      };
    case "attack_hit":
      return {
        actorId: "player",
        defenderId: "enemy#1",
        attackerAttack: 5,
        defenderDefense: 2,
        baseDamage: 4,
        damage: 3,
        hitRoll: 50,
        hitChancePercent: 75,
        varianceMultiplier: 1,
        defenderHpBefore: 10,
        defenderHpAfter: 7,
      };
    case "attack_missed":
      return {
        actorId: "player",
        defenderId: "enemy#1",
        attackerAttack: 5,
        defenderDefense: 2,
        hitRoll: 99,
        hitChancePercent: 75,
        reason: "hit_roll",
      };
    case "entity_died":
      return {
        entityId: "enemy#1",
        kind: "enemy",
        position: { x: 1, y: 0 },
        xpYield: 5,
      };
    case "xp_gained":
      return {
        actorId: "player",
        sourceEntityId: "enemy#1",
        amount: 5,
        totalXp: 5,
      };
    case "status_applied":
      return {
        entityId: "player",
        status: "poison",
        duration: 3,
      };
    case "status_refreshed":
      return {
        entityId: "player",
        status: "poison",
        duration: 5,
      };
    case "status_expired":
      return {
        entityId: "player",
        status: "poison",
      };
    case "status_dropped_oldest":
      return {
        entityId: "player",
        status: "poison",
      };
    case "status_tick":
      return {
        entityId: "player",
        status: "poison",
        hpDelta: -1,
      };
    case "level_up":
      return {
        actorId: "player",
        levelBefore: 1,
        levelAfter: 2,
        xpBefore: 0,
        xpAfter: 0,
        xpToNextLevel: 10,
        maxHpBefore: 20,
        maxHpAfter: 24,
        currentHpBefore: 18,
        currentHpAfter: 24,
        hud: { pulse: true, fields: ["level", "hp"] },
      };
    case "starvation":
      return {
        actorId: "player",
        hpBefore: 10,
        hpAfter: 9,
        fullness: 0,
        hud: { pulse: true, fields: ["hp", "fullness"] },
      };
    case "item_picked_up":
      return {
        itemInstanceId: "item#1",
        entityId: "item#1",
        definitionId: "draught-1",
        quantity: 1,
        stacked: false,
      };
    case "item_dropped":
      return {
        itemInstanceId: "item#1",
        entityId: "item#1",
        definitionId: "draught-1",
        quantity: 1,
        position: { x: 1, y: 0 },
      };
    case "item_equipped":
      return {
        itemInstanceId: "item#1",
        definitionId: "weapon-1",
        slot: { kind: "weapon" },
        swappedItemInstanceId: null,
      };
    case "item_unequipped":
      return {
        itemInstanceId: "item#1",
        definitionId: "weapon-1",
        slot: { kind: "weapon" },
        inventorySlot: 0,
      };
    case "item_curse_announced":
      return {
        itemInstanceId: "item#1",
        definitionId: "weapon-1",
        slot: { kind: "weapon" },
      };
    case "effect_executed":
      return {
        verb: "damage",
        sourceId: "player",
        targetId: "enemy#1",
        origin: { x: 0, y: 0 },
        details: {},
      };
    case "effect_rejected":
      return {
        verb: "damage",
        effectIndex: 0,
        code: "invalid_target",
        message: "no target",
        sourceId: "player",
        targetId: null,
        origin: null,
      };
    case "enemy_moved":
      return {
        actorId: "enemy#1",
        from: { x: 2, y: 0 },
        to: { x: 1, y: 0 },
        direction: "west",
      };
    case "enemy_waited":
      return {
        actorId: "enemy#1",
      };
    case "enemy_ability_used":
      return {
        actorId: "enemy#1",
        abilityIndex: 0,
        targetId: "player",
        cooldownTurns: 3,
      };
    case "thief_item_stolen":
      return {
        actorId: "enemy#1",
        itemInstanceId: "item#1",
        definitionId: "food-1",
        quantity: 1,
      };
    case "ambusher_revealed":
      return {
        actorId: "enemy#1",
      };
    case "mimic_revealed":
      return {
        actorId: "enemy#1",
      };
    case "pack_hunter_engaged":
      return {
        actorId: "enemy#1",
        allyIds: ["enemy#2"],
        threshold: 2,
      };
    case "item_triggered":
      return {
        itemInstanceId: "item#1",
        definitionId: "draught-1",
        trigger: "quaff",
        targetIds: ["player"],
        cells: [],
        whiffed: false,
      };
    case "item_identified":
      return {
        itemInstanceId: "item#1",
        definitionId: "draught-1",
        category: "draught",
      };
    case "item_consumed":
      return {
        itemInstanceId: "item#1",
        definitionId: "draught-1",
        quantityBefore: 2,
        quantityAfter: 1,
      };
    case "item_charge_used":
      return {
        itemInstanceId: "item#1",
        definitionId: "tool-1",
        chargesBefore: 3,
        chargesAfter: 2,
      };
    case "item_depleted":
      return {
        itemInstanceId: "item#1",
        definitionId: "tool-1",
      };
    case "item_proc_checked":
      return {
        itemInstanceId: "item#1",
        definitionId: "weapon-1",
        trigger: "on_hit",
        chancePercent: 10,
        triggered: false,
      };
    case "item_proc_triggered":
      return {
        itemInstanceId: "item#1",
        definitionId: "weapon-1",
        trigger: "on_hit",
        targetIds: ["enemy#1"],
      };
    case "trap_step_triggered":
      return {
        trapId: "trap#1",
        definitionId: "trap-1",
        actorId: "player",
      };
    case "dialogue_opened":
      return {
        npcId: "npc#1",
        nodeId: "start",
      };
    case "dialogue_choice_selected":
      return {
        npcId: "npc#1",
        choiceId: "yes",
        nodeId: "start",
      };
    case "dialogue_ended":
      return {
        npcId: "npc#1",
      };
    case "dialogue_flag_set":
      return {
        npcId: "npc#1",
        flag: "met",
      };
    case "barter_opened":
      return {
        npcId: "npc#1",
      };
    case "quest_offer_hook":
      return {
        npcId: "npc#1",
        questHookId: "quest-1",
      };
    case "quest_offered":
      return {
        questId: "quest-1",
        npcId: "npc#1",
      };
    case "quest_accepted":
      return {
        questId: "quest-1",
        npcId: "npc#1",
      };
    case "quest_refused":
      return {
        questId: "quest-1",
        npcId: "npc#1",
      };
    case "quest_completed":
      return {
        questId: "quest-1",
        rewardCoin: 10,
      };
    case "quest_failed":
      return {
        questId: "quest-1",
        reason: "timeout",
      };
    case "quest_reward_paid":
      return {
        questId: "quest-1",
        coin: 10,
        itemDefinitionIds: ["draught-1"],
        identifyDefinitionIds: [],
      };
    case "quest_reward_forfeited":
      return {
        questId: "quest-1",
        coin: 10,
        reason: "inventory_full",
      };
    case "quest_escort_moved":
      return {
        questId: "quest-1",
        npcId: "npc#1",
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
        direction: "east",
      };
    case "quest_item_delivered":
      return {
        questId: "quest-1",
        npcId: "npc#1",
        itemDefinitionId: "draught-1",
      };
    case "barter_buy":
      return {
        npcId: "npc#1",
        definitionId: "draught-1",
        price: 10,
        itemInstanceId: "item#1",
      };
    case "barter_sell":
      return {
        npcId: "npc#1",
        definitionId: "draught-1",
        price: 5,
        itemInstanceId: "item#1",
      };
    case "action_illegal":
      return {
        actionKind: "move",
        reason: "blocked",
      };
    case "action_resolved":
      return {
        actionKind: "wait",
      };
    case "actor_turn":
      return {
        actorId: "enemy#1",
      };
    case "tick_hook":
      return {
        hook: "hunger",
      };
    case "terminal_state":
      return {
        status: "WIN",
        reason: "stairs",
      };
    case "resolver_probe":
      return {
        actionKind: "wait",
        label: "probe",
      };
    case "tick_registry_probe":
      return {
        hook: "hunger",
        label: "probe",
      };
    default:
      return assertNever(type);
  }
};
