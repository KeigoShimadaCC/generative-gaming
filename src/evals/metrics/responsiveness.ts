import type { BehavioralFacts } from "../../director/prompt/summarize.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import type { PersonaName } from "../personas/types.js";

export const RESPONSIVENESS_METRIC_VERSION = "phase-47-responsiveness-v2" as const;

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
  facts.npcTalksInitiated > 0 ||
  facts.questAccepted + facts.questCompleted > 0 ||
  facts.cellsVisited / Math.max(1, facts.floorCellsEstimate) >= 0.35;

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

const INVENTORY_PRESSURE_TERMS = [
  "burden",
  "cache",
  "carry",
  "carried",
  "hoard",
  "pack",
  "stash",
  "stockpile",
] as const;

const CAUTION_RESPONSE_TERMS = [
  "avoid",
  "pass around",
  "peace",
  "retreat",
  "slip past",
  "spare",
  "unfought",
  "without striking",
] as const;

const PACE_RESPONSE_TERMS = [
  "direct",
  "exit",
  "few rooms",
  "near",
  "short",
  "stairs",
  "straight",
] as const;

const STRUCTURED_ROUTE_TERMS = [
  "descent",
  "direct-route",
  "exit",
  "short-route",
  "stairs",
] as const;

const COMPLETIONIST_CALLBACK_TERMS = [
  "explore",
  "map",
  "npc",
  "quest",
  "talk",
  "visited",
] as const;

const normalized = (text: string): string => text.toLowerCase();

const narrationText = (manifest: FloorManifest): string =>
  normalized(
    [
      manifest.narration.floorIntro,
      ...manifest.narration.observations.map((observation) => observation.text),
    ].join(" "),
  );

const textIncludesAny = (
  text: string,
  terms: readonly string[],
): boolean => terms.some((term) => text.includes(term));

const structuredTags = (manifest: FloorManifest): readonly string[] => [
  ...manifest.metadata.callbacks,
  ...manifest.narration.observations.flatMap((observation) => [
    observation.id,
    observation.triggerTag,
  ]),
];

const structuredTagIncludesAny = (
  manifest: FloorManifest,
  terms: readonly string[],
): boolean =>
  structuredTags(manifest).some((tag) =>
    textIncludesAny(normalized(tag), terms),
  );

const authoredNames = (
  manifest: FloorManifest,
  kinds: readonly ("item" | "npc" | "quest" | "roster")[],
): readonly string[] => {
  const names: string[] = [];

  if (kinds.includes("item")) {
    names.push(...manifest.items.map((item) => item.name));
  }

  if (kinds.includes("npc")) {
    names.push(...manifest.npcs.map((npc) => npc.name));
  }

  if (kinds.includes("quest") && manifest.quest !== null) {
    names.push(manifest.quest.title);
  }

  if (kinds.includes("roster")) {
    names.push(...manifest.roster.map((enemy) => enemy.name));
  }

  return names;
};

const narrationMentionsAuthoredName = (
  manifest: FloorManifest,
  kinds: readonly ("item" | "npc" | "quest" | "roster")[],
): boolean => {
  const text = narrationText(manifest);
  return authoredNames(manifest, kinds).some((name) =>
    text.includes(normalized(name)),
  );
};

const roomSpan = (manifest: FloorManifest): number =>
  manifest.params.roomCountRange.max - manifest.params.roomCountRange.min;

const averageRoomCount = (manifest: FloorManifest): number =>
  (manifest.params.roomCountRange.min + manifest.params.roomCountRange.max) / 2;

const enemyDensity = (manifest: FloorManifest): number =>
  manifest.roster.length / Math.max(1, averageRoomCount(manifest));

const nearEntranceThreats = (manifest: FloorManifest): number =>
  manifest.roster.filter(
    (enemy) => enemy.placementHint?.distance === "near_entrance",
  ).length;

const farOrSpreadPlacements = (manifest: FloorManifest): number =>
  [
    ...manifest.roster,
    ...manifest.items,
    ...manifest.traps,
    ...manifest.npcs,
  ].filter(
    (entry) =>
      entry.placementHint?.distance === "far_from_entrance" ||
      entry.placementHint?.spread === true,
  ).length;

const avoidanceBehaviorCount = (manifest: FloorManifest): number =>
  manifest.roster.filter((enemy) =>
    enemy.behaviors.some(
      (behavior) =>
        behavior.kind === "keep_range" || behavior.kind === "flee_low_hp",
    ),
  ).length;

const behaviorKinds = (manifest: FloorManifest): ReadonlySet<string> =>
  new Set(
    manifest.roster.flatMap((enemy) =>
      enemy.behaviors.map((behavior) => behavior.kind),
    ),
  );

const trapEffectKinds = (manifest: FloorManifest): ReadonlySet<string> =>
  new Set(
    manifest.traps.flatMap((trap) =>
      trap.effectBundle.effects.map((effect) => effect.kind),
    ),
  );

const itemKinds = (manifest: FloorManifest): ReadonlySet<string> =>
  new Set(manifest.items.map((item) => item.kind));

const placementDistances = (manifest: FloorManifest): ReadonlySet<string> =>
  new Set(
    [
      ...manifest.roster,
      ...manifest.items,
      ...manifest.traps,
      ...manifest.npcs,
    ].flatMap((entry) =>
      entry.placementHint?.distance === undefined ||
      entry.placementHint.distance === null
        ? []
        : [entry.placementHint.distance],
    ),
  );

const hasRouteOptionShape = (manifest: FloorManifest): boolean =>
  enemyDensity(manifest) <= 0.35 &&
  roomSpan(manifest) >= 3 &&
  farOrSpreadPlacements(manifest) >= 3 &&
  (manifest.params.flavor === "ring" || manifest.params.flavor === "open");

const hasSoftThreatShape = (manifest: FloorManifest): boolean =>
  enemyDensity(manifest) <= 0.35 &&
  nearEntranceThreats(manifest) === 0 &&
  avoidanceBehaviorCount(manifest) >= Math.ceil(manifest.roster.length / 2);

const hasCompactStairsShape = (manifest: FloorManifest): boolean =>
  manifest.params.roomCountRange.max <= 6 &&
  roomSpan(manifest) <= 2 &&
  structuredTagIncludesAny(manifest, STRUCTURED_ROUTE_TERMS);

const questRewardHasValue = (
  reward: NonNullable<FloorManifest["quest"]>["reward"],
): boolean =>
  (reward.coin ?? 0) > 0 ||
  reward.itemIds.length > 0 ||
  reward.identifyItemIds.length > 0;

const objectiveReferencesAuthoredEntity = (
  manifest: FloorManifest,
): boolean => {
  const quest = manifest.quest;
  if (quest === null) {
    return false;
  }

  const itemIds = new Set(manifest.items.map((item) => item.id));
  const npcIds = new Set(manifest.npcs.map((npc) => npc.id));
  const enemyIds = new Set(manifest.roster.map((enemy) => enemy.id));
  const enemyNames = new Set(manifest.roster.map((enemy) => enemy.name));
  const objective = quest.objective;

  switch (objective.kind) {
    case "fetch":
      return itemIds.has(objective.fetch?.itemId ?? "");
    case "deliver":
      return (
        itemIds.has(objective.deliver?.itemId ?? "") &&
        npcIds.has(objective.deliver?.npcId ?? "")
      );
    case "escort":
      return npcIds.has(objective.escort?.npcId ?? "");
    case "kill": {
      const target = objective.kill?.targetTag ?? "";
      return enemyIds.has(target) || enemyNames.has(target);
    }
    case "reach":
      return (objective.reach?.featureId.length ?? 0) > 0;
    case "constraint":
      return (objective.constraint?.engineFlag.length ?? 0) > 0;
  }
};

const npcLinksQuest = (manifest: FloorManifest): boolean => {
  const quest = manifest.quest;
  if (quest === null) {
    return false;
  }

  return manifest.npcs.some(
    (npc) =>
      npc.questHook?.id === quest.id ||
      npc.dialogue.nodes.some((node) =>
        node.choices.some((choice) => choice.questHookId === quest.id),
      ),
  );
};

const questRichnessScore = (manifest: FloorManifest): number => {
  const quest = manifest.quest;
  if (quest === null) {
    return 0;
  }

  return [
    true,
    quest.title.trim().split(/\s+/).length >= 2,
    questRewardHasValue(quest.reward),
    objectiveReferencesAuthoredEntity(manifest),
    npcLinksQuest(manifest),
  ].filter(Boolean).length;
};

const dialogueMaxDepth = (npc: FloorManifest["npcs"][number]): number => {
  const nodesById = new Map(npc.dialogue.nodes.map((node) => [node.id, node]));

  const visit = (
    nodeId: string,
    depth: number,
    visited: ReadonlySet<string>,
  ): number => {
    const node = nodesById.get(nodeId);
    if (node === undefined || visited.has(nodeId)) {
      return depth - 1;
    }

    const nextIds = node.choices
      .map((choice) => choice.nextNodeId)
      .filter((nextId): nextId is string => nextId !== null);
    if (nextIds.length === 0) {
      return depth;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);
    return Math.max(
      ...nextIds.map((nextId) => visit(nextId, depth + 1, nextVisited)),
    );
  };

  return visit(npc.dialogue.rootNodeId, 1, new Set());
};

const richDialogueNpcCount = (manifest: FloorManifest): number =>
  manifest.npcs.filter((npc) => {
    const choiceCount = npc.dialogue.nodes.reduce(
      (sum, node) => sum + node.choices.length,
      0,
    );
    return (
      npc.dialogue.nodes.length >= 2 &&
      dialogueMaxDepth(npc) >= 2 &&
      choiceCount >= 4
    );
  }).length;

const completionistCallbacksAnchored = (manifest: FloorManifest): boolean => {
  const observationTags = manifest.narration.observations.map(
    (observation) => observation.triggerTag,
  );
  const callbacks = new Set(manifest.metadata.callbacks);

  return (
    observationTags.length >= 2 &&
    observationTags.every((tag) => callbacks.has(tag)) &&
    structuredTagIncludesAny(manifest, COMPLETIONIST_CALLBACK_TERMS) &&
    narrationMentionsAuthoredName(manifest, ["npc", "quest"])
  );
};

const contentVarianceScore = (manifest: FloorManifest): number =>
  [
    behaviorKinds(manifest).size >= 3,
    itemKinds(manifest).size >= 3,
    manifest.traps.length >= 2 || trapEffectKinds(manifest).size >= 2,
    placementDistances(manifest).size >= 2,
    new Set(manifest.metadata.callbacks).size >= 2 &&
      manifest.narration.observations.length >= 2,
  ].filter(Boolean).length;

const narrationReferencesHoardingFacts = (
  manifest: FloorManifest,
  facts: BehavioralFacts,
): boolean =>
  facts.itemPickups > facts.itemUses &&
  textIncludesAny(narrationText(manifest), INVENTORY_PRESSURE_TERMS) &&
  narrationMentionsAuthoredName(manifest, ["item"]);

const narrationReferencesPacifistFacts = (
  manifest: FloorManifest,
  facts: BehavioralFacts,
): boolean =>
  facts.fightsAvoided + facts.retreatCount > 0 &&
  textIncludesAny(narrationText(manifest), CAUTION_RESPONSE_TERMS) &&
  narrationMentionsAuthoredName(manifest, ["roster"]);

const narrationReferencesSpeedFacts = (
  manifest: FloorManifest,
  facts: BehavioralFacts,
): boolean =>
  facts.explorationRatio <= 0.14 &&
  textIncludesAny(narrationText(manifest), PACE_RESPONSE_TERMS) &&
  structuredTagIncludesAny(manifest, STRUCTURED_ROUTE_TERMS);

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
      description:
        "Narration ties hoarded/carrying pressure to a named authored item.",
      uncertain: true,
      detect: (manifest, facts) =>
        hoarderTrace(facts) &&
        narrationReferencesHoardingFacts(manifest, facts),
    },
    {
      id: "pacifist_route_options",
      persona: "pacifist",
      description:
        "Low enemy density, wide route span, and spread/far placements offer avoidance routes.",
      detect: (manifest, facts) =>
        pacifistTrace(facts) && hasRouteOptionShape(manifest),
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

        return hasSoftThreatShape(manifest);
      },
    },
    {
      id: "pacifist_caution_narration",
      persona: "pacifist",
      description:
        "Narration ties avoided/retreated combat to a named authored threat.",
      detect: (manifest, facts) =>
        pacifistTrace(facts) &&
        narrationReferencesPacifistFacts(manifest, facts),
    },
    {
      id: "speedrunner_compact_floor",
      persona: "speedrunner",
      description:
        "Compact floor with structured stairs/exit signal for fast routing.",
      detect: (manifest, facts) =>
        speedrunnerTrace(facts) && hasCompactStairsShape(manifest),
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
      description:
        "Narration ties low-exploration play to structured stairs/exit routing.",
      uncertain: true,
      detect: (manifest, facts) =>
        speedrunnerTrace(facts) &&
        narrationReferencesSpeedFacts(manifest, facts),
    },
    {
      id: "completionist_dialogue_depth",
      persona: "completionist",
      description:
        "At least one NPC has multi-node, multi-choice dialogue depth.",
      detect: (manifest, facts) =>
        completionistTrace(facts) && richDialogueNpcCount(manifest) > 0,
    },
    {
      id: "completionist_quest_richness",
      persona: "completionist",
      description:
        "Quest has multiple richness signals: title, reward, entity reference, and NPC linkage.",
      detect: (manifest, facts) =>
        completionistTrace(facts) && questRichnessScore(manifest) >= 4,
    },
    {
      id: "completionist_rich_callbacks",
      persona: "completionist",
      description:
        "Multiple callback observations are anchored to NPC or quest content.",
      detect: (manifest, facts) =>
        completionistTrace(facts) && completionistCallbacksAnchored(manifest),
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

        return behaviorKinds(manifest).size >= 3;
      },
    },
    {
      id: "chaos_trap_variety",
      persona: "chaos",
      description: "Multiple traps or mixed trap/item effect verbs.",
      uncertain: true,
      detect: (manifest, facts) =>
        chaosTrace(facts) &&
        (manifest.traps.length >= 2 || trapEffectKinds(manifest).size >= 2),
    },
    {
      id: "chaos_content_variance",
      persona: "chaos",
      description:
        "Within-seed content varies across behavior, item, trap, placement, and callback axes.",
      uncertain: true,
      detect: (manifest, facts) =>
        chaosTrace(facts) && contentVarianceScore(manifest) >= 4,
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
        manifest.roster.length >= 2 &&
        contentVarianceScore(manifest) >= 2,
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
