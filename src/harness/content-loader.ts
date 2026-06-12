import { readFileSync, readdirSync } from "node:fs";

import { z } from "zod";

import { bounds, config } from "../config/index.js";
import type { LayoutFlavor } from "../engine/floorgen/flavors.js";
import { LAYOUT_FLAVORS } from "../engine/floorgen/flavors.js";
import type { FloorParams } from "../engine/floorgen/generate.js";
import {
  EnemyDefinitionSchema,
  ItemDefinitionSchema,
  NpcDefinitionSchema,
  QuestDefinitionSchema,
  TrapDefinitionSchema,
  type DepthBand,
  type EnemyDefinition,
  type ItemDefinition,
  type NpcDefinition,
  type QuestDefinition,
  type TrapDefinition,
} from "../schemas/entities/index.js";
import { depthBandForDepth } from "../engine/state/init.js";

const defaultPackRoot = new URL("../../content/fallback/", import.meta.url);

export class FallbackContentValidationError extends Error {
  readonly file: string;
  readonly entityId: string | null;

  constructor(file: string | URL, entityId: string | null, message: string) {
    const fileLabel = typeof file === "string" ? file : file.pathname;
    super(
      entityId === null
        ? `${fileLabel}: ${message}`
        : `${fileLabel} [${entityId}]: ${message}`,
    );
    this.name = "FallbackContentValidationError";
    this.file = fileLabel;
    this.entityId = entityId;
  }
}

const LayoutFlavorSchema = z.enum(LAYOUT_FLAVORS);

export const FallbackFloorDefinitionSchema = z.strictObject({
  depth: z.number().int().min(1).max(config.runStructure.depthFloors),
  flavor: LayoutFlavorSchema,
  enemyRosterIds: z.array(z.string().min(1)).min(1),
  itemIds: z
    .array(z.string().min(1))
    .min(config.itemsEconomy.itemsPerFloor.min)
    .max(config.itemsEconomy.itemsPerFloor.max),
  trapIds: z
    .array(z.string().min(1))
    .max(bounds.trapsNpcsQuests.traps.perFloor.max),
  npcIds: z
    .array(z.string().min(1))
    .max(bounds.trapsNpcsQuests.npcs.perFloor.max),
  questId: z.string().min(1).nullable(),
});

export type FallbackFloorDefinition = z.infer<typeof FallbackFloorDefinitionSchema>;

export type FallbackContentPack = {
  readonly root: string;
  readonly items: ReadonlyMap<string, ItemDefinition>;
  readonly enemies: ReadonlyMap<string, EnemyDefinition>;
  readonly traps: ReadonlyMap<string, TrapDefinition>;
  readonly npcs: ReadonlyMap<string, NpcDefinition>;
  readonly quests: ReadonlyMap<string, QuestDefinition>;
  readonly floors: ReadonlyMap<number, FallbackFloorDefinition>;
};

export type ResolvedFallbackFloor = {
  readonly depth: number;
  readonly band: DepthBand;
  readonly flavor: LayoutFlavor;
  readonly params: Omit<FloorParams, "seed">;
  readonly roster: readonly EnemyDefinition[];
  readonly items: readonly ItemDefinition[];
  readonly traps: readonly TrapDefinition[];
  readonly npcs: readonly NpcDefinition[];
  readonly quest: QuestDefinition | null;
};

const EntityArraySchema = <T extends z.ZodType>(schema: T, label: string) =>
  z.array(schema).superRefine((entries, ctx) => {
    const seen = new Set<string>();

    for (const [index, entry] of entries.entries()) {
      const parsed = schema.safeParse(entry);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: `${label} validation failed`,
        });
        continue;
      }

      const id = (parsed.data as { id: string }).id;
      if (seen.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `duplicate ${label} id ${id}`,
        });
      }
      seen.add(id);
    }
  });

const readJsonFile = (path: URL | string): unknown => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new FallbackContentValidationError(path, null, message);
  }
};

const parseEntityFile = <T>(
  filePath: URL,
  schema: z.ZodType<T>,
  label: string,
): ReadonlyMap<string, T> => {
  const raw = readJsonFile(filePath);
  const parsed = EntityArraySchema(schema, label).safeParse(raw);

  if (!parsed.success) {
    throw new FallbackContentValidationError(
      filePath,
      null,
      parsed.error.message,
    );
  }

  const map = new Map<string, T>();

  for (const entry of parsed.data) {
    const itemParsed = schema.safeParse(entry);
    if (!itemParsed.success) {
      const id =
        typeof entry === "object" &&
        entry !== null &&
        "id" in entry &&
        typeof entry.id === "string"
          ? entry.id
          : null;
      throw new FallbackContentValidationError(
        filePath,
        id,
        itemParsed.error.message,
      );
    }

    map.set((itemParsed.data as { id: string }).id, itemParsed.data);
  }

  return map;
};

const loadFloorFiles = (root: URL): ReadonlyMap<number, FallbackFloorDefinition> => {
  const floorsDir = new URL("floors/", root);
  const files = readdirSync(floorsDir, { withFileTypes: true })
    .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  const map = new Map<number, FallbackFloorDefinition>();

  for (const fileName of files) {
    const filePath = new URL(fileName, floorsDir);
    const raw = readJsonFile(filePath);
    const parsed = FallbackFloorDefinitionSchema.safeParse(raw);

    if (!parsed.success) {
      throw new FallbackContentValidationError(
        filePath,
        null,
        parsed.error.message,
      );
    }

    const depth = parsed.data.depth;
    if (map.has(depth)) {
      throw new FallbackContentValidationError(
        filePath,
        null,
        `duplicate floor depth ${depth}`,
      );
    }

    map.set(depth, parsed.data);
  }

  for (let depth = 1; depth <= config.runStructure.depthFloors; depth += 1) {
    if (!map.has(depth)) {
      throw new FallbackContentValidationError(
        new URL(`${depth}.json`, floorsDir).pathname,
        null,
        `missing floor definition for depth ${depth}`,
      );
    }
  }

  return map;
};

const resolveReferences = <T>(
  fileLabel: string,
  ids: readonly string[],
  table: ReadonlyMap<string, T>,
  entityLabel: string,
): readonly T[] =>
  ids.map((id) => {
    const entity = table.get(id);
    if (entity === undefined) {
      throw new FallbackContentValidationError(
        fileLabel,
        id,
        `unknown ${entityLabel} id ${id}`,
      );
    }
    return entity;
  });

export const loadFallbackContentPack = (
  root: URL = defaultPackRoot,
): FallbackContentPack => ({
  root: root.pathname,
  items: parseEntityFile(
    new URL("items.json", root),
    ItemDefinitionSchema,
    "item",
  ),
  enemies: parseEntityFile(
    new URL("enemies.json", root),
    EnemyDefinitionSchema,
    "enemy",
  ),
  traps: parseEntityFile(
    new URL("traps.json", root),
    TrapDefinitionSchema,
    "trap",
  ),
  npcs: parseEntityFile(new URL("npcs.json", root), NpcDefinitionSchema, "npc"),
  quests: parseEntityFile(
    new URL("quests.json", root),
    QuestDefinitionSchema,
    "quest",
  ),
  floors: loadFloorFiles(root),
});

export const getFallbackFloor = (
  pack: FallbackContentPack,
  depth: number,
): ResolvedFallbackFloor => {
  const floor = pack.floors.get(depth);
  if (floor === undefined) {
    throw new FallbackContentValidationError(
      `${pack.root}/floors`,
      String(depth),
      `no floor definition for depth ${depth}`,
    );
  }

  const band = depthBandForDepth(depth);
  const fileLabel = `${pack.root}/floors/${depth}.json`;

  return {
    depth,
    band,
    flavor: floor.flavor,
    params: {
      bandOrSize: band,
      roomCountRange: config.runStructure.floorGeometry[band].rooms,
      flavor: floor.flavor,
    },
    roster: resolveReferences(
      fileLabel,
      floor.enemyRosterIds,
      pack.enemies,
      "enemy",
    ),
    items: resolveReferences(fileLabel, floor.itemIds, pack.items, "item"),
    traps: resolveReferences(fileLabel, floor.trapIds, pack.traps, "trap"),
    npcs: resolveReferences(fileLabel, floor.npcIds, pack.npcs, "npc"),
    quest:
      floor.questId === null
        ? null
        : (pack.quests.get(floor.questId) ??
          (() => {
            throw new FallbackContentValidationError(
              fileLabel,
              floor.questId,
              `unknown quest id ${floor.questId}`,
            );
          })()),
  };
};
