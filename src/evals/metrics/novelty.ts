import { bounds } from "../../config/index.js";
import {
  getFallbackFloor,
  type FallbackContentPack,
} from "../../harness/content-loader.js";
import type {
  EnemyDefinition,
  ItemDefinition,
  NpcDefinition,
  TrapDefinition,
} from "../../schemas/entities/index.js";
import type { EffectBundle } from "../../schemas/vocab/index.js";
import type { FloorManifest } from "../../schemas/manifest.js";

export const NOVELTY_METRIC_VERSION = "phase-42-novelty-v1" as const;

/** Blended distance at or below this value flags near-duplicate content. */
export const NOVELTY_NEAR_DUPLICATE_THRESHOLD = 0.22;

export type NoveltyCorpus = {
  readonly fallbackPack: FallbackContentPack;
  readonly recentManifests: readonly FloorManifest[];
};

export type NoveltyComponents = {
  /** 0 = distinct names, 1 = corpus-identical naming. */
  readonly nameSimilarity: number;
  /** 0 = identical stat profiles, 1 = maximally different. */
  readonly statVectorDistance: number;
  /** 0 = disjoint composition, 1 = identical behavior/effect multiset. */
  readonly compositionOverlap: number;
};

export type NoveltyDistanceResult = {
  readonly metricVersion: typeof NOVELTY_METRIC_VERSION;
  readonly distance: number;
  /** Novelty score: equals distance (higher is fresher). */
  readonly score: number;
  readonly nearDuplicate: boolean;
  readonly components: NoveltyComponents;
  readonly vsFallback: NoveltyComponents;
  readonly vsRecent: NoveltyComponents | null;
};

const COMPONENT_WEIGHTS = {
  nameSimilarity: 0.35,
  statVectorDistance: 0.3,
  compositionOverlap: 0.35,
} as const;

export const distance = (
  manifest: FloorManifest,
  corpus: NoveltyCorpus,
): NoveltyDistanceResult => {
  const manifestFeatures = extractManifestFeatures(manifest);
  const fallbackFeatureSets = extractFallbackPackFeatures(corpus.fallbackPack);
  const recentFeatureSets = corpus.recentManifests.map((recent) =>
    extractManifestFeatures(recent),
  );
  const vsFallback = bestCorpusMatch(manifestFeatures, fallbackFeatureSets);
  const vsRecent =
    recentFeatureSets.length === 0
      ? null
      : bestCorpusMatch(manifestFeatures, recentFeatureSets);
  const components = bestCorpusMatch(manifestFeatures, [
    ...fallbackFeatureSets,
    ...recentFeatureSets,
  ]);
  const corpusSimilarity = blendComponents(components);
  const recentSimilarity =
    vsRecent === null ? null : blendComponents(vsRecent);
  const distanceValue = clamp01(1 - corpusSimilarity);
  const score = distanceValue;

  return {
    metricVersion: NOVELTY_METRIC_VERSION,
    distance: distanceValue,
    score,
    nearDuplicate:
      corpusSimilarity >= 1 - NOVELTY_NEAR_DUPLICATE_THRESHOLD ||
      (recentSimilarity !== null &&
        recentSimilarity >= 1 - NOVELTY_NEAR_DUPLICATE_THRESHOLD),
    components,
    vsFallback,
    vsRecent,
  };
};

type ManifestFeatureSet = {
  readonly entityNames: readonly string[];
  readonly enemyStatVectors: readonly (readonly number[])[];
  readonly compositionTags: readonly string[];
};

const extractFallbackPackFeatures = (
  pack: FallbackContentPack,
): readonly ManifestFeatureSet[] =>
  [...pack.floors.keys()]
    .sort((left, right) => left - right)
    .map((depth) => extractFallbackFeatures(getFallbackFloor(pack, depth)));

const extractManifestFeatures = (manifest: FloorManifest): ManifestFeatureSet => ({
  entityNames: collectEntityNames(manifest),
  enemyStatVectors: manifest.roster.map((enemy) =>
    normalizeEnemyStats(enemy.stats.band, enemy.stats),
  ),
  compositionTags: [
    ...collectBehaviorTags(manifest.roster),
    ...manifest.items.flatMap((item) => collectItemEffectVerbs(item)),
    ...manifest.traps.flatMap((trap) => collectTrapEffectVerbs(trap)),
    ...manifest.roster.flatMap((enemy) =>
      enemy.abilities.flatMap((bundle) => collectBundleVerbs(bundle)),
    ),
  ],
});

const extractFallbackFeatures = (floor: {
  readonly roster: readonly EnemyDefinition[];
  readonly items: readonly ItemDefinition[];
  readonly traps: readonly TrapDefinition[];
  readonly npcs: readonly NpcDefinition[];
}): ManifestFeatureSet => ({
  entityNames: [
    ...floor.roster.map((enemy) => normalizeName(enemy.name)),
    ...floor.items.map((item) => normalizeName(item.name)),
    ...floor.traps.map((trap) => normalizeName(trap.name)),
    ...floor.npcs.map((npc) => normalizeName(npc.name)),
  ],
  enemyStatVectors: floor.roster.map((enemy) =>
    normalizeEnemyStats(enemy.stats.band, enemy.stats),
  ),
  compositionTags: [
    ...floor.roster.flatMap((enemy) =>
      enemy.behaviors.map((behavior) => `behavior:${behavior.kind}`),
    ),
    ...floor.items.flatMap((item) => collectItemEffectVerbs(item)),
    ...floor.traps.flatMap((trap) => collectTrapEffectVerbs(trap)),
    ...floor.roster.flatMap((enemy) =>
      enemy.abilities.flatMap((bundle) => collectBundleVerbs(bundle)),
    ),
  ],
});

const compareFeatureSets = (
  manifest: ManifestFeatureSet,
  corpus: ManifestFeatureSet,
): NoveltyComponents => ({
  nameSimilarity: averageNameSimilarity(manifest.entityNames, corpus.entityNames),
  statVectorDistance: averageStatDistance(
    manifest.enemyStatVectors,
    corpus.enemyStatVectors,
  ),
  compositionOverlap: multisetJaccard(
    manifest.compositionTags,
    corpus.compositionTags,
  ),
});

const bestCorpusMatch = (
  manifest: ManifestFeatureSet,
  corpus: readonly ManifestFeatureSet[],
): NoveltyComponents => {
  const candidates =
    corpus.length === 0
      ? [
          {
            entityNames: [],
            enemyStatVectors: [],
            compositionTags: [],
          },
        ]
      : corpus;

  return candidates
    .map((candidate) => compareFeatureSets(manifest, candidate))
    .reduce((best, current) =>
      blendComponents(current) > blendComponents(best) ? current : best,
    );
};

const blendComponents = (components: NoveltyComponents): number =>
  clamp01(
    components.nameSimilarity * COMPONENT_WEIGHTS.nameSimilarity +
      (1 - components.statVectorDistance) * COMPONENT_WEIGHTS.statVectorDistance +
      components.compositionOverlap * COMPONENT_WEIGHTS.compositionOverlap,
  );

const collectEntityNames = (manifest: FloorManifest): readonly string[] => [
  ...manifest.roster.map((enemy) => normalizeName(enemy.name)),
  ...manifest.items.map((item) => normalizeName(item.name)),
  ...manifest.traps.map((trap) => normalizeName(trap.name)),
  ...manifest.npcs.map((npc) => normalizeName(npc.name)),
];

const collectBehaviorTags = (
  roster: FloorManifest["roster"],
): readonly string[] =>
  roster.flatMap((enemy) =>
    enemy.behaviors.map((behavior) => `behavior:${behavior.kind}`),
  );

const collectItemEffectVerbs = (item: ItemDefinition): readonly string[] => {
  const verbs: string[] = [`item:${item.kind}`];

  if (item.weapon?.onHit !== null && item.weapon?.onHit !== undefined) {
    verbs.push(...collectBundleVerbs(item.weapon.onHit.bundle));
  }
  if (item.armor?.onStruck !== null && item.armor?.onStruck !== undefined) {
    verbs.push(...collectBundleVerbs(item.armor.onStruck.bundle));
  }
  if (item.charm !== null) {
    verbs.push(...collectBundleVerbs(item.charm.passive));
  }
  if (item.draught !== null) {
    verbs.push(...collectBundleVerbs(item.draught.effect));
  }
  if (item.note !== null) {
    verbs.push(...collectBundleVerbs(item.note.effect));
  }
  if (item.throwable !== null) {
    verbs.push(...collectBundleVerbs(item.throwable.effect));
  }
  if (item.food !== null) {
    verbs.push(...collectBundleVerbs(item.food.effect));
  }
  if (item.tool !== null) {
    verbs.push(...collectBundleVerbs(item.tool.effect));
  }

  return verbs;
};

const collectTrapEffectVerbs = (trap: TrapDefinition): readonly string[] => [
  "trap:step",
  ...collectBundleVerbs(trap.effectBundle),
];

const collectBundleVerbs = (bundle: EffectBundle): readonly string[] =>
  bundle.effects.map((effect) => `effect:${effect.kind}`);

const normalizeName = (name: string): string => name.trim().toLowerCase();

const averageNameSimilarity = (
  manifestNames: readonly string[],
  corpusNames: readonly string[],
): number => {
  if (manifestNames.length === 0 || corpusNames.length === 0) {
    return 0;
  }

  const similarities = manifestNames.map((name) => {
    const best = Math.max(
      ...corpusNames.map((corpusName) => normalizedEditSimilarity(name, corpusName)),
    );
    return best;
  });

  return mean(similarities);
};

export const normalizedEditSimilarity = (left: string, right: string): number => {
  if (left === right) {
    return 1;
  }

  const maxLength = Math.max(left.length, right.length, 1);
  return 1 - levenshteinDistance(left, right) / maxLength;
};

const levenshteinDistance = (left: string, right: string): number => {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let row = 0; row < rows; row += 1) {
    matrix[row]![0] = row;
  }
  for (let col = 0; col < cols; col += 1) {
    matrix[0]![col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row]![col] = Math.min(
        (matrix[row - 1]![col] ?? 0) + 1,
        (matrix[row]![col - 1] ?? 0) + 1,
        (matrix[row - 1]![col - 1] ?? 0) + cost,
      );
    }
  }

  return matrix[left.length]![right.length] ?? 0;
};

const normalizeEnemyStats = (
  band: EnemyDefinition["stats"]["band"],
  stats: EnemyDefinition["stats"],
): readonly number[] => {
  const statBounds = bounds.enemyDesign.statBudgetsByBand[band];

  return [
    normalizeStat(stats.hp, statBounds.hp),
    normalizeStat(stats.attack, statBounds.attack),
    normalizeStat(stats.defense, statBounds.defense),
    normalizeStat(stats.xpYield, statBounds.xpYield),
  ];
};

const normalizeStat = (
  value: number,
  range: { readonly min: number; readonly max: number },
): number => {
  if (range.max === range.min) {
    return 0;
  }

  return clamp01((value - range.min) / (range.max - range.min));
};

const averageStatDistance = (
  manifestVectors: readonly (readonly number[])[],
  corpusVectors: readonly (readonly number[])[],
): number => {
  if (manifestVectors.length === 0 || corpusVectors.length === 0) {
    return 1;
  }

  const distances = manifestVectors.map((vector) => {
    const best = Math.min(
      ...corpusVectors.map((corpusVector) => euclideanDistance(vector, corpusVector)),
    );
    return best;
  });

  return clamp01(mean(distances) / Math.sqrt(4));
};

const euclideanDistance = (
  left: readonly number[],
  right: readonly number[],
): number => {
  const length = Math.max(left.length, right.length);
  let sum = 0;

  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    sum += delta * delta;
  }

  return Math.sqrt(sum);
};

const multisetJaccard = (
  left: readonly string[],
  right: readonly string[],
): number => {
  const leftCounts = countTags(left);
  const rightCounts = countTags(right);
  const tags = new Set([...leftCounts.keys(), ...rightCounts.keys()]);

  let intersection = 0;
  let union = 0;

  for (const tag of tags) {
    const leftCount = leftCounts.get(tag) ?? 0;
    const rightCount = rightCounts.get(tag) ?? 0;
    intersection += Math.min(leftCount, rightCount);
    union += Math.max(leftCount, rightCount);
  }

  return union === 0 ? 0 : intersection / union;
};

const countTags = (tags: readonly string[]): Map<string, number> => {
  const counts = new Map<string, number>();

  for (const tag of tags) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  return counts;
};

const mean = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
