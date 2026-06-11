import type {
  ItemCategory,
  ItemDefinition,
} from "../../schemas/entities/index.js";
import type { EffectBundle } from "../../schemas/vocab/index.js";
import { createRng } from "../rng/index.js";
import type {
  GameState,
  GroundItemEntityInstance,
  InventorySlot,
  PlayerItemStack,
} from "../state/index.js";

export type UnidentifiedItemCategory = "draught" | "note" | "charm";

export type ItemCardUnknownField = "name" | "effects" | "bonus";

export type ItemCardKnowledge = {
  readonly itemInstanceId: string | null;
  readonly definitionId: string;
  readonly category: ItemCategory;
  readonly displayName: string;
  readonly appearance: string | null;
  readonly knownName: string | null;
  readonly effectsKnown: boolean;
  readonly knownEffects: EffectBundle | null;
  readonly bonusKnown: boolean;
  readonly knownBonus: number | null;
  readonly unknown: readonly ItemCardUnknownField[];
};

export type AppearancePool = {
  readonly [definitionId: string]: string;
};

export const NEUTRAL_APPEARANCE_TABLE = {
  draught: [
    "a chalky draught",
    "a cloudy draught",
    "a bitter draught",
    "a clear draught",
    "a fizzy draught",
    "a pale draught",
    "a silvery draught",
    "a tart draught",
  ],
  note: [
    "a folded note",
    "a creased note",
    "a sealed note",
    "a narrow note",
    "a smudged note",
    "a square note",
    "a pinned note",
    "a plain note",
  ],
  charm: [
    "a humming charm",
    "a dull charm",
    "a smooth charm",
    "a cold charm",
    "a knotted charm",
    "a tiny charm",
    "a heavy charm",
    "a plain charm",
  ],
} as const satisfies Record<UnidentifiedItemCategory, readonly string[]>;

const UNIDENTIFIED_CATEGORIES: ReadonlySet<ItemCategory> = new Set([
  "draught",
  "note",
  "charm",
]);

export const isUnidentifiedByDefault = (
  definition: ItemDefinition,
): definition is ItemDefinition & { readonly kind: UnidentifiedItemCategory } =>
  UNIDENTIFIED_CATEGORIES.has(definition.kind);

export const appearancePoolForRun = (
  seed: string,
  definitions: readonly ItemDefinition[],
): AppearancePool => {
  const entries: [string, string][] = [];

  for (const category of ["draught", "note", "charm"] as const) {
    const categoryDefinitions = definitions
      .filter((definition) => definition.kind === category)
      .sort((left, right) => left.id.localeCompare(right.id));

    if (categoryDefinitions.length === 0) {
      continue;
    }

    const appearances = createRng(seed)
      .fork("items")
      .fork(`appearance:${category}`)
      .shuffle(NEUTRAL_APPEARANCE_TABLE[category]);

    for (let index = 0; index < categoryDefinitions.length; index += 1) {
      const definition = categoryDefinitions[index];
      const appearance = appearances[index % appearances.length];

      if (definition !== undefined && appearance !== undefined) {
        entries.push([definition.id, appearance]);
      }
    }
  }

  return Object.fromEntries(entries);
};

export const appearanceForItem = (
  state: GameState,
  definition: ItemDefinition,
): string | null => {
  if (!isUnidentifiedByDefault(definition)) {
    return null;
  }

  return appearancePoolForRun(state.run.seed, [definition])[definition.id] ?? null;
};

export const isItemDefinitionKnown = (
  state: GameState,
  definition: ItemDefinition,
  stack?: Pick<PlayerItemStack, "identified"> | null,
): boolean =>
  !isUnidentifiedByDefault(definition) ||
  stack?.identified === true ||
  state.run.itemKnowledge.identifiedDefinitionIds.includes(definition.id);

export const itemCardKnowledge = (
  state: GameState,
  definition: ItemDefinition,
  options: {
    readonly itemInstanceId?: string | null;
    readonly identified?: boolean;
  } = {},
): ItemCardKnowledge => {
  const itemInstanceId = options.itemInstanceId ?? null;
  const stack = { identified: options.identified ?? false };
  const definitionKnown = isItemDefinitionKnown(state, definition, stack);
  const appearance = appearanceForItem(state, definition);
  const bonus = equipmentBonus(definition);
  const bonusKnown =
    bonus === null ||
    options.identified === true ||
    (itemInstanceId !== null &&
      state.run.itemKnowledge.bonusRevealedItemInstanceIds.includes(
        itemInstanceId,
      ));
  const unknown: ItemCardUnknownField[] = [];

  if (!definitionKnown && isUnidentifiedByDefault(definition)) {
    unknown.push("name", "effects");
  }

  if (!bonusKnown) {
    unknown.push("bonus");
  }

  return {
    itemInstanceId,
    definitionId: definition.id,
    category: definition.kind,
    displayName: definitionKnown ? definition.name : (appearance ?? "an item"),
    appearance,
    knownName: definitionKnown ? definition.name : null,
    effectsKnown: definitionKnown,
    knownEffects: definitionKnown ? activeEffectBundle(definition) : null,
    bonusKnown,
    knownBonus: bonusKnown ? bonus : null,
    unknown,
  };
};

export const identifyDefinitionByUse = (
  state: GameState,
  definition: ItemDefinition,
): GameState => {
  if (!isUnidentifiedByDefault(definition)) {
    return state;
  }

  return withIdentifiedDefinition(state, definition.id);
};

export const withIdentifiedDefinition = (
  state: GameState,
  definitionId: string,
): GameState => {
  const identifiedDefinitionIds = mergeStrings(
    state.run.itemKnowledge.identifiedDefinitionIds,
    definitionId,
  );

  return withMarkedItemStacks(
    {
      ...state,
      run: {
        ...state.run,
        itemKnowledge: {
          ...state.run.itemKnowledge,
          identifiedDefinitionIds,
        },
      },
    },
    (stack) =>
      stack.definition.id === definitionId ? { ...stack, identified: true } : stack,
  );
};

export const revealEquipmentBonus = (
  state: GameState,
  itemInstanceId: string,
): GameState => {
  const bonusRevealedItemInstanceIds = mergeStrings(
    state.run.itemKnowledge.bonusRevealedItemInstanceIds,
    itemInstanceId,
  );

  return withMarkedItemStacks(
    {
      ...state,
      run: {
        ...state.run,
        itemKnowledge: {
          ...state.run.itemKnowledge,
          bonusRevealedItemInstanceIds,
        },
      },
    },
    (stack) =>
      stack.itemInstanceId === itemInstanceId
        ? { ...stack, identified: true }
        : stack,
  );
};

export const activeEffectBundle = (
  definition: ItemDefinition,
): EffectBundle | null => {
  switch (definition.kind) {
    case "charm":
      return definition.charm?.passive ?? null;
    case "draught":
      return definition.draught?.effect ?? null;
    case "note":
      return definition.note?.effect ?? null;
    case "throwable":
      return definition.throwable?.effect ?? null;
    case "food":
      return definition.food?.effect ?? null;
    case "tool":
      return definition.tool?.effect ?? null;
    case "weapon":
    case "armor":
    case "key_item":
    case "coin":
      return null;
  }
};

const equipmentBonus = (definition: ItemDefinition): number | null => {
  if (definition.kind === "weapon") {
    return definition.weapon?.attackBonus ?? null;
  }

  if (definition.kind === "armor") {
    return definition.armor?.defenseBonus ?? null;
  }

  return null;
};

const withMarkedItemStacks = (
  state: GameState,
  update: (stack: PlayerItemStack) => PlayerItemStack,
): GameState => {
  const inventory = state.player.inventory.map(
    (slot): InventorySlot => (slot === null ? null : update(slot)),
  );
  const equipment = {
    weapon:
      state.player.equipment.weapon === null
        ? null
        : update(state.player.equipment.weapon),
    armor:
      state.player.equipment.armor === null
        ? null
        : update(state.player.equipment.armor),
    charms: state.player.equipment.charms.map((slot) =>
      slot === null ? null : update(slot),
    ),
  };
  const entities = Object.fromEntries(
    Object.entries(state.entities).map(([id, entity]) => {
      if (entity.kind !== "item") {
        return [id, entity];
      }

      const marked: GroundItemEntityInstance = {
        ...entity,
        identified:
          update({
            itemInstanceId: entity.id,
            definition: entity.definition,
            quantity: entity.quantity,
            identified: entity.identified,
          }).identified,
      };

      return [id, marked];
    }),
  );

  return {
    ...state,
    player: {
      ...state.player,
      inventory,
      equipment,
    },
    entities,
  };
};

const mergeStrings = (
  values: readonly string[],
  nextValue: string,
): readonly string[] =>
  values.includes(nextValue) ? values : [...values, nextValue].sort();
