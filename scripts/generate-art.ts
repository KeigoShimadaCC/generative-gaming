#!/usr/bin/env tsx
/**
 * Batch-generate themed sprites via ArtDirector and write accepted manifests to
 * content/art/generated/. Sequential (one codex invocation at a time).
 *
 * Usage:
 *   pnpm run generate-art -- --help
 *   pnpm run generate-art -- --dry-run
 *   pnpm exec tsx scripts/generate-art.ts --theme=torchlit-limestone --entity=enemy.brute
 */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createArtDirector } from "../src/art/art-director.js";
import { parseGeneratedArtIndex } from "../src/art/atlas.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED_ROOT = join(ROOT, "content/art/generated");
const GENERATED_INDEX_PATH = join(GENERATED_ROOT, "index.json");
const GENERATED_ART_VERSION = "everdeep.art-generated.v1";
const GENERATED_ART_INDEX_VERSION = "everdeep.art-generated-index.v1";

type ThemeConfig = {
  readonly id: string;
  readonly band: string;
  readonly seed: string;
  readonly paletteHint: readonly string[];
};

type EntityConfig = {
  readonly entityId: string;
  readonly role: string;
  readonly size: 16 | 24;
  readonly fallbackSpriteId: string;
  readonly prompt: string;
};

const THEMES: readonly ThemeConfig[] = [
  {
    id: "torchlit-limestone",
    band: "shallows",
    seed: "art-batch-shallows",
    paletteHint: ["#151a14", "#3a4450", "#89965d", "#c7a55a"],
  },
  {
    id: "ferrous-fungal-middle",
    band: "middle",
    seed: "art-batch-middle",
    paletteHint: ["#101417", "#2f4d4d", "#7b4f8f", "#d0a04a"],
  },
  {
    id: "void-ember-lowest",
    band: "lowest",
    seed: "art-batch-lowest",
    paletteHint: ["#0a0a0c", "#1a1520", "#ff6b2b", "#4ac8e8"],
  },
];

const CORE_ENTITIES: readonly EntityConfig[] = [
  {
    entityId: "actor.player",
    role: "player",
    size: 16,
    fallbackSpriteId: "actor.player",
    prompt: "a torch-lit cave delver with a clear silhouette and lantern glow",
  },
  {
    entityId: "enemy.brute",
    role: "enemy",
    size: 16,
    fallbackSpriteId: "enemy.brute",
    prompt: "a squat cave brute with heavy limbs and a readable threat pose",
  },
  {
    entityId: "enemy.skirmisher",
    role: "enemy",
    size: 16,
    fallbackSpriteId: "enemy.skirmisher",
    prompt: "a lean cave skirmisher poised to dart and strike",
  },
  {
    entityId: "enemy.caster",
    role: "enemy",
    size: 16,
    fallbackSpriteId: "enemy.caster",
    prompt: "a hunched cave caster with a bright focal glow or spore lantern",
  },
  {
    entityId: "terrain.wall",
    role: "terrain",
    size: 16,
    fallbackSpriteId: "terrain.wall",
    prompt: "a chunky stone wall tile that fills the cell edge-to-edge",
  },
  {
    entityId: "terrain.floor",
    role: "terrain",
    size: 16,
    fallbackSpriteId: "terrain.floor",
    prompt: "a stone floor tile with subtle wear and band-appropriate tint",
  },
  {
    entityId: "feature.hoard",
    role: "feature",
    size: 24,
    fallbackSpriteId: "feature.hoard",
    prompt: "a treasure hoard pile with coins and glinting highlights",
  },
];

const HELP_TEXT = `generate-art — batch themed sprite generation for Everdeep

Writes accepted manifests to content/art/generated/<themeId>/<entityId>.json
and updates content/art/generated/index.json.

Commands:
  (default)     Generate sprites sequentially via ArtDirector + Art Gauntlet
  --dry-run     Print planned (theme, entity) pairs without calling codex
  --list        Alias for --dry-run
  --help, -h    Show this help

Filters (combine as needed):
  --theme=<id>       Only run one configured theme (e.g. torchlit-limestone)
  --entity=<id>      Only run one configured entity (e.g. enemy.brute)

Environment:
  ART=fallback    Skip provider calls (all sprites remain fallback; dry summary)

Examples:
  pnpm run generate-art --dry-run
  pnpm dlx tsx scripts/generate-art.ts --theme=ferrous-fungal-middle --entity=enemy.caster
`;

type ParsedArgs = {
  readonly flags: Set<string>;
  readonly themeFilter: string | null;
  readonly entityFilter: string | null;
};

type PlannedPair = EntityConfig &
  ThemeConfig & {
    readonly themeId: string;
  };

const parseArgs = (argv: readonly string[]): ParsedArgs => {
  const flags = new Set<string>();
  let themeFilter: string | null = null;
  let entityFilter: string | null = null;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      flags.add("help");
      continue;
    }
    if (arg === "--dry-run" || arg === "--list") {
      flags.add("dry-run");
      continue;
    }
    if (arg.startsWith("--theme=")) {
      themeFilter = arg.slice("--theme=".length);
      continue;
    }
    if (arg.startsWith("--entity=")) {
      entityFilter = arg.slice("--entity=".length);
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return { flags, themeFilter, entityFilter };
};

const plannedPairs = ({
  themeFilter,
  entityFilter,
}: {
  readonly themeFilter: string | null;
  readonly entityFilter: string | null;
}): PlannedPair[] => {
  const themes = THEMES.filter(
    (theme) => themeFilter === null || theme.id === themeFilter,
  );
  const entities = CORE_ENTITIES.filter(
    (entity) => entityFilter === null || entity.entityId === entityFilter,
  );

  if (themeFilter !== null && themes.length === 0) {
    throw new Error(`unknown theme: ${themeFilter}`);
  }
  if (entityFilter !== null && entities.length === 0) {
    throw new Error(`unknown entity: ${entityFilter}`);
  }

  return themes.flatMap((theme) =>
    entities.map((entity) => ({
      themeId: theme.id,
      band: theme.band,
      seed: theme.seed,
      paletteHint: theme.paletteHint,
      ...entity,
    })),
  );
};

const printPlannedPairs = (pairs: readonly PlannedPair[]): void => {
  console.log(`Planned ${pairs.length} sprite generation pair(s):`);
  for (const pair of pairs) {
    console.log(
      `  - theme=${pair.themeId} band=${pair.band} entity=${pair.entityId} seed=${pair.seed}`,
    );
  }
};

const runGeneration = async (argv: readonly string[]): Promise<void> => {
  const { flags, themeFilter, entityFilter } = parseArgs(argv);

  if (flags.has("help")) {
    console.log(HELP_TEXT);
    return;
  }

  const pairs = plannedPairs({ themeFilter, entityFilter });

  if (flags.has("dry-run")) {
    printPlannedPairs(pairs);
    return;
  }

  printPlannedPairs(pairs);

  const director = createArtDirector({
    artifacts: {
      rootDir: "runs/art-batch",
      runId: `batch-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    },
  });

  mkdirSync(GENERATED_ROOT, { recursive: true });

  const themesById = new Map<
    string,
    {
      readonly themeId: string;
      readonly seed: string;
      readonly sprites: { entityId: string; path: string }[];
    }
  >();

  let generated = 0;
  let accepted = 0;
  let fallback = 0;

  for (const pair of pairs) {
    generated += 1;
    console.log(
      `\n=== Generating ${pair.themeId}/${pair.entityId} (${pair.band}) ===`,
    );

    const result = await director.generateSprites({
      themeId: pair.themeId,
      seed: pair.seed,
      sprites: [
        {
          entityId: pair.entityId,
          role: pair.role,
          size: pair.size,
          fallbackSpriteId: pair.fallbackSpriteId,
          prompt: pair.prompt,
          paletteHint: pair.paletteHint,
        },
      ],
    });

    const acceptedSprite = result.accepted[0];
    if (acceptedSprite === undefined) {
      fallback += 1;
      const rejected = result.rejected[0];
      console.log(
        `  fallback: ${rejected?.reason ?? "rejected by Art Gauntlet"}`,
      );
      continue;
    }

    accepted += 1;
    const themeDir = join(GENERATED_ROOT, pair.themeId);
    mkdirSync(themeDir, { recursive: true });

    const relativePath = `${pair.themeId}/${pair.entityId}.json`;
    const absolutePath = join(GENERATED_ROOT, relativePath);
    const record = {
      version: GENERATED_ART_VERSION,
      themeId: pair.themeId,
      entityId: pair.entityId,
      seed: pair.seed,
      manifest: acceptedSprite.manifest,
    };

    writeFileSync(absolutePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const existing = themesById.get(pair.themeId) ?? {
      themeId: pair.themeId,
      seed: pair.seed,
      sprites: [],
    };
    const sprites = existing.sprites.filter(
      (sprite) => sprite.entityId !== pair.entityId,
    );
    sprites.push({ entityId: pair.entityId, path: relativePath });
    sprites.sort((left, right) => left.entityId.localeCompare(right.entityId));
    themesById.set(pair.themeId, { ...existing, sprites });

    console.log(`  accepted -> ${relativePath}`);
  }

  const existingIndex = parseGeneratedArtIndex(
    JSON.parse(readFileSync(GENERATED_INDEX_PATH, "utf8")),
  );
  const preservedThemes =
    existingIndex.ok === true
      ? existingIndex.index.themes.filter(
          (theme) => !themesById.has(theme.themeId),
        )
      : [];

  const mergedThemes = [...preservedThemes, ...themesById.values()].sort(
    (left, right) => left.themeId.localeCompare(right.themeId),
  );

  const index = {
    version: GENERATED_ART_INDEX_VERSION,
    themes: mergedThemes,
  };

  writeFileSync(
    GENERATED_INDEX_PATH,
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8",
  );

  console.log("\n=== Summary ===");
  console.log(`generated: ${generated}`);
  console.log(`accepted:  ${accepted}`);
  console.log(`fallback:  ${fallback}`);
  console.log(`index:     ${GENERATED_INDEX_PATH}`);
};

runGeneration(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
