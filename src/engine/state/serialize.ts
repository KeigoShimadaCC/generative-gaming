import { z } from "zod";

import { bounds, config } from "../../config/index.js";
import { nonEmptyString } from "../../schemas/common.js";
import {
  DepthBandSchema,
  EnemyDefinitionSchema,
  ItemDefinitionSchema,
  NpcDefinitionSchema,
  QuestDefinitionSchema,
  TrapDefinitionSchema,
} from "../../schemas/entities/index.js";
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
} from "../../schemas/protocol.js";
import { StatusApplicationSchema } from "../../schemas/vocab/index.js";
import { depthBandForDepth } from "./init.js";
import {
  ACTIVE_TERMINAL_STATUS,
  type EntityId,
  type EntityInstance,
  type GameState,
  type SerializableRecord,
  type SerializableValue,
} from "./types.js";

const JsonValueSchema: z.ZodType<SerializableValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const SerializableRecordSchema: z.ZodType<SerializableRecord> = z.record(
  z.string(),
  JsonValueSchema,
);

const EntityIdSchema = z
  .string()
  .regex(/^(enemy|npc|item|trap)#[1-9][0-9]*$/) as z.ZodType<EntityId>;

const PositionSchema = z.strictObject({
  x: z.number().int(),
  y: z.number().int(),
});

const TerminalStatusSchema = z.enum([
  ACTIVE_TERMINAL_STATUS,
  config.runStructure.terminalStates.win,
  config.runStructure.terminalStates.loss,
  config.runStructure.terminalStates.abort,
]);

const VersionStampSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  engineVersion: z.literal(ENGINE_VERSION),
});

const ItemKnowledgeStateSchema = z.strictObject({
  identifiedDefinitionIds: z.array(nonEmptyString),
  bonusRevealedItemInstanceIds: z.array(nonEmptyString),
  chargesByItemInstanceId: z.record(
    nonEmptyString,
    z.number().int().nonnegative(),
  ),
});

const RunMetaSchema = z
  .strictObject({
    runId: nonEmptyString,
    seed: z.string(),
    depth: z.number().int(),
    band: DepthBandSchema,
    turn: z.number().int().nonnegative(),
    terminalStatus: TerminalStatusSchema,
    itemKnowledge: ItemKnowledgeStateSchema,
  })
  .superRefine((run, ctx) => {
    const expectedBand = expectedBandFor(run.depth, ctx, ["band"]);

    if (expectedBand !== null && run.band !== expectedBand) {
      ctx.addIssue({
        code: "custom",
        path: ["band"],
        message: `band must be derived from depth as ${expectedBand}`,
      });
    }
  });

const FloorGeometrySlotSchema = z.strictObject({
  refId: nonEmptyString,
  opaque: SerializableRecordSchema.nullable(),
});

const FloorStateSchema = z
  .strictObject({
    floorId: nonEmptyString,
    depth: z.number().int(),
    band: DepthBandSchema,
    geometry: FloorGeometrySlotSchema,
  })
  .superRefine((floor, ctx) => {
    const expectedBand = expectedBandFor(floor.depth, ctx, ["band"]);

    if (expectedBand !== null && floor.band !== expectedBand) {
      ctx.addIssue({
        code: "custom",
        path: ["band"],
        message: `band must be derived from depth as ${expectedBand}`,
      });
    }
  });

const PlayerItemStackSchema = z.strictObject({
  itemInstanceId: nonEmptyString,
  definition: ItemDefinitionSchema,
  quantity: z
    .number()
    .int()
    .positive()
    .max(config.playerCharacter.inventory.identicalConsumableStackLimit),
  identified: z.boolean(),
});

const PlayerStateSchema = z
  .strictObject({
    hp: z.strictObject({
      current: z.number().int().nonnegative().max(bounds.playerCharacter.hpCap),
      max: z.number().int().positive().max(bounds.playerCharacter.hpCap),
    }),
    level: z
      .number()
      .int()
      .min(config.playerCharacter.stats.level.start)
      .max(bounds.playerCharacter.levelCap),
    xp: z.number().int().nonnegative(),
    fullness: z.strictObject({
      current: z
        .number()
        .int()
        .nonnegative()
        .max(bounds.playerCharacter.overfedFullnessCap),
      max: z
        .number()
        .int()
        .positive()
        .max(bounds.playerCharacter.overfedFullnessCap),
    }),
    position: PositionSchema,
    inventory: z
      .array(PlayerItemStackSchema.nullable())
      .length(config.playerCharacter.inventory.slots),
    equipment: z.strictObject({
      weapon: PlayerItemStackSchema.nullable(),
      armor: PlayerItemStackSchema.nullable(),
      charms: z
        .array(PlayerItemStackSchema.nullable())
        .length(config.playerCharacter.equipmentSlots.charms),
    }),
    statuses: z.array(StatusApplicationSchema),
  })
  .superRefine((player, ctx) => {
    if (player.hp.current > player.hp.max) {
      ctx.addIssue({
        code: "custom",
        path: ["hp", "current"],
        message: "current HP must not exceed max HP",
      });
    }

    if (player.fullness.current > player.fullness.max) {
      ctx.addIssue({
        code: "custom",
        path: ["fullness", "current"],
        message: "current fullness must not exceed max fullness",
      });
    }
  });

const EntityRuntimeFieldsSchema = {
  id: EntityIdSchema,
  position: PositionSchema,
  currentHP: z.number().int().nonnegative().nullable(),
  statuses: z.array(StatusApplicationSchema),
  behaviorRuntime: SerializableRecordSchema,
} as const;

const EnemyEntityInstanceSchema = z.strictObject({
  ...EntityRuntimeFieldsSchema,
  kind: z.literal("enemy"),
  definition: EnemyDefinitionSchema,
  currentHP: z.number().int().nonnegative(),
});

const NpcEntityInstanceSchema = z.strictObject({
  ...EntityRuntimeFieldsSchema,
  kind: z.literal("npc"),
  definition: NpcDefinitionSchema,
  dialogueRuntime: SerializableRecordSchema,
});

const GroundItemEntityInstanceSchema = z.strictObject({
  ...EntityRuntimeFieldsSchema,
  kind: z.literal("item"),
  definition: ItemDefinitionSchema,
  currentHP: z.null(),
  quantity: z
    .number()
    .int()
    .positive()
    .max(config.playerCharacter.inventory.identicalConsumableStackLimit),
  identified: z.boolean(),
});

const TrapEntityInstanceSchema = z.strictObject({
  ...EntityRuntimeFieldsSchema,
  kind: z.literal("trap"),
  definition: TrapDefinitionSchema,
  currentHP: z.null(),
  armed: z.boolean(),
});

const EntityInstanceSchema: z.ZodType<EntityInstance> = z.discriminatedUnion(
  "kind",
  [
    EnemyEntityInstanceSchema,
    NpcEntityInstanceSchema,
    GroundItemEntityInstanceSchema,
    TrapEntityInstanceSchema,
  ],
);

const EntityMapSchema = z
  .record(nonEmptyString, EntityInstanceSchema)
  .superRefine((entities, ctx) => {
    for (const [id, entity] of Object.entries(entities)) {
      if (entity.id !== id) {
        ctx.addIssue({
          code: "custom",
          path: [id, "id"],
          message: "entity map key must match entity id",
        });
      }
    }
  });

const QuestRuntimeStatusSchema = z.enum([
  "available",
  "active",
  "completed",
  "failed",
]);

const QuestRuntimeSchema = z.strictObject({
  definition: QuestDefinitionSchema,
  status: QuestRuntimeStatusSchema,
  progress: SerializableRecordSchema,
});

const QuestStateSchema = z
  .strictObject({
    quests: z.record(nonEmptyString, QuestRuntimeSchema),
    activeQuestIds: z.array(nonEmptyString),
    completedQuestIds: z.array(nonEmptyString),
    failedQuestIds: z.array(nonEmptyString),
  })
  .superRefine((questState, ctx) => {
    for (const [id, quest] of Object.entries(questState.quests)) {
      if (quest.definition.id !== id) {
        ctx.addIssue({
          code: "custom",
          path: ["quests", id, "definition", "id"],
          message: "quest map key must match quest definition id",
        });
      }
    }
  });

const LogEventSchema = z.strictObject({
  turn: z.number().int().nonnegative(),
  type: nonEmptyString,
  data: SerializableRecordSchema,
});

const RngStreamCursorSchema = z.strictObject({
  streamId: nonEmptyString,
  seed: z.string(),
  parentStreamId: nonEmptyString.nullable(),
  draws: z.number().int().nonnegative(),
});

const RngStateSchema = z
  .strictObject({
    rootSeed: z.string(),
    streams: z.record(nonEmptyString, RngStreamCursorSchema),
  })
  .superRefine((rng, ctx) => {
    for (const [streamId, stream] of Object.entries(rng.streams)) {
      if (stream.streamId !== streamId) {
        ctx.addIssue({
          code: "custom",
          path: ["streams", streamId, "streamId"],
          message: "rng stream map key must match streamId",
        });
      }
    }
  });

const EntityIdCountersSchema = z.strictObject({
  enemy: z.number().int().nonnegative(),
  npc: z.number().int().nonnegative(),
  item: z.number().int().nonnegative(),
  trap: z.number().int().nonnegative(),
});

const IdStateSchema = z.strictObject({
  entityCounters: EntityIdCountersSchema,
});

export const GameStateSchema = z
  .strictObject({
    version: VersionStampSchema,
    run: RunMetaSchema,
    floor: FloorStateSchema,
    player: PlayerStateSchema,
    entities: EntityMapSchema,
    quests: QuestStateSchema,
    log: z.array(LogEventSchema),
    rng: RngStateSchema,
    ids: IdStateSchema,
  })
  .superRefine((state, ctx) => {
    if (state.run.depth !== state.floor.depth) {
      ctx.addIssue({
        code: "custom",
        path: ["floor", "depth"],
        message: "floor depth must match run depth",
      });
    }

    if (state.run.band !== state.floor.band) {
      ctx.addIssue({
        code: "custom",
        path: ["floor", "band"],
        message: "floor band must match run band",
      });
    }

    if (state.rng.rootSeed !== state.run.seed) {
      ctx.addIssue({
        code: "custom",
        path: ["rng", "rootSeed"],
        message: "rng root seed must match run seed",
      });
    }
  });

export const serialize = (state: GameState): string => {
  const parsed = GameStateSchema.parse(state);
  return stableStringify(parsed);
};

export const deserialize = (serialized: string): GameState => {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(serialized);
  } catch (error) {
    throw new Error(
      `Invalid GameState JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const result = GameStateSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(`Invalid GameState: ${formatIssues(result.error.issues)}`);
  }

  return result.data as unknown as GameState;
};

const expectedBandFor = (
  depth: number,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): string | null => {
  try {
    return depthBandForDepth(depth);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      path,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const stableStringify = (value: unknown): string => {
  const serialized = JSON.stringify(sortObjectKeys(value));

  if (serialized === undefined) {
    throw new Error("GameState serialization produced no JSON");
  }

  return serialized;
};

const sortObjectKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }

  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    const objectValue = value as Record<string, unknown>;

    for (const key of Object.keys(objectValue).sort()) {
      sorted[key] = sortObjectKeys(objectValue[key]);
    }

    return sorted;
  }

  return value;
};

const formatIssues = (issues: readonly z.core.$ZodIssue[]): string =>
  issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
