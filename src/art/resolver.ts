import { Terrain, type TerrainKind } from "../engine/map/index.js";
import { isTrapRevealed } from "../engine/render/index.js";
import type {
  EntityId,
  EntityInstance,
  GameState,
  Position,
  SerializableRecord,
  TrapEntityInstance
} from "../engine/state/index.js";
import type { BehaviorKind, ItemCategory } from "../schemas/entities/index.js";
import {
  FALLBACK_THEME_ID,
  GeneratedSpriteCatalog,
  spriteAtlasKey,
  themeIdForBand,
  type SpriteAtlasKey,
  type SpriteAtlasThemeId
} from "./atlas.js";
import type { FallbackSpriteId } from "./fallback.js";
import type { DepthBand } from "../schemas/entities/index.js";

export type ArtResolverLayer =
  | "player"
  | "enemy"
  | "npc"
  | "item"
  | "trap"
  | "terrain"
  | "empty";

export type ArtResolverCellView = {
  readonly x: number;
  readonly y: number;
  readonly terrain: string;
  readonly layer: ArtResolverLayer;
  readonly featureKind: string;
  readonly featureId: string;
};

export type ArtResolverOptions = {
  readonly band?: DepthBand;
  readonly themeId?: SpriteAtlasThemeId;
  readonly seed?: string;
  readonly revealHiddenTraps?: boolean;
  readonly generatedCatalog?: GeneratedSpriteCatalog | null;
};

export type ResolvedSprite = {
  readonly spriteId: FallbackSpriteId;
  readonly atlasKey: SpriteAtlasKey;
  readonly reason: string;
};

export const TERRAIN_SPRITE_MAP = {
  [Terrain.Floor]: "terrain.floor",
  [Terrain.Wall]: "terrain.wall",
  [Terrain.Door]: "terrain.door",
  [Terrain.Water]: "terrain.water",
  [Terrain.StairsDown]: "terrain.stairs_down",
  [Terrain.Entrance]: "terrain.entrance"
} as const satisfies Record<TerrainKind, FallbackSpriteId>;

export const ITEM_KIND_SPRITE_MAP = {
  weapon: "item.gear",
  armor: "item.gear",
  charm: "item.gear",
  draught: "item.consumable",
  note: "item.consumable",
  throwable: "item.consumable",
  food: "item.consumable",
  tool: "item.consumable",
  key_item: "item.treasure",
  coin: "item.treasure"
} as const satisfies Record<ItemCategory, FallbackSpriteId>;

export const ENEMY_BEHAVIOR_SPRITE_MAP = {
  approach_melee: "enemy.brute",
  keep_range: "enemy.skirmisher",
  flee_low_hp: "enemy.skirmisher",
  pack_hunter: "enemy.brute",
  ambusher: "enemy.skirmisher",
  territorial: "enemy.brute",
  guard: "enemy.brute",
  patrol: "enemy.skirmisher",
  thief: "enemy.skirmisher",
  caster: "enemy.caster",
  bodyguard: "enemy.brute",
  mimic: "enemy.caster"
} as const satisfies Record<BehaviorKind, FallbackSpriteId>;

export const TRAP_STATE_SPRITE_MAP = {
  hidden: "trap.hidden",
  revealed: "trap.revealed"
} as const satisfies Record<"hidden" | "revealed", FallbackSpriteId>;

export const RESOLVER_MAPPING_TABLE = [
  ...Object.entries(TERRAIN_SPRITE_MAP).map(([discriminant, spriteId]) => ({
    discriminant: `terrain.${discriminant}`,
    spriteId
  })),
  ...Object.entries(ITEM_KIND_SPRITE_MAP).map(([discriminant, spriteId]) => ({
    discriminant: `item.${discriminant}`,
    spriteId
  })),
  ...Object.entries(ENEMY_BEHAVIOR_SPRITE_MAP).map(
    ([discriminant, spriteId]) => ({
      discriminant: `enemy.behavior.${discriminant}`,
      spriteId
    })
  ),
  ...Object.entries(TRAP_STATE_SPRITE_MAP).map(([discriminant, spriteId]) => ({
    discriminant: `trap.${discriminant}`,
    spriteId
  })),
  { discriminant: "actor.player", spriteId: "actor.player" },
  { discriminant: "npc.any", spriteId: "npc.keeper" },
  { discriminant: "feature.hoard", spriteId: "feature.hoard" },
  { discriminant: "grid.empty", spriteId: "terrain.floor" }
] as const satisfies readonly {
  readonly discriminant: string;
  readonly spriteId: FallbackSpriteId;
}[];

export const resolveSpriteForCell = (
  state: GameState,
  cell: ArtResolverCellView,
  options: ArtResolverOptions = {}
): ResolvedSprite => {
  const position = { x: cell.x, y: cell.y };

  if (samePosition(state.player.position, position)) {
    return resolved(state, "actor.player", "actor.player", options);
  }

  const entities = entitiesAt(state, position);
  const enemy = entities.find((entity) => entity.kind === "enemy");
  if (enemy !== undefined) {
    return resolved(
      state,
      resolveEnemySpriteId(enemy.definition.behaviors[0]?.kind),
      `enemy.behavior.${enemy.definition.behaviors[0]?.kind ?? "default"}`,
      options
    );
  }

  const npc = entities.find((entity) => entity.kind === "npc");
  if (npc !== undefined) {
    return resolved(state, "npc.keeper", "npc.any", options);
  }

  const item = entities.find((entity) => entity.kind === "item");
  if (item !== undefined) {
    return resolved(
      state,
      resolveItemSpriteId(item.definition.kind),
      `item.${item.definition.kind}`,
      options
    );
  }

  const trap = entities.find((entity) => entity.kind === "trap");
  if (trap !== undefined) {
    const trapRevealed = isTrapRevealed(state, trap.id, trap.behaviorRuntime);
    if (trapRevealed || options.revealHiddenTraps === true) {
      return resolved(
        state,
        resolveTrapSpriteId(state, trap),
        trapRevealed ? "trap.revealed" : "trap.hidden",
        options
      );
    }
  }

  if (
    cell.featureKind === "hoard" ||
    hoardFeatureAt(state, position) !== null
  ) {
    return resolved(state, "feature.hoard", "feature.hoard", options);
  }

  return resolved(
    state,
    resolveTerrainSpriteId(cell.terrain),
    cell.layer === "empty" ? "grid.empty" : `terrain.${cell.terrain}`,
    options
  );
};

export const resolveSpriteForEntity = (
  state: GameState,
  entity: EntityInstance,
  options: ArtResolverOptions = {}
): ResolvedSprite => {
  switch (entity.kind) {
    case "enemy":
      return resolved(
        state,
        resolveEnemySpriteId(entity.definition.behaviors[0]?.kind),
        `enemy.behavior.${entity.definition.behaviors[0]?.kind ?? "default"}`,
        options
      );
    case "item":
      return resolved(
        state,
        resolveItemSpriteId(entity.definition.kind),
        `item.${entity.definition.kind}`,
        options
      );
    case "npc":
      return resolved(state, "npc.keeper", "npc.any", options);
    case "trap":
      return resolved(
        state,
        resolveTrapSpriteId(state, entity),
        isTrapRevealed(state, entity.id, entity.behaviorRuntime)
          ? "trap.revealed"
          : "trap.hidden",
        options
      );
  }
};

export const resolveTerrainSpriteId = (
  terrain: TerrainKind | string
): FallbackSpriteId =>
  isTerrainKind(terrain) ? TERRAIN_SPRITE_MAP[terrain] : "terrain.floor";

export const resolveItemSpriteId = (kind: ItemCategory): FallbackSpriteId =>
  ITEM_KIND_SPRITE_MAP[kind];

export const resolveEnemySpriteId = (
  behaviorKind: BehaviorKind | undefined
): FallbackSpriteId =>
  behaviorKind === undefined
    ? "enemy.brute"
    : ENEMY_BEHAVIOR_SPRITE_MAP[behaviorKind];

export const resolveTrapSpriteId = (
  state: GameState,
  trap: TrapEntityInstance
): FallbackSpriteId =>
  isTrapRevealed(state, trap.id, trap.behaviorRuntime)
    ? TRAP_STATE_SPRITE_MAP.revealed
    : TRAP_STATE_SPRITE_MAP.hidden;

export const resolveAtlasKeyForSprite = (
  spriteId: FallbackSpriteId,
  options: {
    readonly band?: DepthBand;
    readonly themeId?: SpriteAtlasThemeId;
    readonly seed: string;
    readonly generatedCatalog?: GeneratedSpriteCatalog | null;
  }
): SpriteAtlasKey => {
  const themeId =
    options.themeId ??
    (options.band === undefined ? undefined : themeIdForBand(options.band)) ??
    FALLBACK_THEME_ID;
  const catalog = options.generatedCatalog;

  if (
    themeId !== FALLBACK_THEME_ID &&
    catalog !== undefined &&
    catalog !== null &&
    catalog.has(themeId, spriteId)
  ) {
    const generated = catalog.get(themeId, spriteId);
    if (generated !== null) {
      return generated.atlasKey;
    }
  }

  return spriteAtlasKey(FALLBACK_THEME_ID, spriteId, options.seed);
};

export const artResolverOptionsForBand = (
  band: DepthBand,
  generatedCatalog: GeneratedSpriteCatalog | null = null
): Pick<
  ArtResolverOptions,
  "band" | "themeId" | "generatedCatalog"
> => ({
  band,
  themeId: themeIdForBand(band),
  generatedCatalog
});

const resolved = (
  state: GameState,
  spriteId: FallbackSpriteId,
  reason: string,
  options: ArtResolverOptions
): ResolvedSprite => ({
  spriteId,
  atlasKey: resolveAtlasKeyForSprite(spriteId, {
    band: options.band,
    themeId: options.themeId,
    seed: options.seed ?? state.run.seed,
    generatedCatalog: options.generatedCatalog
  }),
  reason
});

const isTerrainKind = (value: string): value is TerrainKind =>
  value === Terrain.Floor ||
  value === Terrain.Wall ||
  value === Terrain.Door ||
  value === Terrain.Water ||
  value === Terrain.StairsDown ||
  value === Terrain.Entrance;

const ENTITY_KIND_ORDER: Readonly<Record<EntityInstance["kind"], number>> = {
  enemy: 0,
  item: 1,
  npc: 2,
  trap: 3
};

const entitiesAt = (
  state: GameState,
  position: Position
): readonly EntityInstance[] =>
  Object.values(state.entities)
    .filter((entity) => samePosition(entity.position, position))
    .sort(compareEntities);

const compareEntities = (
  left: EntityInstance,
  right: EntityInstance
): number => {
  const kindDelta =
    ENTITY_KIND_ORDER[left.kind] - ENTITY_KIND_ORDER[right.kind];

  if (kindDelta !== 0) {
    return kindDelta;
  }

  return compareEntityIds(left.id, right.id);
};

const compareEntityIds = (left: EntityId, right: EntityId): number => {
  const parsedLeft = parseEntityId(left);
  const parsedRight = parseEntityId(right);
  const kindOrder = parsedLeft.kind.localeCompare(parsedRight.kind);

  return kindOrder === 0 ? parsedLeft.index - parsedRight.index : kindOrder;
};

const parseEntityId = (
  id: EntityId
): { readonly kind: string; readonly index: number } => {
  const [kind, rawIndex] = id.split("#");

  return {
    kind: kind ?? "",
    index: Number.parseInt(rawIndex ?? "0", 10)
  };
};

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;

const hoardFeatureAt = (
  state: GameState,
  position: Position
): SerializableRecord | null => {
  for (const feature of decorativeFeatures(state)) {
    if (feature.kind !== "hoard") {
      continue;
    }

    if (feature.x === position.x && feature.y === position.y) {
      return feature;
    }
  }

  return null;
};

const decorativeFeatures = (
  state: GameState
): readonly SerializableRecord[] => {
  const opaque = state.floor.geometry.opaque as {
    readonly knowledge?: {
      readonly decorativeFeatures?: readonly SerializableRecord[];
    };
  } | null;

  return opaque?.knowledge?.decorativeFeatures ?? [];
};
