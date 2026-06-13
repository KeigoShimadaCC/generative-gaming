import { describe, expect, it } from "vitest";

import { Terrain, TERRAIN_KINDS } from "../engine/map/index.js";
import type {
  EntityInstance,
  GameState,
  SerializableRecord,
  TrapEntityInstance
} from "../engine/state/index.js";
import type { BehaviorKind, ItemCategory } from "../schemas/entities/index.js";
import { FALLBACK_THEME_ID } from "./atlas.js";
import { FALLBACK_SPRITE_IDS } from "./fallback.js";
import {
  ENEMY_BEHAVIOR_SPRITE_MAP,
  ITEM_KIND_SPRITE_MAP,
  RESOLVER_MAPPING_TABLE,
  resolveEnemySpriteId,
  resolveItemSpriteId,
  resolveSpriteForCell,
  resolveSpriteForEntity,
  resolveTerrainSpriteId,
  resolveTrapSpriteId,
  TERRAIN_SPRITE_MAP,
  TRAP_STATE_SPRITE_MAP,
  type ArtResolverCellView
} from "./resolver.js";
import {
  GeneratedSpriteCatalog,
  type GeneratedSpriteRecord
} from "./atlas.js";

const ITEM_KINDS = [
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
] as const satisfies readonly ItemCategory[];

const BEHAVIOR_KINDS = [
  "approach_melee",
  "keep_range",
  "flee_low_hp",
  "pack_hunter",
  "ambusher",
  "territorial",
  "guard",
  "patrol",
  "thief",
  "caster",
  "bodyguard",
  "mimic"
] as const satisfies readonly BehaviorKind[];

describe("schema to sprite resolver", () => {
  it("covers every terrain, item, enemy behavior, trap state, and singleton discriminant", () => {
    expect(Object.keys(TERRAIN_SPRITE_MAP).sort()).toEqual(
      [...TERRAIN_KINDS].sort()
    );
    expect(Object.keys(ITEM_KIND_SPRITE_MAP).sort()).toEqual(
      [...ITEM_KINDS].sort()
    );
    expect(Object.keys(ENEMY_BEHAVIOR_SPRITE_MAP).sort()).toEqual(
      [...BEHAVIOR_KINDS].sort()
    );
    expect(Object.keys(TRAP_STATE_SPRITE_MAP).sort()).toEqual([
      "hidden",
      "revealed"
    ]);

    const fallbackIds = new Set<string>(FALLBACK_SPRITE_IDS);
    for (const row of RESOLVER_MAPPING_TABLE) {
      expect(fallbackIds.has(row.spriteId)).toBe(true);
    }

    expect(TERRAIN_KINDS.map(resolveTerrainSpriteId)).toEqual([
      "terrain.floor",
      "terrain.wall",
      "terrain.door",
      "terrain.water",
      "terrain.stairs_down",
      "terrain.entrance"
    ]);
    expect(ITEM_KINDS.map(resolveItemSpriteId)).toEqual([
      "item.gear",
      "item.gear",
      "item.gear",
      "item.consumable",
      "item.consumable",
      "item.consumable",
      "item.consumable",
      "item.consumable",
      "item.treasure",
      "item.treasure"
    ]);
    expect(BEHAVIOR_KINDS.map(resolveEnemySpriteId)).toEqual([
      "enemy.brute",
      "enemy.skirmisher",
      "enemy.skirmisher",
      "enemy.brute",
      "enemy.skirmisher",
      "enemy.brute",
      "enemy.brute",
      "enemy.skirmisher",
      "enemy.skirmisher",
      "enemy.caster",
      "enemy.brute",
      "enemy.caster"
    ]);
  });

  it("resolves cell sprites with fallback atlas keys seeded from GameState", () => {
    const state = stateWith();

    const resolved = resolveSpriteForCell(
      state,
      cellAt(0, 0, "floor", "player")
    );

    expect(resolved).toEqual({
      spriteId: "actor.player",
      reason: "actor.player",
      atlasKey: {
        themeId: FALLBACK_THEME_ID,
        entityId: "actor.player",
        seed: "seed-1"
      }
    });
  });

  it("resolves entity subtypes without mutating game state", () => {
    const enemy = enemyAt("enemy#1", 1, 1, "caster");
    const item = itemAt("item#1", 2, 1, "coin");
    const npc = npcAt("npc#1", 3, 1);
    const trap = trapAt("trap#1", 4, 1, true);
    const state = stateWith({
      entities: [enemy, item, npc, trap]
    });

    expect(resolveSpriteForEntity(state, enemy).spriteId).toBe("enemy.caster");
    expect(resolveSpriteForEntity(state, item).spriteId).toBe("item.treasure");
    expect(resolveSpriteForEntity(state, npc).spriteId).toBe("npc.keeper");
    expect(resolveTrapSpriteId(state, trap)).toBe("trap.revealed");
    expect(resolveSpriteForEntity(state, trap).spriteId).toBe("trap.revealed");
  });

  it("does not expose hidden traps in normal cell resolution", () => {
    const hiddenTrap = trapAt("trap#1", 1, 1, false);
    const state = stateWith({ entities: [hiddenTrap] });
    const cell = cellAt(1, 1, Terrain.Floor, "terrain");

    expect(resolveTrapSpriteId(state, hiddenTrap)).toBe("trap.hidden");
    expect(resolveSpriteForCell(state, cell).spriteId).toBe("terrain.floor");
    expect(
      resolveSpriteForCell(state, cell, { revealHiddenTraps: true }).spriteId
    ).toBe("trap.hidden");
  });

  it("resolves the Hoard decorative feature as a 24x24 feature sprite", () => {
    const state = stateWith({
      decorativeFeatures: [
        {
          id: "hoard",
          kind: "hoard",
          name: "The Hoard",
          x: 5,
          y: 5,
          depth: 12
        }
      ]
    });

    expect(
      resolveSpriteForCell(state, cellAt(5, 5, Terrain.Floor, "terrain"))
        .spriteId
    ).toBe("feature.hoard");
  });

  it("prefers generated themed atlas keys when the catalog has a sprite", () => {
    const state = stateWith();
    const catalog = catalogWithGeneratedSprite({
      themeId: "torchlit-limestone",
      entityId: "actor.player",
      seed: "art-batch-shallows"
    });

    const resolved = resolveSpriteForCell(
      state,
      cellAt(0, 0, "floor", "player"),
      {
        themeId: "torchlit-limestone",
        generatedCatalog: catalog
      }
    );

    expect(resolved.spriteId).toBe("actor.player");
    expect(resolved.atlasKey).toEqual({
      themeId: "torchlit-limestone",
      entityId: "actor.player",
      seed: "art-batch-shallows"
    });
  });

  it("keeps fallback atlas keys when no generated catalog entry exists", () => {
    const state = stateWith();
    const catalog = catalogWithGeneratedSprite({
      themeId: "torchlit-limestone",
      entityId: "enemy.brute",
      seed: "art-batch-shallows"
    });

    const resolved = resolveSpriteForCell(
      state,
      cellAt(0, 0, "floor", "player"),
      {
        themeId: "torchlit-limestone",
        generatedCatalog: catalog
      }
    );

    expect(resolved).toEqual({
      spriteId: "actor.player",
      reason: "actor.player",
      atlasKey: {
        themeId: FALLBACK_THEME_ID,
        entityId: "actor.player",
        seed: "seed-1"
      }
    });
  });

  it("keeps fallback atlas keys when the generated catalog is empty", () => {
    const state = stateWith();
    const resolved = resolveSpriteForCell(
      state,
      cellAt(0, 0, "floor", "player"),
      {
        themeId: "torchlit-limestone",
        generatedCatalog: GeneratedSpriteCatalog.empty()
      }
    );

    expect(resolved.atlasKey.themeId).toBe(FALLBACK_THEME_ID);
  });
});

const cellAt = (
  x: number,
  y: number,
  terrain: string,
  layer: ArtResolverCellView["layer"]
): ArtResolverCellView => ({
  x,
  y,
  terrain,
  layer,
  featureKind: "",
  featureId: ""
});

const stateWith = (
  options: {
    readonly entities?: readonly EntityInstance[];
    readonly decorativeFeatures?: readonly SerializableRecord[];
  } = {}
): GameState =>
  ({
    version: {
      protocolVersion: "test-protocol",
      engineVersion: "test-engine"
    },
    run: {
      runId: "run-1",
      seed: "seed-1",
      depth: 1,
      band: "shallows",
      turn: 0,
      terminalStatus: "ACTIVE",
      itemKnowledge: {
        identifiedDefinitionIds: [],
        bonusRevealedItemInstanceIds: [],
        chargesByItemInstanceId: {}
      }
    },
    floor: {
      floorId: "floor#1",
      depth: 1,
      band: "shallows",
      geometry: {
        refId: "grid",
        opaque: {
          knowledge: {
            decorativeFeatures: options.decorativeFeatures ?? []
          }
        }
      }
    },
    player: {
      hp: { current: 10, max: 10 },
      level: 1,
      xp: 0,
      fullness: { current: 10, max: 10 },
      position: { x: 0, y: 0 },
      inventory: [],
      equipment: {
        weapon: null,
        armor: null,
        charms: []
      },
      statuses: []
    },
    entities: Object.fromEntries(
      (options.entities ?? []).map((entity) => [entity.id, entity])
    ),
    quests: {
      quests: {},
      activeQuestIds: [],
      completedQuestIds: [],
      failedQuestIds: []
    },
    log: [],
    rng: {
      rootSeed: "seed-1",
      streams: {}
    },
    ids: {
      entityCounters: {
        enemy: 0,
        npc: 0,
        item: 0,
        trap: 0
      }
    }
  }) as unknown as GameState;

const enemyAt = (
  id: "enemy#1",
  x: number,
  y: number,
  behaviorKind: BehaviorKind
): EntityInstance =>
  ({
    id,
    kind: "enemy",
    position: { x, y },
    currentHP: 1,
    statuses: [],
    behaviorRuntime: {},
    definition: {
      behaviors: [{ kind: behaviorKind }]
    }
  }) as unknown as EntityInstance;

const itemAt = (
  id: "item#1",
  x: number,
  y: number,
  kind: ItemCategory
): EntityInstance =>
  ({
    id,
    kind: "item",
    position: { x, y },
    currentHP: null,
    statuses: [],
    behaviorRuntime: {},
    definition: { kind },
    quantity: 1,
    identified: true
  }) as unknown as EntityInstance;

const npcAt = (id: "npc#1", x: number, y: number): EntityInstance =>
  ({
    id,
    kind: "npc",
    position: { x, y },
    currentHP: null,
    statuses: [],
    behaviorRuntime: {},
    definition: {},
    dialogueRuntime: {}
  }) as unknown as EntityInstance;

const trapAt = (
  id: "trap#1",
  x: number,
  y: number,
  revealed: boolean
): TrapEntityInstance =>
  ({
    id,
    kind: "trap",
    position: { x, y },
    currentHP: null,
    statuses: [],
    behaviorRuntime: revealed ? { revealed: true } : {},
    definition: {},
    armed: true
  }) as unknown as TrapEntityInstance;

const catalogWithGeneratedSprite = (options: {
  readonly themeId: string;
  readonly entityId: GeneratedSpriteRecord["entityId"];
  readonly seed: string;
}): GeneratedSpriteCatalog =>
  GeneratedSpriteCatalog.fromRecords([
    {
      version: "everdeep.art-generated.v1",
      themeId: options.themeId,
      entityId: options.entityId,
      seed: options.seed,
      manifest: generatedFixtureManifest()
    }
  ]);

const generatedFixtureManifest = () => ({
  w: 16 as const,
  h: 16 as const,
  palette: ["#101010", "#ffffff"] as const,
  px: Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) =>
      x >= 4 && x <= 11 && y >= 4 && y <= 11 ? 1 : 0
    )
  )
});
