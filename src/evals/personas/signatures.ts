import type { ParsedTrace } from "../../harness/replay/types.js";
import type { BehavioralFacts } from "../../director/prompt/summarize.js";
import type {
  PersonaName,
  PersonaSignatureCheck,
  PersonaSignatureProfile,
} from "./types.js";

const mean = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

export const traceFloorsEntered = (trace: ParsedTrace): number =>
  trace.turns.filter((turn) =>
    turn.events.some((event) => event.type === "run_floor_entered"),
  ).length + 1;

export const traceActionKinds = (trace: ParsedTrace): readonly string[] => [
  ...new Set(
    trace.turns.map((turn) => (turn.action as { kind: string }).kind),
  ),
];

export const traceActionFingerprint = (trace: ParsedTrace): string =>
  trace.turns
    .map((turn) => (turn.action as { kind: string }).kind)
    .join("|");

export const personaSignatureProfiles: Record<
  PersonaName,
  PersonaSignatureProfile
> = {
  hoarder: {
    name: "hoarder",
    checks: [
      {
        label: "hoarder_pickups_exceed_uses",
        pass: (facts) => facts.itemPickups > facts.itemUses,
      },
      {
        label: "hoarder_hoarding_signal_high",
        pass: (facts) => facts.hoardingSignal >= 2,
      },
      {
        label: "hoarder_low_combat_engagement",
        pass: (facts) => facts.combatEngagementRate <= 0.35,
      },
    ],
  },
  pacifist: {
    name: "pacifist",
    checks: [
      {
        label: "pacifist_no_fights_picked",
        pass: (facts) => facts.fightsPicked === 0,
      },
      {
        label: "pacifist_zero_combat_engagement",
        pass: (facts) => facts.combatEngagementRate === 0,
      },
      {
        label: "pacifist_avoids_or_retreats",
        pass: (facts) => facts.fightsAvoided > 0 || facts.retreatCount > 0,
      },
    ],
  },
  speedrunner: {
    name: "speedrunner",
    checks: [
      {
        label: "speedrunner_few_pickups",
        pass: (facts) => facts.itemPickups <= 2,
      },
      {
        label: "speedrunner_low_per_floor_exploration",
        pass: (facts) => facts.explorationRatio <= 0.14,
      },
    ],
  },
  completionist: {
    name: "completionist",
    checks: [
      {
        label: "completionist_talks_to_npcs",
        pass: (facts) => facts.npcTalksInitiated > 0,
      },
      {
        label: "completionist_broad_coverage",
        pass: (facts) => facts.cellsVisited >= 35,
      },
    ],
  },
  chaos: {
    name: "chaos",
    checks: [],
  },
};

export const verifyPersonaSignature = (
  persona: PersonaName,
  facts: BehavioralFacts,
): readonly string[] => {
  const profile = personaSignatureProfiles[persona];
  return profile.checks
    .filter((check) => !check.pass(facts))
    .map((check) => check.label);
};

export const verifyChaosTrace = (
  trace: ParsedTrace,
): readonly string[] => {
  const failures: string[] = [];
  const kinds = traceActionKinds(trace);
  if (kinds.length < 3) {
    failures.push("chaos_action_kind_diversity");
  }
  return failures;
};

export type PersonaAggregateFacts = {
  readonly persona: PersonaName;
  readonly samples: number;
  readonly facts: BehavioralFacts;
  readonly floorsEntered: number;
  readonly actionKinds: readonly string[];
};

export const aggregatePersonaFacts = (
  persona: PersonaName,
  factsList: readonly BehavioralFacts[],
  traces: readonly ParsedTrace[],
): PersonaAggregateFacts => ({
  persona,
  samples: factsList.length,
  facts: {
    combatEngagementRate: mean(
      factsList.map((facts) => facts.combatEngagementRate),
    ),
    fightsPicked: Math.round(mean(factsList.map((facts) => facts.fightsPicked))),
    fightsAvoided: Math.round(
      mean(factsList.map((facts) => facts.fightsAvoided)),
    ),
    retreatCount: Math.round(mean(factsList.map((facts) => facts.retreatCount))),
    retreatFrequency: mean(factsList.map((facts) => facts.retreatFrequency)),
    itemPickups: Math.round(mean(factsList.map((facts) => facts.itemPickups))),
    itemUses: Math.round(mean(factsList.map((facts) => facts.itemUses))),
    itemUsesByCategory: {},
    hoardingSignal: mean(factsList.map((facts) => facts.hoardingSignal)),
    npcTalksInitiated: Math.round(
      mean(factsList.map((facts) => facts.npcTalksInitiated)),
    ),
    explorationRatio: mean(factsList.map((facts) => facts.explorationRatio)),
    cellsVisited: Math.round(mean(factsList.map((facts) => facts.cellsVisited))),
    floorCellsEstimate: factsList[0]?.floorCellsEstimate ?? 0,
    closeCallCount: Math.round(
      mean(factsList.map((facts) => facts.closeCallCount)),
    ),
    killsByEnemyType: {},
    questAccepted: Math.round(
      mean(factsList.map((facts) => facts.questAccepted)),
    ),
    questRefused: Math.round(
      mean(factsList.map((facts) => facts.questRefused)),
    ),
    questCompleted: Math.round(
      mean(factsList.map((facts) => facts.questCompleted)),
    ),
    totalTurns: Math.round(mean(factsList.map((facts) => facts.totalTurns))),
  },
  floorsEntered: Math.round(
    mean(traces.map((trace) => traceFloorsEntered(trace))),
  ),
  actionKinds: [
    ...new Set(traces.flatMap((trace) => traceActionKinds(trace))),
  ].sort(),
});

export type SeparationFact =
  | "combatEngagementRate"
  | "hoardingSignal"
  | "explorationRatio"
  | "npcTalksInitiated"
  | "itemPickups"
  | "fightsPicked"
  | "fightsAvoided"
  | "cellsVisited"
  | "itemUses"
  | "floorsEntered";

export type PairwiseSeparation = {
  readonly left: PersonaName;
  readonly right: PersonaName;
  readonly facts: readonly SeparationFact[];
};

const SEPARATION_FACTS: readonly SeparationFact[] = [
  "combatEngagementRate",
  "hoardingSignal",
  "explorationRatio",
  "npcTalksInitiated",
  "itemPickups",
  "fightsPicked",
  "fightsAvoided",
  "cellsVisited",
  "itemUses",
  "floorsEntered",
];

const factValue = (
  aggregate: PersonaAggregateFacts,
  key: SeparationFact,
): number => {
  if (key === "floorsEntered") {
    return aggregate.floorsEntered;
  }
  return aggregate.facts[key];
};

const separatesPair = (
  left: PersonaAggregateFacts,
  right: PersonaAggregateFacts,
  key: SeparationFact,
  margin = 0.05,
): boolean => {
  const leftValue = factValue(left, key);
  const rightValue = factValue(right, key);
  if (leftValue === rightValue) {
    return false;
  }
  if (key === "combatEngagementRate" || key === "explorationRatio") {
    return Math.abs(leftValue - rightValue) >= margin;
  }
  return Math.abs(leftValue - rightValue) >= 1;
};

export const pairwiseSeparation = (
  left: PersonaAggregateFacts,
  right: PersonaAggregateFacts,
): PairwiseSeparation => ({
  left: left.persona,
  right: right.persona,
  facts: SEPARATION_FACTS.filter((fact) => separatesPair(left, right, fact)),
});

export const buildSeparationMatrix = (
  aggregates: readonly PersonaAggregateFacts[],
): readonly PairwiseSeparation[] => {
  const matrix: PairwiseSeparation[] = [];
  for (let leftIndex = 0; leftIndex < aggregates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < aggregates.length; rightIndex += 1) {
      const left = aggregates[leftIndex];
      const right = aggregates[rightIndex];
      if (left === undefined || right === undefined) {
        continue;
      }
      matrix.push(pairwiseSeparation(left, right));
    }
  }
  return matrix;
};

export const formatSeparationMatrix = (
  matrix: readonly PairwiseSeparation[],
): string =>
  matrix
    .map(
      (entry) =>
        `${entry.left} vs ${entry.right}: ${entry.facts.length} facts [${entry.facts.join(", ")}]`,
    )
    .join("\n");

export const failedSignatureChecks = (
  persona: PersonaName,
  factsList: readonly BehavioralFacts[],
): readonly { readonly traceIndex: number; readonly labels: readonly string[] }[] =>
  factsList.flatMap((facts, traceIndex) => {
    const labels = verifyPersonaSignature(persona, facts);
    return labels.length === 0 ? [] : [{ traceIndex, labels }];
  });

export const passesMajority = (
  checks: readonly PersonaSignatureCheck[],
  factsList: readonly BehavioralFacts[],
  required = 2,
): readonly string[] =>
  checks
    .filter((check) => {
      const passes = factsList.filter((facts) => check.pass(facts)).length;
      return passes < required;
    })
    .map((check) => check.label);
