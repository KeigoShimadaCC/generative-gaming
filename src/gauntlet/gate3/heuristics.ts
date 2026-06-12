import { readFileSync } from "node:fs";

import { bounds } from "../../config/index.js";
import { normalizedEditSimilarity } from "../../evals/metrics/novelty.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import { registerGate3 } from "../repair.js";

export const GATE3_REASON_CODES = [
  "G3_BANNED_VOCAB",
  "G3_TEXT_CAP",
  "G3_NARRATION_SECOND_PERSON",
  "G3_NAME_FORMAT",
  "G3_NARRATION_NEAR_DUPLICATE",
  "G3_JUDGE",
] as const;

export type Gate3ReasonCode = (typeof GATE3_REASON_CODES)[number];

export type Gate3Check = {
  readonly code: Gate3ReasonCode;
  readonly pass: boolean;
  readonly detail: string;
  readonly advisory?: true;
};

export type Gate3Report = {
  readonly gate: 3;
  readonly pass: boolean;
  readonly checks: readonly Gate3Check[];
};

export type GeneratedTextKind = "name" | "description_dialogue" | "narration";

export type GeneratedTextEntry = {
  readonly path: string;
  readonly kind: GeneratedTextKind;
  readonly value: string;
};

export type BannedVocabularyPattern = {
  readonly id: string;
  readonly pattern: string;
  readonly reason: string;
};

export type BannedVocabularyFile = {
  readonly version: string;
  readonly patterns: readonly BannedVocabularyPattern[];
};

export type Gate3HeuristicsContext = {
  readonly bannedVocabulary?: BannedVocabularyFile;
  readonly recentNarration?: readonly string[];
  readonly recentManifests?: readonly FloorManifest[];
  readonly nearDuplicateThreshold?: number;
};

const DEFAULT_BANNED_VOCAB_URL = new URL(
  "../../../content/banned-vocab.json",
  import.meta.url,
);
const DEFAULT_NEAR_DUPLICATE_THRESHOLD = 0.9;

let cachedBannedVocabulary: BannedVocabularyFile | null = null;

export const runGate3Heuristics = (
  manifest: FloorManifest,
  context: Gate3HeuristicsContext = {},
): Gate3Report => {
  const entries = collectGeneratedTextEntries(manifest);
  const bannedVocabulary =
    context.bannedVocabulary ?? defaultBannedVocabulary();
  const recentNarration = [
    ...(context.recentNarration ?? []),
    ...(context.recentManifests ?? []).flatMap(narrationLines),
  ];
  const checks: readonly Gate3Check[] = [
    checkBannedVocabulary(entries, bannedVocabulary),
    checkTextCaps(entries),
    checkNarrationSecondPerson(entries),
    checkNameFormat(manifest),
    checkNarrationNovelty(
      manifest,
      recentNarration,
      context.nearDuplicateThreshold ?? DEFAULT_NEAR_DUPLICATE_THRESHOLD,
    ),
  ];

  return {
    gate: 3,
    pass: checks.every((check) => check.pass),
    checks,
  };
};

export const collectGeneratedTextEntries = (
  manifest: FloorManifest,
): readonly GeneratedTextEntry[] => [
  {
    path: "$.narration.floorIntro",
    kind: "narration",
    value: manifest.narration.floorIntro,
  },
  ...manifest.narration.observations.map((beat, index) => ({
    path: `$.narration.observations[${index}].text`,
    kind: "narration" as const,
    value: beat.text,
  })),
  ...manifest.roster.map((enemy, index) => ({
    path: `$.roster[${index}].name`,
    kind: "name" as const,
    value: enemy.name,
  })),
  ...manifest.items.map((item, index) => ({
    path: `$.items[${index}].name`,
    kind: "name" as const,
    value: item.name,
  })),
  ...manifest.traps.map((trap, index) => ({
    path: `$.traps[${index}].name`,
    kind: "name" as const,
    value: trap.name,
  })),
  ...manifest.npcs.flatMap((npc, npcIndex) => [
    {
      path: `$.npcs[${npcIndex}].name`,
      kind: "name" as const,
      value: npc.name,
    },
    ...npc.dialogue.nodes.flatMap((node, nodeIndex) => [
      {
        path: `$.npcs[${npcIndex}].dialogue.nodes[${nodeIndex}].text`,
        kind: "description_dialogue" as const,
        value: node.text,
      },
      ...node.choices.map((choice, choiceIndex) => ({
        path: `$.npcs[${npcIndex}].dialogue.nodes[${nodeIndex}].choices[${choiceIndex}].label`,
        kind: "description_dialogue" as const,
        value: choice.label,
      })),
    ]),
  ]),
  ...(manifest.quest === null
    ? []
    : [
        {
          path: "$.quest.title",
          kind: "name" as const,
          value: manifest.quest.title,
        },
      ]),
];

export const loadBannedVocabulary = (
  path: URL = DEFAULT_BANNED_VOCAB_URL,
): BannedVocabularyFile => {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isBannedVocabularyFile(raw)) {
    throw new Error(`${path.pathname}: invalid banned vocabulary file`);
  }

  return raw;
};

export const installGate3Heuristics = (): void => {
  registerGate3((manifest, ctx) =>
    runGate3Heuristics(manifest, gate3HeuristicsContextFromUnknown(ctx.gate3)),
  );
};

installGate3Heuristics();

const defaultBannedVocabulary = (): BannedVocabularyFile => {
  cachedBannedVocabulary ??= loadBannedVocabulary();
  return cachedBannedVocabulary;
};

const checkBannedVocabulary = (
  entries: readonly GeneratedTextEntry[],
  bannedVocabulary: BannedVocabularyFile,
): Gate3Check => {
  const violations = entries.flatMap((entry) =>
    bannedVocabulary.patterns.flatMap((pattern) => {
      const regex = new RegExp(pattern.pattern, "iu");
      if (!regex.test(entry.value)) {
        return [];
      }

      return [
        `${entry.path} matched ${pattern.id} (${pattern.reason}): ${JSON.stringify(entry.value)}`,
      ];
    }),
  );

  return violations.length === 0
    ? passCheck("G3_BANNED_VOCAB", "no banned vocabulary found")
    : failCheck("G3_BANNED_VOCAB", violations.join("; "));
};

const checkTextCaps = (
  entries: readonly GeneratedTextEntry[],
): Gate3Check => {
  const violations = entries.flatMap((entry) => {
    const cap = textCapForKind(entry.kind);
    if (entry.value.length <= cap) {
      return [];
    }

    return [`${entry.path} length ${entry.value.length} exceeds cap ${cap}`];
  });

  return violations.length === 0
    ? passCheck("G3_TEXT_CAP", "all generated text respects caps")
    : failCheck("G3_TEXT_CAP", violations.join("; "));
};

const checkNarrationSecondPerson = (
  entries: readonly GeneratedTextEntry[],
): Gate3Check => {
  const violations = entries
    .filter((entry) => entry.kind === "narration")
    .flatMap((entry) => {
      const reasons = narrationVoiceViolations(entry.value);
      return reasons.map((reason) => `${entry.path} ${reason}: ${JSON.stringify(entry.value)}`);
    });

  return violations.length === 0
    ? passCheck(
        "G3_NARRATION_SECOND_PERSON",
        "narration avoids first-person, player-meta, and UI-action slips",
      )
    : failCheck("G3_NARRATION_SECOND_PERSON", violations.join("; "));
};

const checkNameFormat = (manifest: FloorManifest): Gate3Check => {
  const itemNamesOfY = manifest.items
    .map((item, index) => ({ path: `$.items[${index}].name`, name: item.name }))
    .filter(({ name }) => /\bof\b/iu.test(name));

  return itemNamesOfY.length <= 1
    ? passCheck("G3_NAME_FORMAT", "item names ration the X of Y pattern")
    : failCheck(
        "G3_NAME_FORMAT",
        `more than one item name uses X of Y: ${itemNamesOfY
          .map(({ path, name }) => `${path} ${JSON.stringify(name)}`)
          .join("; ")}`,
      );
};

const checkNarrationNovelty = (
  manifest: FloorManifest,
  recentNarration: readonly string[],
  nearDuplicateThreshold: number,
): Gate3Check => {
  if (recentNarration.length === 0) {
    return passCheck(
      "G3_NARRATION_NEAR_DUPLICATE",
      "no recent narration corpus supplied",
    );
  }

  const candidateLines = narrationLines(manifest);
  const matches = candidateLines.flatMap((candidate) =>
    recentNarration.flatMap((recent) => {
      const similarity = normalizedEditSimilarity(
        normalizeText(candidate),
        normalizeText(recent),
      );

      return similarity >= nearDuplicateThreshold
        ? [
            `${JSON.stringify(candidate)} ~= ${JSON.stringify(recent)} (${similarity.toFixed(3)})`,
          ]
        : [];
    }),
  );

  return matches.length === 0
    ? passCheck(
        "G3_NARRATION_NEAR_DUPLICATE",
        "narration is distinct from recent floors",
      )
    : failCheck("G3_NARRATION_NEAR_DUPLICATE", matches.join("; "));
};

const narrationVoiceViolations = (line: string): readonly string[] => {
  const violations: string[] = [];

  if (/\bI\s+(think|feel|guess|believe|suppose|click|press|tap|choose)\b/iu.test(line)) {
    violations.push("uses first-person narrator phrasing");
  }
  if (/\b(me|my|mine|we|our|ours)\b/iu.test(line)) {
    violations.push("uses first-person narrator pronouns");
  }
  if (/\b(the player|your character|the avatar)\b/iu.test(line)) {
    violations.push("addresses the player as a game object");
  }
  if (/\byou\s+(click|press|tap|select|choose)\b/iu.test(line)) {
    violations.push("turns second person into UI action");
  }

  return violations;
};

const textCapForKind = (kind: GeneratedTextKind): number => {
  switch (kind) {
    case "name":
      return bounds.directorManifest.textCaps.nameMaxChars;
    case "description_dialogue":
      return bounds.directorManifest.textCaps.descriptionDialogueLineMaxChars;
    case "narration":
      return bounds.directorManifest.textCaps.narrationLineMaxChars;
  }
};

const narrationLines = (manifest: FloorManifest): readonly string[] => [
  manifest.narration.floorIntro,
  ...manifest.narration.observations.map((beat) => beat.text),
];

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");

export const gate3HeuristicsContextFromUnknown = (
  value: unknown,
): Gate3HeuristicsContext => {
  if (!isRecord(value)) {
    return {};
  }

  return {
    ...(Array.isArray(value.recentNarration)
      ? {
          recentNarration: value.recentNarration.filter(
            (entry): entry is string => typeof entry === "string",
          ),
        }
      : {}),
    ...(Array.isArray(value.recentManifests)
      ? {
          recentManifests: value.recentManifests.filter(isFloorManifestLike),
        }
      : {}),
    ...(typeof value.nearDuplicateThreshold === "number"
      ? { nearDuplicateThreshold: value.nearDuplicateThreshold }
      : {}),
  };
};

const passCheck = (
  code: Gate3ReasonCode,
  detail: string,
): Gate3Check => ({
  code,
  pass: true,
  detail,
});

const failCheck = (
  code: Gate3ReasonCode,
  detail: string,
): Gate3Check => ({
  code,
  pass: false,
  detail,
});

const isBannedVocabularyFile = (
  value: unknown,
): value is BannedVocabularyFile =>
  isRecord(value) &&
  typeof value.version === "string" &&
  Array.isArray(value.patterns) &&
  value.patterns.every(
    (pattern) =>
      isRecord(pattern) &&
      typeof pattern.id === "string" &&
      typeof pattern.pattern === "string" &&
      typeof pattern.reason === "string",
  );

const isFloorManifestLike = (value: unknown): value is FloorManifest =>
  isRecord(value) &&
  isRecord(value.narration) &&
  typeof value.narration.floorIntro === "string" &&
  Array.isArray(value.narration.observations);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
