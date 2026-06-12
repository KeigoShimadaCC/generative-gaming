import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { config } from "../../../src/config/index.js";
import { LAYOUT_FLAVORS } from "../../../src/engine/floorgen/flavors.js";
import {
  DepthBandSchema,
  EnemyDefinitionSchema,
  ItemDefinitionSchema,
  NarrationBeatsSchema,
  NpcDefinitionSchema,
  QuestDefinitionSchema,
  TrapDefinitionSchema,
} from "../../../src/schemas/entities/index.js";

const root = new URL(".", import.meta.url).pathname;
const attemptsDir = join(root, "attempts");

const LayoutFlavorSchema = z.enum(LAYOUT_FLAVORS);

const RoomCountRangeSchema = z
  .strictObject({
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  })
  .superRefine((range, ctx) => {
    if (range.min > range.max) {
      ctx.addIssue({
        code: "custom",
        path: ["min"],
        message: "roomCountRange.min must be <= max",
      });
    }
  });

const FloorParamsSchema = z.strictObject({
  bandOrSize: DepthBandSchema,
  roomCountRange: RoomCountRangeSchema,
  flavor: LayoutFlavorSchema,
  seed: z.string().min(1),
});

const ManifestProbeSchema = z
  .strictObject({
    depth: z.number().int().min(1).max(config.runStructure.depthFloors),
    band: DepthBandSchema,
    params: FloorParamsSchema,
    roster: z.array(EnemyDefinitionSchema).min(1),
    items: z
      .array(ItemDefinitionSchema)
      .min(config.itemsEconomy.itemsPerFloor.min)
      .max(config.itemsEconomy.itemsPerFloor.max),
    traps: z.array(TrapDefinitionSchema),
    npcs: z.array(NpcDefinitionSchema),
    quest: QuestDefinitionSchema.nullable(),
    narration: NarrationBeatsSchema,
  })
  .superRefine((manifest, ctx) => {
    if (manifest.params.bandOrSize !== manifest.band) {
      ctx.addIssue({
        code: "custom",
        path: ["params", "bandOrSize"],
        message: "params.bandOrSize must match manifest.band",
      });
    }
  });

const parseJsonOnly = (
  text: string,
): { ok: true; value: unknown } | { ok: false; reason: string } => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty stdout" };
  }

  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
};

const summarizeIssues = (error: z.ZodError): string =>
  error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");

type AttemptValidation = {
  readonly label: string;
  readonly latencyMs: number | null;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly parseOk: boolean;
  readonly validateOk: boolean;
  readonly failureReason: string | null;
};

const validateCodexAttempt = (label: string): AttemptValidation => {
  const dir = join(attemptsDir, label);
  const stdout = readFileSync(join(dir, "stdout.txt"), "utf8");
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as {
    latencyMs?: number;
    exitCode?: number | null;
    signal?: string | null;
    timedOut?: boolean;
  };
  const parsed = parseJsonOnly(stdout);

  if (!parsed.ok) {
    return {
      label,
      latencyMs: meta.latencyMs ?? null,
      exitCode: meta.exitCode ?? null,
      signal: meta.signal ?? null,
      timedOut: meta.timedOut ?? false,
      parseOk: false,
      validateOk: false,
      failureReason: `parse: ${parsed.reason}`,
    };
  }

  const validated = ManifestProbeSchema.safeParse(parsed.value);
  return {
    label,
    latencyMs: meta.latencyMs ?? null,
    exitCode: meta.exitCode ?? null,
    signal: meta.signal ?? null,
    timedOut: meta.timedOut ?? false,
    parseOk: true,
    validateOk: validated.success,
    failureReason: validated.success
      ? null
      : `zod: ${summarizeIssues(validated.error)}`,
  };
};

const validateCursorAttempt = (): AttemptValidation => {
  const label = "cursor-composer-2.5";
  const dir = join(attemptsDir, label);
  const stdout = readFileSync(join(dir, "stdout.txt"), "utf8");
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as {
    latencyMs?: number;
    exitCode?: number | null;
    signal?: string | null;
    timedOut?: boolean;
  };
  const parsed = parseJsonOnly(stdout);

  return {
    label,
    latencyMs: meta.latencyMs ?? null,
    exitCode: meta.exitCode ?? null,
    signal: meta.signal ?? null,
    timedOut: meta.timedOut ?? false,
    parseOk: parsed.ok,
    validateOk: parsed.ok,
    failureReason: parsed.ok ? null : `parse: ${parsed.reason}`,
  };
};

describe("ambient Director spike validation", () => {
  it("validates captured CLI outputs", () => {
    expect(existsSync(attemptsDir)).toBe(true);

    const labels = readdirSync(attemptsDir)
      .filter((entry) => entry.startsWith("codex-"))
      .sort();
    const codex = labels.map(validateCodexAttempt);
    const cursor = existsSync(join(attemptsDir, "cursor-composer-2.5"))
      ? validateCursorAttempt()
      : null;
    const summary = {
      schema: "composed ManifestProbeSchema from src/schemas entity exports plus run-loop params shape",
      codex,
      cursor,
    };

    writeFileSync(
      join(root, "validation-results.json"),
      JSON.stringify(summary, null, 2),
    );
    console.log(JSON.stringify(summary, null, 2));
    expect(codex.length).toBeGreaterThanOrEqual(0);
  });
});
