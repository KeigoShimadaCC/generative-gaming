import { createRng } from "../../engine/rng/index.js";
import { render } from "../../engine/render/grid.js";
import {
  defaultVisibleFog,
  floorKnowledge,
  fogFromState,
  gridFromState,
  isTrapRevealed,
} from "../../engine/render/floor-runtime.js";
import { getAvailableActions } from "../../engine/turn/index.js";
import { activeEffectBundle, itemCardKnowledge } from "../../engine/items/index.js";
import {
  idx,
  type FogMemory,
  type FogTileMemory,
} from "../../engine/map/index.js";
import type {
  EntityId,
  EntityInstance,
  GameState,
  PlayerItemStack,
  Position,
  SerializableRecord,
} from "../../engine/state/index.js";
import type { RunAction } from "../../engine/run/loop.js";
import type {
  BotKnownFeature,
  BotKnownItem,
  BotMemory,
  BotPolicyName,
  BotStateView,
} from "./types.js";

type BuildBotViewOptions = {
  readonly policyName: BotPolicyName;
  readonly memory?: BotMemory;
};

export const createEmptyBotMemory = (): BotMemory => ({
  visitedByDepth: new Map(),
  depthStartTurn: new Map(),
  knownFeaturesByDepth: new Map(),
  recentPositionsByDepth: new Map(),
});

export const createBotStateView = (
  state: GameState,
  options: BuildBotViewOptions,
): BotStateView => {
  const grid = gridFromState(state);
  const fog = grid === null ? null : (fogFromState(state, grid) ?? defaultVisibleFog(grid));
  const knowledge = floorKnowledge(state);
  const rememberedFeatures =
    options.memory?.knownFeaturesByDepth.get(state.run.depth) ?? [];
  const inspectableFeatures = readInspectableFeatures(state, fog);
  const visibleFeatures = mergeFeatures([
    ...rememberedFeatures,
    ...inspectableFeatures,
  ]);
  const availableActions = availableRunActions(state, inspectableFeatures);
  const inventory = state.player.inventory
    .filter((slot): slot is PlayerItemStack => slot !== null)
    .map((stack) => itemViewFromStack(state, stack, null));
  const equipment = {
    weapon:
      state.player.equipment.weapon === null
        ? null
        : itemViewFromStack(state, state.player.equipment.weapon, null, true),
    armor:
      state.player.equipment.armor === null
        ? null
        : itemViewFromStack(state, state.player.equipment.armor, null, true),
    charms: state.player.equipment.charms
      .filter((slot): slot is PlayerItemStack => slot !== null)
      .map((stack) => itemViewFromStack(state, stack, null, true)),
  };
  const visibleEntities = Object.values(state.entities)
    .filter((entity) => entityCellVisible(entity, fog, knowledge.mapRevealed === true))
    .sort((left, right) => left.id.localeCompare(right.id));
  const visited = positionsFromKeys(
    options.memory?.visitedByDepth.get(state.run.depth) ?? new Set(),
  );
  const depthStartedAt = options.memory?.depthStartTurn.get(state.run.depth) ?? state.run.turn;

  return {
    policyName: options.policyName,
    availableActions,
    rendered: render(state),
    run: {
      seed: state.run.seed,
      turn: state.run.turn,
      depth: state.run.depth,
      terminalStatus: state.run.terminalStatus,
    },
    floor: {
      width: grid?.width ?? 0,
      height: grid?.height ?? 0,
      turn: Math.max(0, state.run.turn - depthStartedAt),
    },
    player: {
      position: state.player.position,
      hp: {
        current: state.player.hp.current,
        max: state.player.hp.max,
        ratio: ratio(state.player.hp.current, state.player.hp.max),
      },
      fullness: {
        current: state.player.fullness.current,
        max: state.player.fullness.max,
        ratio: ratio(state.player.fullness.current, state.player.fullness.max),
      },
      level: state.player.level,
      statuses: state.player.statuses.map((status) => status.status),
      inventory,
      equipment,
    },
    map: {
      cells:
        grid === null || fog === null
          ? []
          : grid.tiles.flatMap((tile, index) => {
              const memory = fog.tiles[index];
              if (memory === undefined || hiddenCell(memory, knowledge.mapRevealed === true)) {
                return [];
              }

              return [
                {
                  position: {
                    x: index % grid.width,
                    y: Math.floor(index / grid.width),
                  },
                  terrain: tile.terrain,
                  door: tile.door,
                  visibility:
                    knowledge.mapRevealed === true || memory.state === "visible"
                      ? ("visible" as const)
                      : ("remembered" as const),
                },
              ];
            }),
      visited,
    },
    visible: {
      enemies: visibleEntities
        .filter((entity) => entity.kind === "enemy")
        .map((enemy) => ({
          id: enemy.id,
          name: enemy.definition.name,
          glyph: enemy.definition.glyph,
          position: enemy.position,
          hp: {
            current: enemy.currentHP,
            max: enemy.definition.stats.hp,
            ratio: ratio(enemy.currentHP, enemy.definition.stats.hp),
          },
          attack: enemy.definition.stats.attack,
          defense: enemy.definition.stats.defense,
          statuses: enemy.statuses.map((status) => status.status),
        })),
      npcs: visibleEntities
        .filter((entity) => entity.kind === "npc")
        .map((npc) => ({
          id: npc.id,
          name: npc.definition.name,
          position: npc.position,
        })),
      groundItems: visibleEntities
        .filter((entity) => entity.kind === "item")
        .map((item) =>
          itemViewFromStack(
            state,
            {
              itemInstanceId: item.id,
              definition: item.definition,
              quantity: item.quantity,
              identified: item.identified,
            },
            item.id,
            false,
            item.position,
          ),
        ),
      traps: visibleEntities
        .filter(
          (entity) =>
            entity.kind === "trap" &&
            isTrapRevealed(state, entity.id, entity.behaviorRuntime),
        )
        .map((trap) => ({
          id: trap.id,
          name: trap.definition.name,
          position: trap.position,
        })),
      features: visibleFeatures,
    },
    chooseIndex: (label, size) => {
      if (!Number.isSafeInteger(size) || size <= 0) {
        throw new RangeError("size must be a positive safe integer");
      }

      return createRng(state.rng.rootSeed)
        .fork(`bot:${options.policyName}`)
        .fork(`turn:${state.run.turn}`)
        .fork(label)
        .int(0, size - 1);
    },
  };
};

export const updateBotMemory = (
  memory: BotMemory,
  view: BotStateView,
): BotMemory => {
  const depth = view.run.depth;
  const positionKey = key(view.player.position);
  const visited = new Set(memory.visitedByDepth.get(depth) ?? []);
  visited.add(positionKey);

  const recent = [
    positionKey,
    ...(memory.recentPositionsByDepth.get(depth) ?? []).filter(
      (candidate) => candidate !== positionKey,
    ),
  ].slice(0, 16);
  const knownFeatures = mergeFeatures([
    ...(memory.knownFeaturesByDepth.get(depth) ?? []),
    ...view.visible.features,
  ]);
  const depthStartTurn = new Map(memory.depthStartTurn);
  if (!depthStartTurn.has(depth)) {
    depthStartTurn.set(depth, view.run.turn);
  }

  return {
    visitedByDepth: new Map(memory.visitedByDepth).set(depth, visited),
    depthStartTurn,
    knownFeaturesByDepth: new Map(memory.knownFeaturesByDepth).set(
      depth,
      knownFeatures,
    ),
    recentPositionsByDepth: new Map(memory.recentPositionsByDepth).set(depth, recent),
  };
};

const availableRunActions = (
  state: GameState,
  liveFeatures: readonly BotKnownFeature[],
): readonly RunAction[] => {
  const actions: RunAction[] = [...getAvailableActions(state)];

  if (
    liveFeatures.some(
      (feature) =>
        feature.kind === "hoard" &&
        feature.depth === state.run.depth &&
        samePosition(feature.position, state.player.position),
    )
  ) {
    actions.unshift({ kind: "take_hoard" });
  }

  return actions;
};

const itemViewFromStack = (
  state: GameState,
  stack: PlayerItemStack,
  entityId: EntityId | null,
  equipped = false,
  position: Position | null = null,
): BotKnownItem => {
  const knowledge = itemCardKnowledge(state, stack.definition, {
    itemInstanceId: stack.itemInstanceId,
    identified: stack.identified,
  });
  const bundle = knowledge.effectsKnown ? activeEffectBundle(stack.definition) : null;

  return {
    itemInstanceId: stack.itemInstanceId,
    entityId,
    definitionId: stack.definition.id,
    category: knowledge.category,
    displayName: knowledge.displayName,
    position,
    quantity: stack.quantity,
    identified: stack.identified,
    effectsKnown: knowledge.effectsKnown,
    effects: bundle?.effects ?? [],
    bonusKnown: knowledge.bonusKnown,
    bonus: knowledge.knownBonus,
    equipped,
  };
};

const readInspectableFeatures = (
  state: GameState,
  fog: FogMemory | null,
): readonly BotKnownFeature[] => {
  const knowledge = floorKnowledge(state);
  const records = readDecorativeFeatureRecords(knowledge);

  return records.flatMap((record) => {
    const feature = parseHoardFeature(record);
    if (feature === null) {
      return [];
    }

    if (
      fog !== null &&
      !cellKnown(fog, feature.position, knowledge.mapRevealed === true)
    ) {
      return [];
    }

    return [feature];
  });
};

const parseHoardFeature = (record: SerializableRecord): BotKnownFeature | null => {
  if (
    record.kind !== "hoard" ||
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    typeof record.x !== "number" ||
    typeof record.y !== "number" ||
    typeof record.depth !== "number" ||
    !Number.isSafeInteger(record.x) ||
    !Number.isSafeInteger(record.y) ||
    !Number.isSafeInteger(record.depth)
  ) {
    return null;
  }

  return {
    id: record.id,
    kind: "hoard",
    name: record.name,
    position: { x: record.x, y: record.y },
    depth: record.depth,
  };
};

const readDecorativeFeatureRecords = (knowledge: {
  readonly [key: string]: unknown;
}): readonly SerializableRecord[] => {
  const records = knowledge.decorativeFeatures;
  if (!Array.isArray(records)) {
    return [];
  }

  return records.filter(
    (record): record is SerializableRecord =>
      record !== null && typeof record === "object" && !Array.isArray(record),
  );
};

const entityCellVisible = (
  entity: EntityInstance,
  fog: FogMemory | null,
  mapRevealed: boolean,
): boolean => {
  if (fog === null) {
    return true;
  }

  const memory = fog.tiles[idx(fog, entity.position)];
  if (memory === undefined) {
    return false;
  }

  return mapRevealed || memory.state === "visible";
};

const cellKnown = (
  fog: FogMemory,
  position: Position,
  mapRevealed: boolean,
): boolean => {
  const memory = fog.tiles[idx(fog, position)];
  return memory !== undefined && !hiddenCell(memory, mapRevealed);
};

const hiddenCell = (memory: FogTileMemory, mapRevealed: boolean): boolean =>
  !mapRevealed && memory.state === "unseen";

const mergeFeatures = (
  features: readonly BotKnownFeature[],
): readonly BotKnownFeature[] =>
  [
    ...new Map(
      features.map((feature) => [
        `${feature.depth}:${feature.kind}:${feature.id}`,
        feature,
      ]),
    ).values(),
  ].sort((left, right) =>
    left.depth === right.depth
      ? left.id.localeCompare(right.id)
      : left.depth - right.depth,
  );

const positionsFromKeys = (keys: ReadonlySet<string>): readonly Position[] =>
  [...keys].sort().map((value) => {
    const [x, y] = value.split(",").map((part) => Number.parseInt(part, 10));
    return { x: x ?? 0, y: y ?? 0 };
  });

const ratio = (current: number, max: number): number =>
  max <= 0 ? 0 : current / max;

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;

const key = (position: Position): string => `${position.x},${position.y}`;
