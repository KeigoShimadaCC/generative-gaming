import { itemCardKnowledge } from "@engine/items";
import {
  buildQuestLog,
} from "@engine/quests";
import {
  countPlayerCoinValue,
  merchantBuyPrice,
  merchantSellPrice,
  isBarterOpen,
} from "@engine/npc";
import type { GridOverlayMarker } from "@/components/grid/model";
import {
  checkActionLegality,
  MOVE_DIRECTIONS,
  type MoveDirection,
  type PlayerAction,
} from "@engine/turn";
import type {
  EntityId,
  EntityInstance,
  GameState,
  PlayerItemStack,
  Position,
  QuestRuntime,
} from "@engine/state";
import type { TurnEvent } from "@engine/turn";
import type { RunAction } from "@engine/run";
import {
  dropItem,
  equipItem,
  findEmptyInventorySlotIndex,
  unequipItem,
  type EquipTarget,
  type InventoryOperationResult,
} from "@engine/systems";
import { getCurrentDialogueNode } from "@engine/npc";

type ItemDefinition = PlayerItemStack["definition"];
type EffectBundle = NonNullable<ReturnType<typeof itemCardKnowledge>["knownEffects"]>;

export type DetailLine = {
  readonly label: string;
  readonly value: string;
};

export type InspectCard = {
  readonly id: string;
  readonly glyph: string;
  readonly title: string;
  readonly descriptor: string;
  readonly position: Position;
  readonly lines: readonly DetailLine[];
  readonly unknown: readonly string[];
  readonly witnessedFacts: readonly string[];
};

export type InventoryEntry = {
  readonly id: string;
  readonly kind: "slot" | "equipment";
  readonly index: number;
  readonly stack: PlayerItemStack | null;
  readonly equipmentTarget: EquipTarget | null;
  readonly label: string;
  readonly empty: boolean;
};

export type InventoryActionId =
  | "use"
  | "quaff"
  | "read"
  | "throw"
  | "equip"
  | "unequip"
  | "drop";

export type InventoryActionView = {
  readonly id: InventoryActionId;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason: string | null;
};

export type InventoryView = {
  readonly slots: readonly InventoryEntry[];
  readonly equipment: readonly InventoryEntry[];
};

export type DialogueOption =
  | {
      readonly kind: "reply";
      readonly id: string;
      readonly label: string;
    }
  | {
      readonly kind: "buy";
      readonly definitionId: string;
      readonly label: string;
      readonly price: number | null;
      readonly disabledReason: string | null;
    }
  | {
      readonly kind: "sell";
      readonly itemInstanceId: string;
      readonly label: string;
      readonly price: number | null;
      readonly disabledReason: string | null;
    }
  | {
      readonly kind: "exit";
      readonly label: string;
    };

export type DialogueView = {
  readonly npcId: EntityId;
  readonly npcName: string;
  readonly glyph: string;
  readonly text: string;
  readonly paused: true;
  readonly barterOpen: boolean;
  readonly coin: number;
  readonly options: readonly DialogueOption[];
};

export type QuestMarker = GridOverlayMarker & {
  readonly questId: string;
};

export type QuestView = ReturnType<typeof buildQuestLog> & {
  readonly markers: readonly QuestMarker[];
};

export type BarterCatalogView = {
  readonly resolve: (definitionId: string) => ItemDefinition | null;
  readonly coinDefinition: ItemDefinition | null;
};

const INPUT_ACTION_KIND: PlayerAction["kind"] = "talk";

export const appendEventsToState = (
  state: GameState,
  events: readonly TurnEvent[],
): GameState => ({
  ...state,
  log: [...state.log, ...(events as readonly GameState["log"][number][])],
});

export const appendPanelRefusal = (
  state: GameState,
  reason: string,
): GameState =>
  appendEventsToState(state, [
    {
      turn: state.run.turn,
      type: "action_illegal",
      data: {
        actionKind: INPUT_ACTION_KIND,
        reason,
      },
    } as GameState["log"][number],
  ] as readonly TurnEvent[]);

export const createInspectCard = (
  state: GameState,
  position: Position,
): InspectCard => {
  const entity = entityAtPosition(state, position);

  if (entity !== null) {
    return entityInspectCard(state, entity);
  }

  if (samePosition(state.player.position, position)) {
    return {
      id: "player",
      glyph: "@",
      title: "You",
      descriptor: "Delver",
      position,
      lines: [
        { label: "HP", value: `${state.player.hp.current}/${state.player.hp.max}` },
        { label: "Level", value: String(state.player.level) },
        { label: "XP", value: String(state.player.xp) },
      ],
      unknown: [],
      witnessedFacts: [],
    };
  }

  return {
    id: `cell:${position.x}:${position.y}`,
    glyph: ".",
    title: "Known floor",
    descriptor: "No entity here.",
    position,
    lines: [{ label: "Cell", value: `${position.x},${position.y}` }],
    unknown: [],
    witnessedFacts: [],
  };
};

export const createInventoryView = (state: GameState): InventoryView => ({
  slots: Array.from({ length: 16 }, (_, index) => {
    const stack = state.player.inventory[index] ?? null;

    return {
      id: `slot:${index}`,
      kind: "slot",
      index,
      stack,
      equipmentTarget: null,
      label:
        stack === null
          ? "empty"
          : stackLabel(state, stack, stack.quantity > 1),
      empty: stack === null,
    };
  }),
  equipment: [
    equipmentEntry("weapon", 0, state.player.equipment.weapon, { kind: "weapon" }),
    equipmentEntry("armor", 1, state.player.equipment.armor, { kind: "armor" }),
    ...state.player.equipment.charms.map((stack, index) =>
      equipmentEntry(`charm ${index + 1}`, index + 2, stack, {
        kind: "charm",
        index,
      }),
    ),
  ],
});

export const createItemStackInspectCard = (
  state: GameState,
  stack: PlayerItemStack,
): InspectCard => {
  const knowledge = itemCardKnowledge(state, stack.definition, {
    itemInstanceId: stack.itemInstanceId,
    identified: stack.identified,
  });

  return {
    id: stack.itemInstanceId,
    glyph: stack.definition.glyph,
    title: knowledge.displayName,
    descriptor: `${knowledge.category} in pack`,
    position: state.player.position,
    lines: [
      { label: "Stack", value: String(stack.quantity) },
      { label: "Category", value: knowledge.category },
      ...(knowledge.effectsKnown
        ? [{ label: "Effect", value: effectSummary(knowledge.knownEffects) }]
        : []),
      ...(knowledge.bonusKnown && knowledge.knownBonus !== null
        ? [{ label: "Bonus", value: signed(knowledge.knownBonus) }]
        : []),
    ],
    unknown: unknownLines(knowledge.unknown),
    witnessedFacts: [],
  };
};

export const inventoryActionsFor = (
  state: GameState,
  entry: InventoryEntry | null,
): readonly InventoryActionView[] => {
  if (entry === null || entry.stack === null) {
    return [];
  }

  if (entry.kind === "equipment" && entry.equipmentTarget !== null) {
    const unequip = unequipItem(state, entry.equipmentTarget);

    return [
      actionView("unequip", "Unequip", unequip),
      {
        id: "drop",
        label: "Drop",
        enabled: false,
        reason: "Unequip before dropping.",
      },
    ];
  }

  const stack = entry.stack;
  const directUse = directUseActionFor(stack.definition.kind);
  const actions: InventoryActionView[] = [];

  if (directUse !== null) {
    const legality = checkActionLegality(state, {
      kind: "use_item",
      itemId: stack.itemInstanceId,
    });
    actions.push({
      id: directUse.id,
      label: directUse.label,
      enabled: legality.status === "legal" && directUse.enabled,
      reason:
        legality.status === "illegal"
          ? legality.reason
          : directUse.reason,
    });
  }

  if (isEquippable(stack.definition)) {
    actions.push(actionView("equip", "Equip", equipItem(state, stack.itemInstanceId)));
  }

  actions.push(actionView("drop", "Drop", dropItem(state, stack.itemInstanceId, 1)));

  return actions;
};

export const executeInventoryOperation = (
  state: GameState,
  action: InventoryActionView,
  entry: InventoryEntry,
): InventoryOperationResult | RunAction | "throw_prompt" => {
  if (entry.stack === null) {
    return { illegal: true, reason: "No item is selected." };
  }

  if (!action.enabled) {
    return {
      illegal: true,
      reason: action.reason ?? "That action is not available.",
    };
  }

  switch (action.id) {
    case "use":
    case "quaff":
    case "read":
      return { kind: "use_item", itemId: entry.stack.itemInstanceId };
    case "throw":
      return "throw_prompt";
    case "equip":
      return { kind: "use_item", itemId: entry.stack.itemInstanceId };
    case "unequip":
      return entry.equipmentTarget === null
        ? { illegal: true, reason: "No equipment slot is selected." }
        : unequipItem(state, entry.equipmentTarget);
    case "drop":
      return dropItem(state, entry.stack.itemInstanceId, 1);
  }
};

export const createDialogueView = (state: GameState): DialogueView | null => {
  const current = getCurrentDialogueNode(state);
  if (current === null) {
    return null;
  }

  const catalog = createBarterCatalog(state);
  const barterOpen = isBarterOpen(state);
  const options: DialogueOption[] = current.node.choices.map((choice) => ({
    kind: "reply",
    id: choice.id,
    label: choice.label,
  }));

  if (barterOpen) {
    for (const definitionId of merchantStockIds(current.npc)) {
      const definition = catalog.resolve(definitionId);
      const price =
        definition === null
          ? null
          : merchantSellPrice(
              state,
              current.npc.id,
              definitionId,
              definition.value.coin,
            );
      options.push({
        kind: "buy",
        definitionId,
        label: definition === null ? definitionId : definition.name,
        price,
        disabledReason: definition === null ? "Merchant stock is unresolved." : null,
      });
    }

    for (const slot of state.player.inventory) {
      if (slot === null || slot.definition.kind === "coin") {
        continue;
      }

      options.push({
        kind: "sell",
        itemInstanceId: slot.itemInstanceId,
        label: stackLabel(state, slot, slot.quantity > 1),
        price: merchantBuyPrice(slot.definition.value.coin),
        disabledReason:
          catalog.coinDefinition === null ? "No coin definition available." : null,
      });
    }
  }

  options.push({ kind: "exit", label: "Leave" });

  return {
    npcId: current.npc.id,
    npcName: current.npc.definition.name,
    glyph: current.npc.definition.glyph,
    text: current.node.text,
    paused: true,
    barterOpen,
    coin: countPlayerCoinValue(state),
    options,
  };
};

export const createBarterCatalog = (state: GameState): BarterCatalogView => {
  const definitions = new Map<string, ItemDefinition>();
  let coinDefinition: ItemDefinition | null = null;

  const addDefinition = (definition: ItemDefinition): void => {
    definitions.set(definition.id, definition);
    if (definition.kind === "coin") {
      coinDefinition = definition;
    }
  };

  for (const slot of state.player.inventory) {
    if (slot !== null) {
      addDefinition(slot.definition);
    }
  }

  for (const stack of equippedStacks(state)) {
    addDefinition(stack.definition);
  }

  for (const entity of Object.values(state.entities)) {
    if (entity.kind === "item") {
      addDefinition(entity.definition);
    }
  }

  return {
    resolve: (definitionId) => definitions.get(definitionId) ?? null,
    coinDefinition,
  };
};

export const createQuestView = (state: GameState): QuestView => ({
  ...buildQuestLog(state),
  markers: questMarkersForState(state),
});

export const questMarkersForState = (state: GameState): readonly QuestMarker[] => {
  const markers: QuestMarker[] = [];

  for (const questId of state.quests.activeQuestIds) {
    const runtime = state.quests.quests[questId];
    if (runtime === undefined) {
      continue;
    }

    markers.push(...markersForQuest(state, runtime));
  }

  return markers.sort((left, right) => left.id.localeCompare(right.id));
};

export const directionForKey = (key: string): MoveDirection | null => {
  switch (key) {
    case "ArrowUp":
      return "north";
    case "ArrowDown":
      return "south";
    case "ArrowLeft":
      return "west";
    case "ArrowRight":
      return "east";
    default:
      return null;
  }
};

export const clampIndex = (index: number, length: number): number => {
  if (length <= 0) {
    return 0;
  }

  return ((index % length) + length) % length;
};

export const menuNumber = (key: string): number | null => {
  if (!/^[1-9]$/u.test(key)) {
    return null;
  }

  return Number.parseInt(key, 10) - 1;
};

export const isPanelModeToggleKey = (key: string): boolean =>
  key === "i" ||
  key === "I" ||
  key === "q" ||
  key === "Q" ||
  key === "x" ||
  key === "X" ||
  key === "?" ||
  key === "Tab";

const entityInspectCard = (
  state: GameState,
  entity: EntityInstance,
): InspectCard => {
  switch (entity.kind) {
    case "item": {
      const knowledge = itemCardKnowledge(state, entity.definition, {
        itemInstanceId: entity.id,
        identified: entity.identified,
      });
      return {
        id: entity.id,
        glyph: entity.definition.glyph,
        title: knowledge.displayName,
        descriptor: `${knowledge.category} on the floor`,
        position: entity.position,
        lines: [
          { label: "Stack", value: String(entity.quantity) },
          { label: "Category", value: knowledge.category },
          ...(knowledge.effectsKnown
            ? [{ label: "Effect", value: effectSummary(knowledge.knownEffects) }]
            : []),
          ...(knowledge.bonusKnown && knowledge.knownBonus !== null
            ? [{ label: "Bonus", value: signed(knowledge.knownBonus) }]
            : []),
        ],
        unknown: unknownLines(knowledge.unknown),
        witnessedFacts: [],
      };
    }
    case "enemy":
      return {
        id: entity.id,
        glyph: entity.definition.glyph,
        title: entity.definition.name,
        descriptor: `Enemy from ${entity.definition.origin}`,
        position: entity.position,
        lines: [
          { label: "HP", value: `${entity.currentHP}/${entity.definition.stats.hp}` },
          { label: "Band", value: entity.definition.stats.band },
          { label: "XP", value: String(entity.definition.stats.xpYield) },
        ],
        unknown: [],
        witnessedFacts: enemyWitnessedFacts(state, entity.id),
      };
    case "npc":
      return {
        id: entity.id,
        glyph: entity.definition.glyph,
        title: entity.definition.name,
        descriptor: "NPC with finite dialogue",
        position: entity.position,
        lines: [
          { label: "Replies", value: String(rootReplyCount(entity)) },
          { label: "Merchant stock", value: String(entity.definition.merchantInventoryItemIds.length) },
        ],
        unknown: [],
        witnessedFacts: [],
      };
    case "trap":
      return {
        id: entity.id,
        glyph: "^",
        title: entity.definition.name,
        descriptor: entity.armed ? "Armed trap" : "Disarmed trap",
        position: entity.position,
        lines: [{ label: "State", value: entity.armed ? "armed" : "spent" }],
        unknown: [],
        witnessedFacts: [],
      };
  }
};

const unknownLines = (unknown: readonly string[]): readonly string[] =>
  unknown.map((field) =>
    field === "effects"
      ? "unidentified: effect unknown"
      : `unidentified: ${field} unknown`,
  );

const enemyWitnessedFacts = (
  state: GameState,
  enemyId: EntityId,
): readonly string[] => {
  let minHit: number | null = null;
  let maxHit: number | null = null;
  let wasHit = false;
  let fled = false;

  for (const event of state.log) {
    if (
      event.type === "attack_hit" &&
      event.data.actorId === enemyId &&
      event.data.defenderId === "player"
    ) {
      minHit = Math.min(minHit ?? event.data.damage, event.data.damage);
      maxHit = Math.max(maxHit ?? event.data.damage, event.data.damage);
    }

    if (event.type === "attack_hit" && event.data.defenderId === enemyId) {
      wasHit = true;
    }

    if (event.type === "enemy_moved" && event.data.actorId === enemyId) {
      fled = true;
    }
  }

  return [
    ...(minHit === null || maxHit === null
      ? []
      : [`witnessed: hits for ${minHit}-${maxHit}`]),
    ...(wasHit ? ["witnessed: can be struck"] : []),
    ...(fled ? ["witnessed: moved after contact"] : []),
  ];
};

const entityAtPosition = (
  state: GameState,
  position: Position,
): EntityInstance | null => {
  const entities = Object.values(state.entities)
    .filter((entity) => samePosition(entity.position, position))
    .sort(compareEntitiesForCard);

  return entities[0] ?? null;
};

const compareEntitiesForCard = (
  left: EntityInstance,
  right: EntityInstance,
): number => entityPriority(left.kind) - entityPriority(right.kind) || left.id.localeCompare(right.id);

const entityPriority = (kind: EntityInstance["kind"]): number => {
  switch (kind) {
    case "enemy":
      return 0;
    case "npc":
      return 1;
    case "item":
      return 2;
    case "trap":
      return 3;
  }
};

const equipmentEntry = (
  name: string,
  index: number,
  stack: PlayerItemStack | null,
  target: EquipTarget,
): InventoryEntry => ({
  id: `equipment:${name}`,
  kind: "equipment",
  index,
  stack,
  equipmentTarget: target,
  label: stack === null ? `${name}: empty` : `${name}: ${stack.definition.name}`,
  empty: stack === null,
});

const actionView = (
  id: InventoryActionId,
  label: string,
  result: InventoryOperationResult,
): InventoryActionView =>
  "illegal" in result
    ? {
        id,
        label,
        enabled: false,
        reason: result.reason,
      }
    : {
        id,
        label,
        enabled: true,
        reason: null,
      };

const directUseActionFor = (
  kind: ItemDefinition["kind"],
): InventoryActionView | null => {
  switch (kind) {
    case "draught":
      return enabledAction("quaff", "Quaff");
    case "note":
      return enabledAction("read", "Read");
    case "throwable":
      return enabledAction("throw", "Throw");
    case "food":
    case "tool":
      return enabledAction("use", "Use");
    case "coin":
    case "key_item":
      return {
        id: "use",
        label: "Use",
        enabled: false,
        reason: `${kind} items cannot be used directly`,
      };
    case "weapon":
    case "armor":
    case "charm":
      return null;
  }
};

const enabledAction = (
  id: InventoryActionId,
  label: string,
): InventoryActionView => ({
  id,
  label,
  enabled: true,
  reason: null,
});

const isEquippable = (definition: ItemDefinition): boolean =>
  definition.kind === "weapon" ||
  definition.kind === "armor" ||
  definition.kind === "charm";

const stackLabel = (
  state: GameState,
  stack: PlayerItemStack,
  includeQuantity: boolean,
): string => {
  const knowledge = itemCardKnowledge(state, stack.definition, {
    itemInstanceId: stack.itemInstanceId,
    identified: stack.identified,
  });
  const name = knowledge.displayName;

  return includeQuantity ? `${name} x${stack.quantity}` : name;
};

const equippedStacks = (state: GameState): readonly PlayerItemStack[] => [
  state.player.equipment.weapon,
  state.player.equipment.armor,
  ...state.player.equipment.charms,
].filter((stack): stack is PlayerItemStack => stack !== null);

const merchantStockIds = (
  npc: Extract<EntityInstance, { readonly kind: "npc" }>,
): readonly string[] => {
  const runtimeStock = npc.dialogueRuntime.merchantStockIds;

  return Array.isArray(runtimeStock)
    ? runtimeStock.filter((id): id is string => typeof id === "string")
    : npc.definition.merchantInventoryItemIds;
};

const markersForQuest = (
  state: GameState,
  runtime: QuestRuntime,
): readonly QuestMarker[] => {
  const objective = runtime.definition.objective;
  const questId = runtime.definition.id;

  switch (objective.kind) {
    case "fetch":
      return objective.fetch === null
        ? []
        : itemMarkers(state, questId, objective.fetch.itemId);
    case "kill":
      return objective.kill === null
        ? []
        : enemyMarkers(state, questId, objective.kill.targetTag);
    case "reach":
      return objective.reach === null
        ? []
        : featureMarkers(state, questId, objective.reach.featureId);
    case "deliver":
      return objective.deliver === null
        ? []
        : npcMarkers(state, questId, objective.deliver.npcId);
    case "escort": {
      const progress = runtime.progress as {
        readonly escortWardEntityId?: EntityId;
      };
      const wardId = progress.escortWardEntityId ?? objective.escort?.npcId ?? null;
      return wardId === null ? [] : npcMarkers(state, questId, wardId);
    }
    case "constraint":
      return [];
  }
};

const itemMarkers = (
  state: GameState,
  questId: string,
  itemDefinitionId: string,
): readonly QuestMarker[] =>
  Object.values(state.entities)
    .filter(
      (entity) =>
        entity.kind === "item" && entity.definition.id === itemDefinitionId,
    )
    .map((entity) => marker(questId, entity.id, entity.position, "Quest item"));

const enemyMarkers = (
  state: GameState,
  questId: string,
  targetTag: string,
): readonly QuestMarker[] =>
  Object.values(state.entities)
    .filter((entity) => {
      if (entity.kind !== "enemy") {
        return false;
      }

      return (
        entity.definition.id === targetTag ||
        entity.behaviorRuntime.questTargetTag === targetTag
      );
    })
    .map((entity) => marker(questId, entity.id, entity.position, "Quest target"));

const npcMarkers = (
  state: GameState,
  questId: string,
  npcReference: string,
): readonly QuestMarker[] =>
  Object.values(state.entities)
    .filter(
      (entity) =>
        entity.kind === "npc" &&
        (entity.id === npcReference || entity.definition.id === npcReference),
    )
    .map((entity) => marker(questId, entity.id, entity.position, "Quest NPC"));

const featureMarkers = (
  state: GameState,
  questId: string,
  featureId: string,
): readonly QuestMarker[] => {
  const opaque = state.floor.geometry.opaque as {
    readonly knowledge?: {
      readonly decorativeFeatures?: readonly {
        readonly id?: unknown;
        readonly x?: unknown;
        readonly y?: unknown;
      }[];
    };
  } | null;
  const features = opaque?.knowledge?.decorativeFeatures ?? [];

  return features.flatMap((feature) => {
    if (
      feature.id !== featureId ||
      typeof feature.x !== "number" ||
      typeof feature.y !== "number"
    ) {
      return [];
    }

    return [
      marker(
        questId,
        String(feature.id),
        { x: feature.x, y: feature.y },
        "Quest landmark",
      ),
    ];
  });
};

const marker = (
  questId: string,
  targetId: string,
  position: Position,
  label: string,
): QuestMarker => ({
  id: `${questId}:${targetId}`,
  questId,
  x: position.x,
  y: position.y,
  label,
  tone: "quest",
});

const rootReplyCount = (
  entity: Extract<EntityInstance, { readonly kind: "npc" }>,
): number =>
  entity.definition.dialogue.nodes.find(
    (node) => node.id === entity.definition.dialogue.rootNodeId,
  )?.choices.length ?? 0;

const effectSummary = (bundle: EffectBundle | null): string =>
  bundle === null
    ? "none"
    : bundle.effects.map((effect) => effect.kind).join(", ");

const signed = (value: number): string => (value >= 0 ? `+${value}` : String(value));

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;

export const movePosition = (
  position: Position,
  direction: MoveDirection,
  bounds: { readonly width: number; readonly height: number },
): Position => {
  const offset = MOVE_DIRECTIONS.find(
    (entry) => entry.direction === direction,
  )?.offset;

  if (offset === undefined) {
    return position;
  }

  return {
    x: Math.min(bounds.width - 1, Math.max(0, position.x + offset.x)),
    y: Math.min(bounds.height - 1, Math.max(0, position.y + offset.y)),
  };
};

export const gridBounds = (
  state: GameState | null,
): { readonly width: number; readonly height: number } => {
  const opaque = state?.floor.geometry.opaque as {
    readonly width?: unknown;
    readonly height?: unknown;
  } | null | undefined;

  return {
    width: typeof opaque?.width === "number" ? opaque.width : 1,
    height: typeof opaque?.height === "number" ? opaque.height : 1,
  };
};

export const firstEnabledActionIndex = (
  actions: readonly InventoryActionView[],
): number => Math.max(0, actions.findIndex((action) => action.enabled));

export const selectedInventoryEntry = (
  view: InventoryView,
  index: number,
): InventoryEntry | null => {
  const entries = [...view.slots, ...view.equipment];

  return entries[clampIndex(index, entries.length)] ?? null;
};

export const inventoryEntryCount = (view: InventoryView): number =>
  view.slots.length + view.equipment.length;

export const hasEmptyInventorySlot = (state: GameState): boolean =>
  findEmptyInventorySlotIndex(state.player.inventory) !== null;
