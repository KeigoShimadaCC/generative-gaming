import { config as defaultConfig } from "../../config/index.js";
import { runEvent, type DeepNarrationEvent } from "../../engine/run/events.js";
import type {
  EngineLogEvent,
  EntityInstance,
  GameState,
  SerializableRecord,
} from "../../engine/state/index.js";
import type { NarrationBeats } from "../../schemas/entities/index.js";

export type NarrationTriggerConfig = {
  readonly maxObservationBeatsPerFloor?: number;
  readonly fleeMoveEvents?: number;
  readonly hoardEvents?: number;
  readonly quaffEvents?: number;
};

export type NarrationEvaluationResult = {
  readonly state: GameState;
  readonly events: readonly DeepNarrationEvent[];
};

type NarrationRuntimeState = {
  readonly floorIntroFired: boolean;
  readonly firedBeatIds: readonly string[];
  readonly observationBeatCount: number;
  readonly sightedEntityIds: readonly string[];
  readonly actionPatternCounts: {
    readonly fleeMoveEvents: number;
    readonly hoardEvents: number;
    readonly quaffEvents: number;
  };
};

const DEFAULT_TRIGGER_CONFIG = {
  maxObservationBeatsPerFloor:
    defaultConfig.directorManifest.narrationBeats.triggeredObservationLinesMax,
  fleeMoveEvents: 3,
  hoardEvents: 2,
  quaffEvents: 1,
} as const satisfies Required<NarrationTriggerConfig>;

const FLOOR_INTRO_BEAT_ID = "floor-intro";

export const evaluateNarrationBeats = (
  state: GameState,
  sourceEvents: readonly EngineLogEvent[],
  options: NarrationTriggerConfig = {},
): NarrationEvaluationResult => {
  const narration = narrationFromState(state);
  if (narration === null) {
    return { state, events: [] };
  }

  const triggerConfig = { ...DEFAULT_TRIGGER_CONFIG, ...options };
  const runtime = runtimeFromState(state);
  const actionPatternCounts = countActionPatterns(
    runtime.actionPatternCounts,
    sourceEvents,
  );
  const sightedEntityIds = collectSightedEntityIds(state, sourceEvents);
  const newlySightedEntityIds = sightedEntityIds.filter(
    (entityId) => !runtime.sightedEntityIds.includes(entityId),
  );
  let nextRuntime: NarrationRuntimeState = {
    ...runtime,
    actionPatternCounts,
    sightedEntityIds: mergeStrings(runtime.sightedEntityIds, sightedEntityIds),
  };
  const narrationEvents: DeepNarrationEvent[] = [];

  if (
    !nextRuntime.floorIntroFired &&
    sourceEvents.some(
      (event) =>
        event.type === "run_floor_entered" &&
        event.data.depth === state.floor.depth,
    )
  ) {
    narrationEvents.push(
      createDeepNarrationEvent(
        state,
        sourceEvents,
        FLOOR_INTRO_BEAT_ID,
        "floor_intro",
        null,
        narration.floorIntro,
      ),
    );
    nextRuntime = {
      ...nextRuntime,
      floorIntroFired: true,
      firedBeatIds: mergeStrings(nextRuntime.firedBeatIds, [
        FLOOR_INTRO_BEAT_ID,
      ]),
    };
  }

  for (const beat of narration.observations) {
    if (
      nextRuntime.observationBeatCount >=
        triggerConfig.maxObservationBeatsPerFloor ||
      nextRuntime.firedBeatIds.includes(beat.id)
    ) {
      continue;
    }

    if (
      !triggerMatches(
        beat.triggerTag,
        sourceEvents,
        state,
        nextRuntime,
        newlySightedEntityIds,
        triggerConfig,
      )
    ) {
      continue;
    }

    narrationEvents.push(
      createDeepNarrationEvent(
        state,
        sourceEvents,
        beat.id,
        "observation",
        beat.triggerTag,
        beat.text,
      ),
    );
    nextRuntime = {
      ...nextRuntime,
      firedBeatIds: mergeStrings(nextRuntime.firedBeatIds, [beat.id]),
      observationBeatCount: nextRuntime.observationBeatCount + 1,
    };
  }

  return {
    state: withNarrationRuntime(
      {
        ...state,
        log:
          narrationEvents.length === 0
            ? state.log
            : [...state.log, ...narrationEvents],
      },
      nextRuntime,
    ),
    events: narrationEvents,
  };
};

const createDeepNarrationEvent = (
  state: GameState,
  sourceEvents: readonly EngineLogEvent[],
  beatId: string,
  beatKind: DeepNarrationEvent["data"]["beatKind"],
  triggerTag: string | null,
  text: string,
): DeepNarrationEvent =>
  runEvent(latestTurn(sourceEvents, state.run.turn), "deep_narration", {
    depth: state.floor.depth,
    beatId,
    beatKind,
    triggerTag,
    text,
  });

const triggerMatches = (
  triggerTag: string,
  sourceEvents: readonly EngineLogEvent[],
  state: GameState,
  runtime: NarrationRuntimeState,
  newlySightedEntityIds: readonly string[],
  triggerConfig: Required<NarrationTriggerConfig>,
): boolean => {
  const tag = normalizeTriggerToken(triggerTag);
  const sightTarget = parseFirstSightTarget(tag);
  if (sightTarget !== null) {
    return newlySightedEntityIds.some((entityId) =>
      entityMatchesSightTarget(state.entities[entityId], entityId, sightTarget),
    );
  }

  switch (tag) {
    case "first-room":
      return sourceEvents.some((event) => event.type === "run_floor_entered");
    case "first-blood":
      return sourceEvents.some(
        (event) => event.type === "attack_hit" || event.type === "entity_died",
      );
    case "npc-met":
      return sourceEvents.some(
        (event) =>
          event.type === "dialogue_opened" ||
          event.type === "talk_intent" ||
          event.type === "quest_offer_hook",
      );
    case "dead-end":
      return sourceEvents.some(
        (event) => event.type === "bumped_wall" && event.data.actorId === "player",
      );
    case "flee":
    case "flee-pattern":
      return runtime.actionPatternCounts.fleeMoveEvents >=
        triggerConfig.fleeMoveEvents;
    case "hoard":
    case "hoard-pattern":
      return (
        runtime.actionPatternCounts.hoardEvents >= triggerConfig.hoardEvents ||
        sourceEvents.some((event) => event.type === "hoard_taken")
      );
    case "quaff":
    case "quaff-pattern":
      return runtime.actionPatternCounts.quaffEvents >= triggerConfig.quaffEvents;
    default:
      return sourceEvents.some(
        (event) => normalizeTriggerToken(event.type) === tag,
      );
  }
};

const parseFirstSightTarget = (tag: string): string | null => {
  for (const prefix of ["first-sight-", "first-sight:", "sight-"]) {
    if (tag.startsWith(prefix)) {
      const target = tag.slice(prefix.length).trim();
      return target.length === 0 ? null : target;
    }
  }

  return null;
};

const entityMatchesSightTarget = (
  entity: EntityInstance | undefined,
  entityId: string,
  target: string,
): boolean => {
  if (entity === undefined) {
    return normalizeTriggerToken(entityId) === target;
  }

  const values = [
    entityId,
    entity.kind,
    pluralEntityKind(entity.kind),
    entity.definition.id,
    entity.definition.name,
    "origin" in entity.definition ? entity.definition.origin : "",
  ];

  return values.some((value) => normalizeTriggerToken(value) === target);
};

const pluralEntityKind = (kind: EntityInstance["kind"]): string => {
  switch (kind) {
    case "enemy":
      return "enemies";
    case "npc":
      return "npcs";
    case "item":
      return "items";
    case "trap":
      return "traps";
  }
};

const countActionPatterns = (
  counts: NarrationRuntimeState["actionPatternCounts"],
  events: readonly EngineLogEvent[],
): NarrationRuntimeState["actionPatternCounts"] => {
  let fleeMoveEvents = counts.fleeMoveEvents;
  let hoardEvents = counts.hoardEvents;
  let quaffEvents = counts.quaffEvents;

  for (const event of events) {
    switch (event.type) {
      case "run_action_resolved":
      case "action_resolved":
        if (event.data.actionKind === "move") {
          fleeMoveEvents += 1;
        }
        if (event.data.actionKind === "pickup") {
          hoardEvents += 1;
        }
        if (event.data.actionKind === "use_item") {
          quaffEvents += 1;
        }
        break;
      case "item_picked_up":
        hoardEvents += 1;
        break;
      case "hoard_taken":
        hoardEvents += 1;
        break;
      case "item_triggered":
        if (event.data.trigger === "quaff") {
          quaffEvents += 1;
        }
        break;
      default:
        break;
    }
  }

  return { fleeMoveEvents, hoardEvents, quaffEvents };
};

const collectSightedEntityIds = (
  state: GameState,
  events: readonly EngineLogEvent[],
): readonly string[] => {
  const ids = new Set<string>();

  for (const event of events) {
    switch (event.type) {
      case "ambusher_revealed":
      case "mimic_revealed":
        ids.add(event.data.actorId);
        break;
      case "trap_step_triggered":
        ids.add(event.data.trapId);
        break;
      case "item_picked_up":
        ids.add(event.data.entityId);
        break;
      case "dialogue_opened":
        ids.add(event.data.npcId);
        break;
      default:
        break;
    }
  }

  for (const entityId of revealedEntityIdsFromState(state)) {
    ids.add(entityId);
  }

  return [...ids].sort();
};

const revealedEntityIdsFromState = (state: GameState): readonly string[] => {
  const knowledge = floorKnowledgeRecord(state);
  const ids = [
    ...stringArrayFromRecord(knowledge, "revealedEnemyIds"),
    ...stringArrayFromRecord(knowledge, "revealedItemIds"),
    ...stringArrayFromRecord(knowledge, "revealedTrapIds"),
  ];

  for (const entity of Object.values(state.entities)) {
    if (entity.behaviorRuntime.revealed === true) {
      ids.push(entity.id);
    }
  }

  return mergeStrings([], ids);
};

const narrationFromState = (state: GameState): NarrationBeats | null => {
  const director = directorRecord(state);
  if (director === null) {
    return null;
  }

  const narration = director.narration;
  return isNarrationBeats(narration) ? narration : null;
};

const runtimeFromState = (state: GameState): NarrationRuntimeState => {
  const director = directorRecord(state);
  const raw = recordValue(director, "narrationRuntime");

  if (!isRecord(raw)) {
    return emptyRuntime();
  }

  const actionPatternCounts = recordValue(raw, "actionPatternCounts");

  return {
    floorIntroFired: raw.floorIntroFired === true,
    firedBeatIds: stringArrayFromRecord(raw, "firedBeatIds"),
    observationBeatCount: numberFromRecord(raw, "observationBeatCount"),
    sightedEntityIds: stringArrayFromRecord(raw, "sightedEntityIds"),
    actionPatternCounts: {
      fleeMoveEvents: isRecord(actionPatternCounts)
        ? numberFromRecord(actionPatternCounts, "fleeMoveEvents")
        : 0,
      hoardEvents: isRecord(actionPatternCounts)
        ? numberFromRecord(actionPatternCounts, "hoardEvents")
        : 0,
      quaffEvents: isRecord(actionPatternCounts)
        ? numberFromRecord(actionPatternCounts, "quaffEvents")
        : 0,
    },
  };
};

const withNarrationRuntime = (
  state: GameState,
  runtime: NarrationRuntimeState,
): GameState => {
  const opaque = state.floor.geometry.opaque;
  if (opaque === null) {
    return state;
  }

  const knowledge = floorKnowledgeRecord(state);
  const director = directorRecord(state) ?? {};

  return {
    ...state,
    floor: {
      ...state.floor,
      geometry: {
        ...state.floor.geometry,
        opaque: {
          ...opaque,
          knowledge: {
            ...knowledge,
            director: {
              ...director,
              narrationRuntime: runtimeToRecord(runtime),
            },
          },
        },
      },
    },
  };
};

const emptyRuntime = (): NarrationRuntimeState => ({
  floorIntroFired: false,
  firedBeatIds: [],
  observationBeatCount: 0,
  sightedEntityIds: [],
  actionPatternCounts: {
    fleeMoveEvents: 0,
    hoardEvents: 0,
    quaffEvents: 0,
  },
});

const runtimeToRecord = (
  runtime: NarrationRuntimeState,
): SerializableRecord => ({
  floorIntroFired: runtime.floorIntroFired,
  firedBeatIds: runtime.firedBeatIds,
  observationBeatCount: runtime.observationBeatCount,
  sightedEntityIds: runtime.sightedEntityIds,
  actionPatternCounts: {
    fleeMoveEvents: runtime.actionPatternCounts.fleeMoveEvents,
    hoardEvents: runtime.actionPatternCounts.hoardEvents,
    quaffEvents: runtime.actionPatternCounts.quaffEvents,
  },
});

const floorKnowledgeRecord = (state: GameState): Record<string, unknown> => {
  const knowledge = state.floor.geometry.opaque?.knowledge;
  return isRecord(knowledge) ? knowledge : {};
};

const directorRecord = (
  state: GameState,
): Record<string, unknown> | null => {
  const director = floorKnowledgeRecord(state).director;
  return isRecord(director) ? director : null;
};

const recordValue = (
  record: Record<string, unknown> | null,
  key: string,
): unknown => (record === null ? undefined : record[key]);

const isNarrationBeats = (value: unknown): value is NarrationBeats => {
  if (!isRecord(value) || typeof value.floorIntro !== "string") {
    return false;
  }

  if (!Array.isArray(value.observations)) {
    return false;
  }

  return value.observations.every(
    (beat) =>
      isRecord(beat) &&
      typeof beat.id === "string" &&
      typeof beat.triggerTag === "string" &&
      typeof beat.text === "string",
  );
};

const stringArrayFromRecord = (
  record: Record<string, unknown>,
  key: string,
): readonly string[] => {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
};

const numberFromRecord = (
  record: Record<string, unknown>,
  key: string,
): number => {
  const value = record[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
};

const mergeStrings = (
  existing: readonly string[],
  additions: readonly string[],
): readonly string[] => [...new Set([...existing, ...additions])].sort();

const latestTurn = (
  sourceEvents: readonly EngineLogEvent[],
  fallbackTurn: number,
): number => sourceEvents.at(-1)?.turn ?? fallbackTurn;

const normalizeTriggerToken = (value: string): string =>
  value.trim().toLowerCase().replace(/[_\s:]+/g, "-");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
