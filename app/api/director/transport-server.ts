import { bounds, config } from "../../../src/config/index.js";
import {
  defaultGate2Config,
  type Gate2Config,
  type Gate2RunOptions
} from "../../../src/gauntlet/gate2/run.js";
import {
  createTransportHandlers,
  type RunControllerRegistry,
  type TransportHandlers
} from "../../../src/director/orchestration/transport.js";
import {
  createPrefetchController,
  type PrefetchController
} from "../../../src/director/orchestration/prefetch.js";
import type { PrefetchClock } from "../../../src/director/orchestration/types.js";
import type { ServedFloor } from "../../../src/director/orchestration/types.js";
import { AmbientDirectorProvider } from "../../../src/director/provider/ambient.js";
import { MockDirectorProvider } from "../../../src/director/provider/mock.js";
import {
  failure,
  type DirectorProvider,
  type GenerateManifestOptions,
  type JudgeOptions,
  type JudgeResult,
  type ProviderResult
} from "../../../src/director/provider/types.js";
import type {
  FloorContent,
  FloorContentProvider,
  HoardFeatureParams
} from "../../../src/engine/run/index.js";
import type { LayoutFlavor } from "../../../src/engine/floorgen/flavors.js";
import { depthBandForDepth } from "../../../src/engine/state/init.js";
import {
  MemoryArtifactFs,
  type ArtifactReadOptions,
  type WriteGenerationRecordOptions
} from "../../../src/harness/artifacts/index.js";
import type { ArtifactFsAdapter } from "../../../src/harness/artifacts/fs.js";
import { traceRunId } from "../../../src/harness/trace/recorder.js";
import type {
  DepthBand,
  EnemyDefinition,
  ItemDefinition,
  NpcDefinition,
  QuestDefinition,
  TrapDefinition
} from "../../../src/schemas/entities/index.js";
import {
  validLowestManifestFixture,
  validMiddleManifestFixture,
  validShallowsManifestFixture
} from "../../../src/schemas/fixtures/manifest.js";
import type {
  FloorManifest,
  ManifestItemEntry,
  ManifestRosterEntry
} from "../../../src/schemas/manifest.js";
import fallbackEnemiesJson from "../../../content/fallback/enemies.json" with { type: "json" };
import fallbackFloor10Json from "../../../content/fallback/floors/10.json" with { type: "json" };
import fallbackFloor11Json from "../../../content/fallback/floors/11.json" with { type: "json" };
import fallbackFloor12Json from "../../../content/fallback/floors/12.json" with { type: "json" };
import fallbackFloor1Json from "../../../content/fallback/floors/1.json" with { type: "json" };
import fallbackFloor2Json from "../../../content/fallback/floors/2.json" with { type: "json" };
import fallbackFloor3Json from "../../../content/fallback/floors/3.json" with { type: "json" };
import fallbackFloor4Json from "../../../content/fallback/floors/4.json" with { type: "json" };
import fallbackFloor5Json from "../../../content/fallback/floors/5.json" with { type: "json" };
import fallbackFloor6Json from "../../../content/fallback/floors/6.json" with { type: "json" };
import fallbackFloor7Json from "../../../content/fallback/floors/7.json" with { type: "json" };
import fallbackFloor8Json from "../../../content/fallback/floors/8.json" with { type: "json" };
import fallbackFloor9Json from "../../../content/fallback/floors/9.json" with { type: "json" };
import fallbackItemsJson from "../../../content/fallback/items.json" with { type: "json" };
import fallbackNpcsJson from "../../../content/fallback/npcs.json" with { type: "json" };
import fallbackQuestsJson from "../../../content/fallback/quests.json" with { type: "json" };
import fallbackTrapsJson from "../../../content/fallback/traps.json" with { type: "json" };

const ROOT_DIR = "runs";
const DEFAULT_SEED = "web-transport";
const SEED = process.env.SEED?.trim() || DEFAULT_SEED;
const MODEL_ID = "mock-web-transport";
const FALLBACK_MODEL_ID = "fallback-web-transport";
const SERVER_STARTED_AT = new Date().toISOString();

const isAmbientDirector = (): boolean => process.env.AMBIENT === "1";
const isFallbackDirector = (): boolean => process.env.DIRECTOR === "fallback";
const isRealAmbient = (): boolean => process.env.AMBIENT_REAL === "1";

const relaxGate2Threshold = (
  threshold: Gate2Config["thresholdsByBand"]["shallows"]
): Gate2Config["thresholdsByBand"]["shallows"] => ({
  ...threshold,
  clearRateMinPercent: 0,
  medianHpRetentionPercent: {
    ...threshold.medianHpRetentionPercent,
    max: 100
  },
  hardRejects: {
    ...threshold.hardRejects,
    clearRateBelowPercent: 0
  }
});

const passingGate2 = (): Gate2RunOptions => {
  const base = defaultGate2Config(validShallowsManifestFixture);

  return {
    config: {
      ...base,
      policies: ["balanced", "aggressive"],
      seeds: ["web-gate2-a", "web-gate2-b"],
      maxTurns: 120,
      wallClockBudgetMs: 1_000,
      thresholdsByBand: {
        shallows: relaxGate2Threshold(base.thresholdsByBand.shallows),
        middle: relaxGate2Threshold(base.thresholdsByBand.middle),
        lowest: relaxGate2Threshold(base.thresholdsByBand.lowest)
      }
    }
  };
};

const fixtureByBand = {
  shallows: validShallowsManifestFixture,
  middle: validMiddleManifestFixture,
  lowest: validLowestManifestFixture
} satisfies Readonly<Record<DepthBand, FloorManifest>>;

const healingItemIdsByBand = {
  shallows: "oldstock-sour-cordial",
  middle: "oldstock-bitter-purge",
  lowest: "oldstock-deep-cordial"
} satisfies Readonly<Record<DepthBand, string>>;

type FallbackItemEntry = Omit<ManifestItemEntry, "placementHint">;

const fallbackItems = fallbackItemsJson as readonly FallbackItemEntry[];

const healingItemsByBand = (): Readonly<Record<DepthBand, ManifestItemEntry>> => {
  const resolve = (band: DepthBand): ManifestItemEntry => {
    const itemId = healingItemIdsByBand[band];
    const item = fallbackItems.find((candidate) => candidate.id === itemId);
    if (item === undefined) {
      throw new Error(`fallback healing item ${itemId} is missing`);
    }

    return {
      ...item,
      placementHint: null
    };
  };

  return {
    shallows: resolve("shallows"),
    middle: resolve("middle"),
    lowest: resolve("lowest")
  };
};

const fallbackHealingItemsByBand = healingItemsByBand();

type FallbackFloorDefinition = {
  readonly depth: number;
  readonly flavor: LayoutFlavor;
  readonly enemyRosterIds: readonly string[];
  readonly itemIds: readonly string[];
  readonly trapIds: readonly string[];
  readonly npcIds: readonly string[];
  readonly questId: string | null;
};

type BundledFallbackFloor = {
  readonly params: Omit<FloorContent["params"], "seed">;
  readonly roster: readonly EnemyDefinition[];
  readonly items: readonly ItemDefinition[];
  readonly traps: readonly TrapDefinition[];
  readonly npcs: readonly NpcDefinition[];
  readonly quest: QuestDefinition | null;
};

const FALLBACK_FLOOR_DEFINITIONS = [
  fallbackFloor1Json,
  fallbackFloor2Json,
  fallbackFloor3Json,
  fallbackFloor4Json,
  fallbackFloor5Json,
  fallbackFloor6Json,
  fallbackFloor7Json,
  fallbackFloor8Json,
  fallbackFloor9Json,
  fallbackFloor10Json,
  fallbackFloor11Json,
  fallbackFloor12Json
] as readonly FallbackFloorDefinition[];

const DEFAULT_HOARD: HoardFeatureParams = {
  id: "hoard",
  name: "The Hoard",
  hint: { distance: "far_from_entrance" }
};

const FALLBACK_PROVIDER_TIMEOUT_MS = 1;
const AMBIENT_REAL_TIMEOUT_MS = 45_000;
const GENERATION_RECORD_FILENAME = "generation.json";

let prefetchRecordExistsWarned = false;

const isGenerationRecordPath = (path: string): boolean =>
  path.endsWith(`/${GENERATION_RECORD_FILENAME}`);

const warnPrefetchRecordExists = (): void => {
  if (prefetchRecordExistsWarned) {
    return;
  }
  prefetchRecordExistsWarned = true;
  console.warn(
    "web transport prefetch: generation record already exists; treating persist as no-op"
  );
};

const createIdempotentPrefetchArtifactFs = (
  inner: ArtifactFsAdapter
): ArtifactFsAdapter => ({
  makeDir: (path: string) => {
    inner.makeDir(path);
  },
  readFile: (path: string) => inner.readFile(path),
  writeFile: (path: string, contents: string) => {
    inner.writeFile(path, contents);
  },
  rename: (from: string, to: string) => {
    inner.rename(from, to);
  },
  listEntries: (path: string) => inner.listEntries(path),
  isDirectory: (path: string) => inner.isDirectory(path),
  fileExists: (path: string) => {
    if (isGenerationRecordPath(path) && inner.fileExists(path)) {
      return false;
    }
    return inner.fileExists(path);
  },
  writeNewFile: (path: string, contents: string) => {
    if (inner.fileExists(path)) {
      if (isGenerationRecordPath(path)) {
        warnPrefetchRecordExists();
      }
      return;
    }

    try {
      inner.writeNewFile(path, contents);
    } catch (error) {
      if (inner.fileExists(path)) {
        if (isGenerationRecordPath(path)) {
          warnPrefetchRecordExists();
        }
        return;
      }
      throw error;
    }
  }
});

const createPrefetchArtifactOptions = (
  artifacts: ArtifactReadOptions
): WriteGenerationRecordOptions => ({
  rootDir: artifacts.rootDir,
  fs: createIdempotentPrefetchArtifactFs(artifacts.fs ?? new MemoryArtifactFs())
});

const createPrefetchWallClock = (): PrefetchClock => {
  const startedAt = performance.now();

  return () => performance.now() - startedAt;
};

const serveBundledFallbackFloor = (
  depth: number,
  seed: string
): ServedFloor => {
  const content = bundledFallbackProvider.getFloor(depth, seed);

  return {
    content,
    source: "fallback",
    depth
  };
};

const entityTable = <T extends { readonly id: string }>(
  label: string,
  entries: readonly T[]
): ReadonlyMap<string, T> => {
  const table = new Map<string, T>();

  for (const entry of entries) {
    if (table.has(entry.id)) {
      throw new Error(`duplicate ${label} id ${entry.id}`);
    }
    table.set(entry.id, entry);
  }

  return table;
};

const resolveEntityIds = <T>(
  depth: number,
  label: string,
  ids: readonly string[],
  table: ReadonlyMap<string, T>
): readonly T[] =>
  ids.map((id) => {
    const entity = table.get(id);
    if (entity === undefined) {
      throw new Error(`fallback floor ${depth} references unknown ${label} ${id}`);
    }
    return entity;
  });

const buildBundledFallbackFloors = (): ReadonlyMap<number, BundledFallbackFloor> => {
  const enemies = entityTable("enemy", fallbackEnemiesJson as EnemyDefinition[]);
  const items = entityTable("item", fallbackItemsJson as ItemDefinition[]);
  const traps = entityTable("trap", fallbackTrapsJson as TrapDefinition[]);
  const npcs = entityTable("npc", fallbackNpcsJson as NpcDefinition[]);
  const quests = entityTable("quest", fallbackQuestsJson as QuestDefinition[]);
  const floors = new Map<number, BundledFallbackFloor>();

  for (const floor of FALLBACK_FLOOR_DEFINITIONS) {
    const band = depthBandForDepth(floor.depth);

    floors.set(floor.depth, {
      params: {
        bandOrSize: band,
        roomCountRange: config.runStructure.floorGeometry[band].rooms,
        flavor: floor.flavor
      },
      roster: resolveEntityIds(
        floor.depth,
        "enemy",
        floor.enemyRosterIds,
        enemies
      ),
      items: resolveEntityIds(floor.depth, "item", floor.itemIds, items),
      traps: resolveEntityIds(floor.depth, "trap", floor.trapIds, traps),
      npcs: resolveEntityIds(floor.depth, "npc", floor.npcIds, npcs),
      quest:
        floor.questId === null
          ? null
          : (quests.get(floor.questId) ??
            (() => {
              throw new Error(
                `fallback floor ${floor.depth} references unknown quest ${floor.questId}`
              );
            })())
    });
  }

  return floors;
};

const BUNDLED_FALLBACK_FLOORS = buildBundledFallbackFloors();

const FALLBACK_ENEMIES_BY_ID = entityTable(
  "enemy",
  fallbackEnemiesJson as EnemyDefinition[]
);

const FALLBACK_FLOOR_BY_DEPTH = new Map<number, FallbackFloorDefinition>(
  FALLBACK_FLOOR_DEFINITIONS.map((floor) => [floor.depth, floor])
);

type FallbackRosterMetrics = {
  readonly count: number;
  readonly xpTotal: number;
};

const fallbackRosterMetrics = (depth: number): FallbackRosterMetrics => {
  const floor = FALLBACK_FLOOR_BY_DEPTH.get(depth);
  if (floor === undefined) {
    throw new Error(`fallback floor ${depth} is not available for calibration`);
  }

  let xpTotal = 0;
  for (const enemyId of floor.enemyRosterIds) {
    const enemy = FALLBACK_ENEMIES_BY_ID.get(enemyId);
    if (enemy === undefined) {
      throw new Error(
        `fallback floor ${depth} references unknown enemy ${enemyId}`
      );
    }
    xpTotal += enemy.stats.xpYield;
  }

  return {
    count: floor.enemyRosterIds.length,
    xpTotal
  };
};

const distributeXpYields = (
  count: number,
  targetTotal: number,
  band: DepthBand
): readonly number[] => {
  const xpBounds = bounds.enemyDesign.statBudgetsByBand[band].xpYield;
  const yields = Array.from({ length: count }, () => xpBounds.min);
  let remaining = targetTotal - xpBounds.min * count;
  let guard = 0;

  while (remaining > 0 && guard < count * (xpBounds.max - xpBounds.min + 1)) {
    const slot = guard % count;
    if (yields[slot]! < xpBounds.max) {
      yields[slot]! += 1;
      remaining -= 1;
    }
    guard += 1;
  }

  return yields;
};

const deriveCalibratedRoster = (
  templates: readonly ManifestRosterEntry[],
  depth: number,
  band: DepthBand
): ManifestRosterEntry[] => {
  if (templates.length === 0) {
    throw new Error(`band ${band} fixture roster is empty`);
  }

  const { count, xpTotal } = fallbackRosterMetrics(depth);
  const xpYields = distributeXpYields(count, xpTotal, band);

  return xpYields.map((xpYield, index) => {
    const template = templates[index % templates.length]!;
    const idSuffix = index === 0 ? "" : `-c${index}`;

    return {
      ...template,
      id: `${template.id}-d${depth}${idSuffix}`,
      stats: {
        ...template.stats,
        xpYield
      }
    };
  });
};

const fallbackFloorHasGearKind = (
  depth: number,
  kind: "weapon" | "armor"
): boolean => {
  const floor = FALLBACK_FLOOR_BY_DEPTH.get(depth);
  if (floor === undefined) {
    return false;
  }

  return floor.itemIds.some((itemId) => {
    const item = fallbackItems.find((candidate) => candidate.id === itemId);
    return item?.kind === kind;
  });
};

const deriveCalibratedItems = (
  items: readonly ManifestItemEntry[],
  depth: number,
  band: DepthBand
): ManifestItemEntry[] => {
  const calibrated = [...items];
  const hasBandGear = (kind: "weapon" | "armor"): boolean =>
    calibrated.some((item) => item.kind === kind && item.value.band === band);

  const ensureBandGear = (kind: "weapon" | "armor"): void => {
    if (hasBandGear(kind)) {
      return;
    }

    const template = items.find(
      (item) => item.kind === kind && item.value.band === band
    );
    if (template === undefined) {
      throw new Error(`band ${band} fixture is missing a ${kind} template`);
    }

    calibrated.push({
      ...template,
      id: `${template.id}-d${depth}`,
      placementHint: null
    });
  };

  if (fallbackFloorHasGearKind(depth, "weapon")) {
    ensureBandGear("weapon");
  }
  if (fallbackFloorHasGearKind(depth, "armor")) {
    ensureBandGear("armor");
  }

  return calibrated;
};

class BundledFallbackFloorContentProvider implements FloorContentProvider {
  getFloor(depth: number, seed: string): FloorContent {
    const floor = BUNDLED_FALLBACK_FLOORS.get(depth);
    if (floor === undefined) {
      throw new Error(`fallback floor ${depth} is not available`);
    }

    return {
      params: {
        ...floor.params,
        seed,
        ...(depth === config.runStructure.depthFloors
          ? { hoard: DEFAULT_HOARD }
          : {})
      },
      roster: floor.roster,
      items: floor.items,
      traps: floor.traps,
      npcs: floor.npcs,
      ...(floor.quest === null ? {} : { quest: floor.quest })
    };
  }
}

const bundledFallbackProvider = new BundledFallbackFloorContentProvider();

class FallbackOnlyDirectorProvider implements DirectorProvider {
  private readonly judgeProvider = new MockDirectorProvider({ latencyMs: 0 });

  async generateManifest(
    _prompt: string,
    options: GenerateManifestOptions = {}
  ): Promise<ProviderResult> {
    void options;
    return failure(
      "process_error",
      "DIRECTOR=fallback serves calibrated fallback pack floors",
      { latencyMs: 0, tokens: null }
    );
  }

  async judge(
    prompt: string,
    options: JudgeOptions = {}
  ): Promise<JudgeResult> {
    return this.judgeProvider.judge(prompt, options);
  }
}

class DepthAwareFixtureProvider implements DirectorProvider {
  private readonly judgeProvider = new MockDirectorProvider({ latencyMs: 0 });

  async generateManifest(
    prompt: string,
    options: GenerateManifestOptions = {}
  ): Promise<ProviderResult> {
    void options;
    const depth = requestedDepth(prompt);
    const manifest = manifestForDepth(depth);

    return {
      ok: true,
      raw: JSON.stringify(manifest),
      manifest,
      usage: { latencyMs: 0, tokens: null }
    };
  }

  async judge(
    prompt: string,
    options: JudgeOptions = {}
  ): Promise<JudgeResult> {
    return this.judgeProvider.judge(prompt, options);
  }
}

const requestedDepth = (prompt: string): number => {
  const match = /Generate a new floor manifest for depth (\d+) in the/u.exec(
    prompt
  );
  if (match === null) {
    return validShallowsManifestFixture.depth;
  }

  return Number.parseInt(match[1] ?? "", 10);
};

const manifestForDepth = (depth: number): FloorManifest => {
  const band = depthBandForDepth(depth);
  const fixture = fixtureByBand[band];
  const roster = deriveCalibratedRoster(fixture.roster, depth, band);
  const items = deriveCalibratedItems(fixture.items, depth, band);

  return withFloorLocalRefs(
    withBandHealingItem({
      ...fixture,
      depth,
      band,
      params: {
        ...fixture.params,
        bandOrSize: band,
        seed: `web-transport-${band}-${depth}`
      },
      roster,
      items,
      metadata: {
        ...fixture.metadata,
        originTags: {
          ...fixture.metadata.originTags,
          made: roster.length
        }
      }
    } satisfies FloorManifest)
  );
};

const withBandHealingItem = (manifest: FloorManifest): FloorManifest => {
  const healingItem = fallbackHealingItemsByBand[manifest.band];
  if (manifest.items.some((item) => item.id === healingItem.id)) {
    return manifest;
  }

  return {
    ...manifest,
    items: [...manifest.items, healingItem]
  };
};

const withFloorLocalRefs = (manifest: FloorManifest): FloorManifest => {
  if (manifest.items.length < 2) {
    return manifest;
  }

  const [primaryItem, secondaryItem] = manifest.items;
  const patchQuest = (quest: QuestDefinition): QuestDefinition => {
    if (quest.objective.kind !== "fetch" || quest.objective.fetch === null) {
      return quest;
    }

    return {
      ...quest,
      objective: {
        ...quest.objective,
        fetch: {
          ...quest.objective.fetch,
          itemId: primaryItem!.id
        }
      }
    };
  };

  return {
    ...manifest,
    quest: manifest.quest === null ? null : patchQuest(manifest.quest),
    npcs: manifest.npcs.map((npc) => ({
      ...npc,
      merchantInventoryItemIds: [primaryItem!.id, secondaryItem!.id],
      questHook: npc.questHook === null ? null : patchQuest(npc.questHook)
    }))
  };
};

const createWebProvider = (): DirectorProvider => {
  if (isRealAmbient() || isAmbientDirector()) {
    return new AmbientDirectorProvider();
  }

  if (isFallbackDirector()) {
    return new FallbackOnlyDirectorProvider();
  }

  return new DepthAwareFixtureProvider();
};

const hasBundledFallbackProvider = (): boolean =>
  isRealAmbient() || isFallbackDirector() || isAmbientDirector();

const createWebFallbackProvider = (): FloorContentProvider | undefined =>
  hasBundledFallbackProvider() ? bundledFallbackProvider : undefined;

type WebTransportState = {
  readonly handlers: TransportHandlers;
  readonly artifacts: ArtifactReadOptions;
  readonly seed: string;
  readonly createdAt: string;
  readonly artifactRunId: string;
  readonly fallbackDirector: boolean;
  readonly ambientDirector: boolean;
  readonly realAmbientDirector: boolean;
  readonly usesAmbientProvider: boolean;
  readonly fallbackProvider: FloorContentProvider | undefined;
  readonly providerGenerationTimeoutMs: number | undefined;
};

const pendingGetFloorByKey = new Map<string, Promise<ServedFloor>>();

type WebTransportStateOptions = {
  readonly seed?: string;
  readonly createdAt?: string;
  readonly artifacts?: ArtifactReadOptions;
};

const createArtifactRunRegistry = (
  artifactRunId: string
): RunControllerRegistry => {
  const controllers = new Map<string, PrefetchController>();

  return {
    get: (runId) => controllers.get(runId) ?? null,
    getOrCreate: (runId, options) => {
      const existing = controllers.get(runId);
      if (existing !== undefined) {
        return existing;
      }

      const created = createPrefetchController({
        ...options,
        runId: artifactRunId
      });
      controllers.set(runId, created);
      return created;
    },
    remove: (runId) => {
      const controller = controllers.get(runId);
      controller?.cancel();
      controllers.delete(runId);
    }
  };
};

export const createWebTransportState = (
  options: WebTransportStateOptions = {}
): WebTransportState => {
  const seed = options.seed ?? SEED;
  const createdAt = options.createdAt ?? SERVER_STARTED_AT;
  const artifactRunId = traceRunId(seed, createdAt);
  const registry = createArtifactRunRegistry(artifactRunId);
  const artifacts: ArtifactReadOptions = {
    fs: options.artifacts?.fs ?? new MemoryArtifactFs(),
    rootDir: options.artifacts?.rootDir ?? ROOT_DIR
  };
  const prefetchArtifacts = createPrefetchArtifactOptions(artifacts);

  const fallbackProvider = createWebFallbackProvider();
  const fallbackDirector = isFallbackDirector();
  const ambientDirector = isAmbientDirector();
  const realAmbientDirector = isRealAmbient();
  const providerGenerationTimeoutMs =
    fallbackProvider === undefined
      ? undefined
      : realAmbientDirector
        ? AMBIENT_REAL_TIMEOUT_MS
        : fallbackDirector
          ? FALLBACK_PROVIDER_TIMEOUT_MS
          : undefined;
  const baseHandlers = createTransportHandlers(registry, {
    seed,
    modelId:
      realAmbientDirector || ambientDirector
        ? "ambient-web-transport"
        : fallbackDirector
          ? FALLBACK_MODEL_ID
          : MODEL_ID,
    provider: createWebProvider(),
    gate2: passingGate2(),
    clock: createPrefetchWallClock(),
    now: () => createdAt,
    artifacts: prefetchArtifacts,
    ...(fallbackProvider === undefined
      ? {}
      : {
          fallbackProvider,
          ...(providerGenerationTimeoutMs === undefined
            ? {}
            : { providerGenerationTimeoutMs })
        })
  });
  const resolveGetFloor = async (
    request: Parameters<TransportHandlers["getFloor"]>[0]
  ): Promise<ServedFloor> => {
    if (
      isFallbackDirector() &&
      !realAmbientDirector &&
      request.depth === config.runStructure.depthFloors
    ) {
      return serveBundledFallbackFloor(request.depth, request.seed);
    }

    return baseHandlers.getFloor(request);
  };

  const handlers: TransportHandlers = {
    ...baseHandlers,
    getFloor: async (request) => {
      const key = `${request.runId}\0${request.depth}\0${request.seed}`;
      const pending = pendingGetFloorByKey.get(key);
      if (pending !== undefined) {
        return pending;
      }

      const flight = resolveGetFloor(request)
        .then((served) => {
          if (realAmbientDirector) {
            console.warn(
              `[AMBIENT-SOURCE] depth=${served.depth} source=${served.source}`
            );
          }
          return served;
        })
        .finally(() => {
          if (pendingGetFloorByKey.get(key) === flight) {
            pendingGetFloorByKey.delete(key);
          }
        });
      pendingGetFloorByKey.set(key, flight);
      return flight;
    }
  };

  return {
    artifacts,
    seed,
    createdAt,
    artifactRunId,
    fallbackDirector,
    ambientDirector,
    realAmbientDirector,
    usesAmbientProvider: realAmbientDirector || ambientDirector,
    fallbackProvider,
    providerGenerationTimeoutMs,
    handlers
  };
};

const transportGlobal = globalThis as typeof globalThis & {
  __ggWebTransportState?: WebTransportState;
};

const getWebTransportState = (): WebTransportState => {
  const wantsFallback = isFallbackDirector();
  const wantsAmbient = isAmbientDirector();
  const wantsRealAmbient = isRealAmbient();
  const existing = transportGlobal.__ggWebTransportState;
  if (
    existing !== undefined &&
    existing.fallbackDirector === wantsFallback &&
    existing.ambientDirector === wantsAmbient &&
    existing.realAmbientDirector === wantsRealAmbient
  ) {
    return existing;
  }

  transportGlobal.__ggWebTransportState = createWebTransportState();
  return transportGlobal.__ggWebTransportState;
};

export const resetWebTransportStateForTests = (): void => {
  pendingGetFloorByKey.clear();
  delete transportGlobal.__ggWebTransportState;
};

export const getTransportHandlers = (): TransportHandlers =>
  getWebTransportState().handlers;

export const getArtifactReadOptions = (): ArtifactReadOptions =>
  getWebTransportState().artifacts;
