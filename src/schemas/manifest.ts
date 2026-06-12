import { z } from "zod";

import { bounds, config } from "../config/index.js";
import { nonEmptyString } from "./common.js";
import {
  DepthBandSchema,
  EnemyDefinitionSchema,
  ItemDefinitionSchema,
  NarrationBeatsSchema,
  NpcDefinitionSchema,
  QuestDefinitionSchema,
  TrapDefinitionSchema,
  type DepthBand,
} from "./entities/index.js";
import { PROTOCOL_VERSION } from "./protocol.js";

export const MANIFEST_LAYOUT_FLAVORS = [
  "open",
  "warren",
  "halls",
  "ring",
  "sanctum",
] as const;

export const ManifestLayoutFlavorSchema = z.enum(MANIFEST_LAYOUT_FLAVORS);

export const ManifestRoomCountRangeSchema = z
  .strictObject({
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  })
  .superRefine((range, ctx) => {
    if (range.min > range.max) {
      ctx.addIssue({
        code: "custom",
        path: ["min"],
        message: "roomCountRange.min must be less than or equal to max",
      });
    }
  });

export const ManifestParamsSchema = z.strictObject({
  bandOrSize: DepthBandSchema,
  roomCountRange: ManifestRoomCountRangeSchema,
  flavor: ManifestLayoutFlavorSchema,
  seed: nonEmptyString,
});

export const ManifestPlacementDistanceSchema = z.enum([
  "near_entrance",
  "far_from_entrance",
]);

export const ManifestPlacementHintSchema = z.strictObject({
  roomIndex: z.number().int().nonnegative().nullable(),
  distance: ManifestPlacementDistanceSchema.nullable(),
  spread: z.boolean(),
});

export const ManifestRosterEntrySchema = EnemyDefinitionSchema.extend({
  placementHint: ManifestPlacementHintSchema.nullable(),
});

export const ManifestItemEntrySchema = ItemDefinitionSchema.extend({
  placementHint: ManifestPlacementHintSchema.nullable(),
});

export const ManifestTrapEntrySchema = TrapDefinitionSchema.extend({
  placementHint: ManifestPlacementHintSchema.nullable(),
});

export const ManifestNpcEntrySchema = NpcDefinitionSchema.extend({
  placementHint: ManifestPlacementHintSchema.nullable(),
});

export const ManifestOriginTagsSummarySchema = z.strictObject({
  made: z.number().int().nonnegative(),
  old_stock: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
});

export const ManifestMetadataSchema = z.strictObject({
  originTags: ManifestOriginTagsSummarySchema,
  callbacks: z.array(nonEmptyString),
  signature: z.boolean(),
});

export const FloorManifestSchema = z
  .strictObject({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    depth: z.number().int().min(1).max(config.runStructure.depthFloors),
    band: DepthBandSchema,
    params: ManifestParamsSchema,
    roster: z.array(ManifestRosterEntrySchema),
    items: z
      .array(ManifestItemEntrySchema)
      .min(config.itemsEconomy.itemsPerFloor.min)
      .max(config.itemsEconomy.itemsPerFloor.max),
    traps: z
      .array(ManifestTrapEntrySchema)
      .min(bounds.trapsNpcsQuests.traps.perFloor.min)
      .max(bounds.trapsNpcsQuests.traps.perFloor.max),
    npcs: z
      .array(ManifestNpcEntrySchema)
      .min(bounds.trapsNpcsQuests.npcs.perFloor.min)
      .max(bounds.trapsNpcsQuests.npcs.perFloor.max),
    quest: QuestDefinitionSchema.nullable(),
    narration: NarrationBeatsSchema,
    metadata: ManifestMetadataSchema,
  })
  .superRefine((manifest, ctx) => {
    enforceBandConsistency(manifest, ctx);
  });

export type ManifestLayoutFlavor = z.infer<typeof ManifestLayoutFlavorSchema>;
export type ManifestRoomCountRange = z.infer<
  typeof ManifestRoomCountRangeSchema
>;
export type ManifestPlacementDistance = z.infer<
  typeof ManifestPlacementDistanceSchema
>;
export type ManifestPlacementHint = z.infer<typeof ManifestPlacementHintSchema>;
export type ManifestRosterEntry = z.infer<typeof ManifestRosterEntrySchema>;
export type ManifestItemEntry = z.infer<typeof ManifestItemEntrySchema>;
export type ManifestTrapEntry = z.infer<typeof ManifestTrapEntrySchema>;
export type ManifestNpcEntry = z.infer<typeof ManifestNpcEntrySchema>;
export type FloorManifest = z.infer<typeof FloorManifestSchema>;

export type ManifestParseError = {
  readonly path: string;
  readonly message: string;
};

export type ParseManifestResult =
  | { readonly ok: true; readonly manifest: FloorManifest }
  | { readonly ok: false; readonly errors: readonly ManifestParseError[] };

export const parseManifest = (raw: string): ParseManifestResult => {
  const extracted = extractFirstJsonObject(raw);
  if (!extracted.ok) {
    return {
      ok: false,
      errors: [{ path: "$", message: extracted.message }],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted.json);
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          path: "$",
          message:
            error instanceof Error
              ? `invalid JSON: ${error.message}`
              : "invalid JSON",
        },
      ],
    };
  }

  const result = FloorManifestSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => ({
        path: formatIssuePath(issue.path),
        message: issue.message,
      })),
    };
  }

  return { ok: true, manifest: result.data };
};

const enforceBandConsistency = (
  manifest: {
    readonly depth: number;
    readonly band: DepthBand;
    readonly params: {
      readonly bandOrSize: DepthBand;
      readonly roomCountRange: ManifestRoomCountRange;
      readonly flavor: ManifestLayoutFlavor;
    };
    readonly metadata: { readonly signature: boolean };
  },
  ctx: z.RefinementCtx,
): void => {
  const depthBand = config.runStructure.depthBands[manifest.band];
  if (
    manifest.depth < depthBand.minFloor ||
    manifest.depth > depthBand.maxFloor
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["depth"],
      message: `depth must be within the ${manifest.band} band (${depthBand.minFloor}-${depthBand.maxFloor})`,
    });
  }

  if (manifest.params.bandOrSize !== manifest.band) {
    ctx.addIssue({
      code: "custom",
      path: ["params", "bandOrSize"],
      message: "params.bandOrSize must match band",
    });
  }

  const geometry = config.runStructure.floorGeometry[manifest.band];
  if (manifest.params.roomCountRange.min < geometry.rooms.min) {
    ctx.addIssue({
      code: "custom",
      path: ["params", "roomCountRange", "min"],
      message: `roomCountRange.min must be at least ${geometry.rooms.min} for ${manifest.band}`,
    });
  }

  if (manifest.params.roomCountRange.max > geometry.rooms.max) {
    ctx.addIssue({
      code: "custom",
      path: ["params", "roomCountRange", "max"],
      message: `roomCountRange.max must be at most ${geometry.rooms.max} for ${manifest.band}`,
    });
  }

  if (
    !(geometry.layoutFlavors as readonly string[]).includes(
      manifest.params.flavor,
    )
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["params", "flavor"],
      message: `flavor must be allowed for ${manifest.band}`,
    });
  }

  if (
    manifest.metadata.signature &&
    manifest.band !== bounds.directorManifest.signatureMomentBand
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["metadata", "signature"],
      message: `signature floors must be in the ${bounds.directorManifest.signatureMomentBand} band`,
    });
  }
};

const extractFirstJsonObject = (
  raw: string,
):
  | { readonly ok: true; readonly json: string }
  | { readonly ok: false; readonly message: string } => {
  const text = stripMarkdownFence(raw);
  const start = text.indexOf("{");

  if (start === -1) {
    return { ok: false, message: "no JSON object found" };
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return { ok: true, json: text.slice(start, index + 1) };
      }
    }
  }

  return { ok: false, message: "unterminated JSON object" };
};

const stripMarkdownFence = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```$/);
  return fenced?.[1]?.trim() ?? trimmed;
};

const formatIssuePath = (path: readonly PropertyKey[]): string => {
  if (path.length === 0) {
    return "$";
  }

  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === "number") {
      return `${formatted}[${segment}]`;
    }

    if (typeof segment === "symbol") {
      return `${formatted}[${JSON.stringify(String(segment))}]`;
    }

    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
      return `${formatted}.${segment}`;
    }

    return `${formatted}[${JSON.stringify(segment)}]`;
  }, "$");
};
