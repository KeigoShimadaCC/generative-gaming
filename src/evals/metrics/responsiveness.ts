import type { BehavioralFacts } from "../../director/prompt/summarize.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import type { PersonaName } from "../personas/types.js";

export const RESPONSIVENESS_METRIC_VERSION = "phase-42-responsiveness-v1" as const;

export type ResponsivenessDetectorProposalEntry = {
  readonly id: string;
  readonly persona: PersonaName;
  readonly description: string;
  /** Human review: detector encodes uncertain design judgment. */
  readonly uncertain?: boolean;
};

export type ResponsivenessDetector = ResponsivenessDetectorProposalEntry & {
  readonly detect: (
    manifest: FloorManifest,
    facts: BehavioralFacts,
  ) => boolean;
};

export type ResponsivenessDetectorHit = {
  readonly id: string;
  readonly hit: boolean;
};

export type ResponsivenessHitRate = {
  readonly metricVersion: typeof RESPONSIVENESS_METRIC_VERSION;
  readonly persona: PersonaName;
  readonly hits: number;
  readonly total: number;
  readonly rate: number;
  readonly detectors: readonly ResponsivenessDetectorHit[];
};

export type ResponsivenessMatrix = {
  readonly metricVersion: typeof RESPONSIVENESS_METRIC_VERSION;
  readonly sourcePersona: PersonaName;
  readonly samePersona: ResponsivenessHitRate;
  readonly crossPersona: Readonly<Record<PersonaName, ResponsivenessHitRate>>;
};

/** Trace shows hoarder-style play before manifest signals count. */
const hoarderTrace = (facts: BehavioralFacts): boolean =>
  facts.hoardingSignal >= 2 ||
  (facts.itemPickups > facts.itemUses && facts.combatEngagementRate <= 0.35);

/** Trace shows pacifist-style play before manifest signals count. */
const pacifistTrace = (facts: BehavioralFacts): boolean =>
  facts.fightsPicked === 0 &&
  facts.combatEngagementRate === 0 &&
  (facts.fightsAvoided > 0 || facts.retreatCount > 0);

/** Trace shows speedrunner-style play before manifest signals count. */
const speedrunnerTrace = (facts: BehavioralFacts): boolean =>
  facts.itemPickups <= 2 && facts.explorationRatio <= 0.14;

/** Trace shows completionist-style play before manifest signals count. */
const completionistTrace = (facts: BehavioralFacts): boolean =>
  facts.npcTalksInitiated > 0 || facts.cellsVisited >= 35;

/**
 * Trace shows chaotic, varied engagement (per-seed tolerance proxy).
 * Uses fact diversity because eval cells only receive BehavioralFacts.
 */
const chaosTrace = (facts: BehavioralFacts): boolean => {
  const itemCategoryUses = Object.keys(facts.itemUsesByCategory).length;
  return (
    (facts.fightsPicked > 0 && facts.fightsAvoided > 0) ||
    itemCategoryUses >= 2 ||
    (facts.closeCallCount > 0 && facts.questRefused > 0)
  );
};

const CAUTION_KEYWORDS = [
  "avoid",
  "careful",
  "caution",
  "quiet",
  "peace",
  "retreat",
  "still",
  "calm",
] as const;

const HOARD_KEYWORDS = [
  "hoard",
  "stash",
  "cache",
  "treasure",
  "stockpile",
  "burden",
  "weight",
] as const;

const PACE_KEYWORDS = [
  "stairs",
  "ascent",
  "exit",
  "swift",
  "hurry",
  "short",
  "direct",
] as const;

const QUEST_KEYWORDS = [
  "quest",
  "task",
  "errand",
  "promise",
  "ledger",
  "scribe",
] as const;

/**
 * Proposed detector set for orchestrator / human review at phase close.
 * Detectors marked uncertain encode design judgment that may need tuning.
 */
export const serializeDetectorProposal = (
  detectors: readonly ResponsivenessDetector[] = RESPONSIVENESS_DETECTOR_PROPOSAL,
): readonly ResponsivenessDetectorProposalEntry[] =>
  detectors.map(({ id, persona, description, uncertain }) => ({
    id,
    persona,
    description,
    ...(uncertain === undefined ? {} : { uncertain }),
  }));

export const RESPONSIVENESS_DETECTOR_PROPOSAL: readonly ResponsivenessDetector[] =
  [
    {
      id: "hoarder_item_density",
      persona: "hoarder",
      description:
        "Floor offers above-minimum item count or multiple coin pickups.",
      detect: (manifest, facts) =>
        hoarderTrace(facts) &&
        (manifest.items.length >= 5 ||
          manifest.items.filter((item) => item.kind === "coin").length >= 2),
    },
    {
      id: "hoarder_thief_pressure",
      persona: "hoarder",
      description: "Roster includes a thief behavior enemy.",
      detect: (manifest, facts) =>
        hoarderTrace(facts) &&
        manifest.roster.some((enemy) =>
          enemy.behaviors.some((behavior) => behavior.kind === "thief"),
        ),
    },
    {
      id: "hoarder_inventory_narration",
      persona: "hoarder",
      description: "Narration references hoarding or carrying burden.",
      uncertain: true,
      detect: (manifest, facts) =>
        hoarderTrace(facts) && narrationMatches(manifest, HOARD_KEYWORDS),
    },
    {
      id: "pacifist_open_routes",
      persona: "pacifist",
      description:
        "Layout flavor or room span suggests alternate routes (open/halls or wide room span).",
      detect: (manifest, facts) =>
        pacifistTrace(facts) &&
        (manifest.params.flavor === "open" ||
          manifest.params.flavor === "halls" ||
          manifest.params.roomCountRange.max -
            manifest.params.roomCountRange.min >=
            3),
    },
    {
      id: "pacifist_soft_threats",
      persona: "pacifist",
      description:
        "Few enemies are placed near the entrance; more keep-range/flee behaviors.",
      detect: (manifest, facts) => {
        if (!pacifistTrace(facts)) {
          return false;
        }

        const nearEntranceThreats = manifest.roster.filter(
          (enemy) => enemy.placementHint?.distance === "near_entrance",
        ).length;
        const avoidanceBehaviors = manifest.roster.filter((enemy) =>
          enemy.behaviors.some((behavior) =>
            behavior.kind === "keep_range" || behavior.kind === "flee_low_hp",
          ),
        ).length;
        return nearEntranceThreats <= 1 || avoidanceBehaviors >= 1;
      },
    },
    {
      id: "pacifist_caution_narration",
      persona: "pacifist",
      description: "Narration acknowledges caution or non-violence.",
      detect: (manifest, facts) =>
        pacifistTrace(facts) && narrationMatches(manifest, CAUTION_KEYWORDS),
    },
    {
      id: "speedrunner_compact_floor",
      persona: "speedrunner",
      description: "Compact room span or open/halls flavor for fast routing.",
      detect: (manifest, facts) =>
        speedrunnerTrace(facts) &&
        (manifest.params.roomCountRange.max <= 6 ||
          manifest.params.flavor === "open" ||
          manifest.params.flavor === "halls"),
    },
    {
      id: "speedrunner_near_entrance_loot",
      persona: "speedrunner",
      description: "High-value entities placed near entrance for grab-and-go.",
      detect: (manifest, facts) => {
        if (!speedrunnerTrace(facts)) {
          return false;
        }

        const nearEntranceEntities = [
          ...manifest.items,
          ...manifest.roster,
        ].filter((entry) => entry.placementHint?.distance === "near_entrance");
        return nearEntranceEntities.length >= 2;
      },
    },
    {
      id: "speedrunner_pace_narration",
      persona: "speedrunner",
      description: "Narration references stairs, exits, or urgency.",
      uncertain: true,
      detect: (manifest, facts) =>
        speedrunnerTrace(facts) && narrationMatches(manifest, PACE_KEYWORDS),
    },
    {
      id: "completionist_npc_present",
      persona: "completionist",
      description: "At least one NPC is authored on the floor.",
      detect: (manifest, facts) =>
        completionistTrace(facts) && manifest.npcs.length > 0,
    },
    {
      id: "completionist_quest_present",
      persona: "completionist",
      description: "A quest hook is present.",
      detect: (manifest, facts) =>
        completionistTrace(facts) && manifest.quest !== null,
    },
    {
      id: "completionist_rich_callbacks",
      persona: "completionist",
      description: "Multiple narration observations or callback tags.",
      detect: (manifest, facts) =>
        completionistTrace(facts) &&
        (manifest.narration.observations.length >= 2 ||
          manifest.metadata.callbacks.length >= 2 ||
          narrationMatches(manifest, QUEST_KEYWORDS)),
    },
    {
      id: "chaos_behavior_diversity",
      persona: "chaos",
      description: "Three or more distinct enemy behavior kinds.",
      uncertain: true,
      detect: (manifest, facts) => {
        if (!chaosTrace(facts)) {
          return false;
        }

        const kinds = new Set(
          manifest.roster.flatMap((enemy) =>
            enemy.behaviors.map((behavior) => behavior.kind),
          ),
        );
        return kinds.size >= 3;
      },
    },
    {
      id: "chaos_trap_variety",
      persona: "chaos",
      description: "Multiple traps or mixed trap/item effect verbs.",
      uncertain: true,
      detect: (manifest, facts) =>
        chaosTrace(facts) &&
        (manifest.traps.length >= 2 ||
          new Set(
            manifest.traps.flatMap((trap) =>
              trap.effectBundle.effects.map((effect) => effect.kind),
            ),
          ).size >= 2),
    },
    {
      id: "chaos_mixed_origins",
      persona: "chaos",
      description: "Origin tag summary shows mixed made/old_stock/kept content.",
      uncertain: true,
      detect: (manifest, facts) => {
        if (!chaosTrace(facts)) {
          return false;
        }

        const tags = manifest.metadata.originTags;
        const present = [
          tags.made > 0,
          tags.old_stock > 0,
          tags.kept > 0,
        ].filter(Boolean).length;
        return present >= 2;
      },
    },
    {
      id: "chaos_varied_engagement",
      persona: "chaos",
      description:
        "Trace shows mixed fight/avoid patterns and manifest offers diverse threats.",
      uncertain: true,
      detect: (manifest, facts) =>
        chaosTrace(facts) &&
        facts.fightsPicked > 0 &&
        facts.fightsAvoided > 0 &&
        manifest.roster.length >= 2,
    },
  ];

const detectorsForPersona = (
  persona: PersonaName,
): readonly ResponsivenessDetector[] =>
  RESPONSIVENESS_DETECTOR_PROPOSAL.filter(
    (detector) => detector.persona === persona,
  );

export const hitRate = (
  manifest: FloorManifest,
  traceFacts: BehavioralFacts,
  persona: PersonaName,
): ResponsivenessHitRate => {
  const detectors = detectorsForPersona(persona);
  const results = detectors.map((detector) => ({
    id: detector.id,
    hit: detector.detect(manifest, traceFacts),
  }));
  const hits = results.filter((result) => result.hit).length;

  return {
    metricVersion: RESPONSIVENESS_METRIC_VERSION,
    persona,
    hits,
    total: detectors.length,
    rate: detectors.length === 0 ? 0 : hits / detectors.length,
    detectors: results,
  };
};

export const responsivenessMatrix = (
  manifest: FloorManifest,
  traceFacts: BehavioralFacts,
  sourcePersona: PersonaName,
): ResponsivenessMatrix => {
  const personas: readonly PersonaName[] = [
    "hoarder",
    "pacifist",
    "speedrunner",
    "completionist",
    "chaos",
  ];

  const crossPersona = Object.fromEntries(
    personas.map((persona) => [persona, hitRate(manifest, traceFacts, persona)]),
  ) as Record<PersonaName, ResponsivenessHitRate>;

  return {
    metricVersion: RESPONSIVENESS_METRIC_VERSION,
    sourcePersona,
    samePersona: crossPersona[sourcePersona],
    crossPersona,
  };
};

const narrationMatches = (
  manifest: FloorManifest,
  keywords: readonly string[],
): boolean => {
  const text = [
    manifest.narration.floorIntro,
    ...manifest.narration.observations.map((observation) => observation.text),
  ]
    .join(" ")
    .toLowerCase();

  return keywords.some((keyword) => text.includes(keyword));
};
