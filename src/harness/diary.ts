import { buildLearnedSummary } from "../director/memory/callbacks.js";
import type { GenerationRecord } from "./artifacts/types.js";
import type { EngineLogEvent, GameState, TerminalStatus } from "../engine/state/index.js";
import {
  summarizeRun,
  summarizeRunEvents,
  type RunSummary,
} from "../engine/run/endings.js";

export type DiaryEntryKind =
  | "callback"
  | "close_call"
  | "discovery"
  | "floor"
  | "kill"
  | "narration"
  | "quest";

export type DiarySource =
  | {
      readonly kind: "event";
      readonly id: string;
      readonly eventType: string;
      readonly turn: number;
      readonly depth: number;
    }
  | {
      readonly kind: "artifact";
      readonly id: string;
      readonly runId: string;
      readonly depth: number;
      readonly artifactType: "generation";
    };

export type DiaryEntry = {
  readonly id: string;
  readonly depth: number;
  readonly turn: number;
  readonly kind: DiaryEntryKind;
  readonly title: string;
  readonly text: string;
  readonly sources: readonly DiarySource[];
};

export type DiaryFloorRecap = {
  readonly depth: number;
  readonly entries: readonly DiaryEntry[];
};

export type DiarySummaryStrip = {
  readonly outcome: "active" | "victory" | "defeat" | "aborted";
  readonly depth: number;
  readonly turns: number;
  readonly kills: number;
  readonly discoveries: number;
};

export type DungeonDiary = {
  readonly runId: string;
  readonly seed: string;
  readonly mode: "partial" | "final";
  readonly summary: DiarySummaryStrip;
  readonly floors: readonly DiaryFloorRecap[];
  readonly learnedNote: string;
  readonly sourceCount: number;
};

export type TraceTurnLike = {
  readonly events: readonly EngineLogEvent[];
};

export type TraceLike = {
  readonly turns: readonly TraceTurnLike[];
};

export type RunArtifacts = {
  readonly state?: GameState | null;
  readonly events?: readonly EngineLogEvent[];
  readonly trace?: TraceLike | null;
  readonly generations?: readonly GenerationRecord[];
};

type IndexedEvent = {
  readonly event: EngineLogEvent;
  readonly source: DiarySource;
};

const INITIAL_DEPTH = 1;

export const composeDiary = (artifacts: RunArtifacts): DungeonDiary => {
  const events = eventsFromArtifacts(artifacts);
  const indexedEvents = indexEvents(events);
  const summary = summaryFromArtifacts(artifacts, events);
  const entries = [
    ...entriesFromEvents(indexedEvents),
    ...entriesFromGenerations(artifacts.generations ?? []),
  ].sort(compareEntries);
  const floors = groupEntriesByFloor(entries, summary.depth);
  const state = artifacts.state ?? null;

  return {
    runId: state?.run.runId ?? runIdFromEvents(events) ?? "unknown-run",
    seed: state?.run.seed ?? seedFromEvents(events) ?? "unknown-seed",
    mode: summary.terminalStatus === "ACTIVE" ? "partial" : "final",
    summary: {
      outcome: outcomeFromTerminalStatus(summary.terminalStatus),
      depth: summary.depth,
      turns: summary.turns,
      kills: summary.kills,
      discoveries: summary.discoveries.length,
    },
    floors,
    learnedNote: buildLearnedSummary(
      {
        outcome: outcomePhrase(summary.terminalStatus),
        depth: summary.depth,
        turns: summary.turns,
      },
      events,
    ),
    sourceCount: sourceCount(entries),
  };
};

const eventsFromArtifacts = (artifacts: RunArtifacts): readonly EngineLogEvent[] => {
  if (artifacts.events !== undefined) {
    return [...artifacts.events];
  }

  if (artifacts.state !== null && artifacts.state !== undefined) {
    return [...artifacts.state.log];
  }

  if (artifacts.trace !== null && artifacts.trace !== undefined) {
    return artifacts.trace.turns.flatMap((turn) => turn.events);
  }

  return [];
};

const indexEvents = (events: readonly EngineLogEvent[]): readonly IndexedEvent[] => {
  let currentDepth = INITIAL_DEPTH;

  return events.map((event, index) => {
    currentDepth = depthForEvent(event, currentDepth);
    return {
      event,
      source: {
        kind: "event",
        id: `event:${index}:${event.type}:${event.turn}`,
        eventType: event.type,
        turn: event.turn,
        depth: currentDepth,
      },
    };
  });
};

const summaryFromArtifacts = (
  artifacts: RunArtifacts,
  events: readonly EngineLogEvent[],
): RunSummary => {
  const state = artifacts.state ?? null;
  return state === null
    ? summarizeRunEvents(events)
    : summarizeRun(state);
};

const entriesFromEvents = (
  indexedEvents: readonly IndexedEvent[],
): readonly DiaryEntry[] => {
  const entries: DiaryEntry[] = [];
  const callbackSources = new Map<string, DiarySource>();

  indexedEvents.forEach((indexed, index) => {
    const eventEntries = entriesForEvent(indexed, index);
    entries.push(...eventEntries);
    entries.push(...callbackEntriesForEvent(indexed, index, callbackSources));
  });

  return entries;
};

const entriesForEvent = (
  indexed: IndexedEvent,
  index: number,
): readonly DiaryEntry[] => {
  const { event, source } = indexed;

  switch (event.type) {
    case "run_floor_entered":
      return [
        entry(index, "floor", source, {
          title: `Floor ${event.data.depth}`,
          text: `You enter floor ${event.data.depth}, and the Deep records its shape.`,
        }),
      ];
    case "entity_died":
      if (event.data.kind !== "enemy") {
        return [];
      }
      return [
        entry(index, "kill", source, {
          title: "Kill",
          text: `You kill ${event.data.entityId}.`,
        }),
      ];
    case "attack_hit":
      if (
        event.data.defenderId === "player" &&
        isCloseCall(event.data.defenderHpAfter)
      ) {
        return [
          entry(index, "close_call", source, {
            title: "Close call",
            text: `You are struck down to ${event.data.defenderHpAfter} HP and keep moving.`,
          }),
        ];
      }
      return [];
    case "starvation":
      if (isCloseCall(event.data.hpAfter)) {
        return [
          entry(index, "close_call", source, {
            title: "Close call",
            text: `Hunger leaves you at ${event.data.hpAfter} HP.`,
          }),
        ];
      }
      return [];
    case "status_tick":
      if (
        event.data.entityId === "player" &&
        event.data.hpDelta < 0
      ) {
        return [
          entry(index, "close_call", source, {
            title: "Close call",
            text: `The ${event.data.status} takes ${Math.abs(event.data.hpDelta)} HP from you.`,
          }),
        ];
      }
      return [];
    case "item_identified":
      return [
        entry(index, "discovery", source, {
          title: "Discovery",
          text: `You learn ${event.data.definitionId}.`,
        }),
      ];
    case "hoard_taken":
      return [
        entry(index, "discovery", source, {
          title: "The Hoard",
          text: `You take ${event.data.name} from the Hoard.`,
        }),
      ];
    case "deep_narration":
      return [
        entry(index, "narration", source, {
          title:
            event.data.beatKind === "floor_intro"
              ? "The Deep opens the page"
              : "The Deep notices",
          text: event.data.text,
        }),
      ];
    case "dialogue_opened":
      return [
        entry(index, "discovery", source, {
          title: "The Kept",
          text: `You speak with ${event.data.npcId}.`,
        }),
      ];
    case "quest_offered":
      return [
        entry(index, "quest", source, {
          title: "Quest offered",
          text: `You are offered ${event.data.questId}.`,
        }),
      ];
    case "quest_accepted":
      return [
        entry(index, "quest", source, {
          title: "Quest accepted",
          text: `You accept ${event.data.questId}.`,
        }),
      ];
    case "quest_refused":
      return [
        entry(index, "quest", source, {
          title: "Quest refused",
          text: `You refuse ${event.data.questId}.`,
        }),
      ];
    case "quest_completed":
      return [
        entry(index, "quest", source, {
          title: "Quest completed",
          text: `You complete ${event.data.questId}.`,
        }),
      ];
    case "quest_failed":
      return [
        entry(index, "quest", source, {
          title: "Quest failed",
          text: `You fail ${event.data.questId}.`,
        }),
      ];
    case "quest_reward_paid":
      return [
        entry(index, "quest", source, {
          title: "Quest paid",
          text: `You are paid for ${event.data.questId}.`,
        }),
      ];
    case "quest_item_delivered":
      return [
        entry(index, "quest", source, {
          title: "Quest delivered",
          text: `You deliver ${event.data.itemDefinitionId} for ${event.data.questId}.`,
        }),
      ];
    default:
      return [];
  }
};

const entriesFromGenerations = (
  generations: readonly GenerationRecord[],
): readonly DiaryEntry[] =>
  generations.flatMap((record, index) => {
    if (record.outcome.kind !== "fallback") {
      return [];
    }

    const source: DiarySource = {
      kind: "artifact",
      id: `artifact:generation:${record.runId}:${record.depth}`,
      artifactType: "generation",
      runId: record.runId,
      depth: record.depth,
    };

    return [
      entry(index, "floor", source, {
        idPrefix: "artifact",
        turn: 0,
        title: "Old Stock",
        text: `You walk floor ${record.depth} by Old Stock: ${record.outcome.fallbackId}.`,
      }),
    ];
  });

const callbackEntriesForEvent = (
  indexed: IndexedEvent,
  index: number,
  callbackSources: Map<string, DiarySource>,
): readonly DiaryEntry[] => {
  const ids = referenceIdsFromEvent(indexed.event);
  const entries: DiaryEntry[] = [];

  for (const id of ids) {
    const previous = callbackSources.get(id);
    callbackSources.set(id, indexed.source);
    if (previous === undefined) {
      continue;
    }

    entries.push({
      id: `callback:${index}:${id}`,
      depth: indexed.source.depth,
      turn: indexed.event.turn,
      kind: "callback",
      title: "Callback",
      text: `The Deep keeps ${id} on the page.`,
      sources: [previous, indexed.source],
    });
  }

  return entries;
};

const entry = (
  index: number,
  kind: DiaryEntryKind,
  source: DiarySource,
  options: {
    readonly idPrefix?: string;
    readonly title: string;
    readonly text: string;
    readonly turn?: number;
  },
): DiaryEntry => ({
  id: `${options.idPrefix ?? "event"}:${index}:${kind}:${source.id}`,
  depth: source.depth,
  turn: options.turn ?? (source.kind === "event" ? source.turn : 0),
  kind,
  title: options.title,
  text: options.text,
  sources: [source],
});

const groupEntriesByFloor = (
  entries: readonly DiaryEntry[],
  fallbackDepth: number,
): readonly DiaryFloorRecap[] => {
  const depthSet = new Set<number>(
    entries.map((diaryEntry) => diaryEntry.depth),
  );
  const maxDepth = Math.max(fallbackDepth, ...depthSet, INITIAL_DEPTH);
  const floors: DiaryFloorRecap[] = [];

  for (let depth = INITIAL_DEPTH; depth <= maxDepth; depth += 1) {
    floors.push({
      depth,
      entries: entries.filter((diaryEntry) => diaryEntry.depth === depth),
    });
  }

  return floors;
};

const depthForEvent = (
  event: EngineLogEvent,
  currentDepth: number,
): number => {
  const data = event.data as Readonly<Record<string, unknown>>;
  const depth = data.depth;

  if (typeof depth === "number" && Number.isSafeInteger(depth)) {
    return depth;
  }

  if (event.type === "state_created") {
    return event.data.depth;
  }

  return currentDepth;
};

const referenceIdsFromEvent = (event: EngineLogEvent): readonly string[] => {
  const data = event.data as Readonly<Record<string, unknown>>;
  const ids = new Set<string>();
  const keys = [
    "actorId",
    "defenderId",
    "entityId",
    "itemInstanceId",
    "npcId",
    "questId",
    "sourceEntityId",
    "sourceId",
    "targetId",
    "trapId",
  ] as const;
  const arrayKeys = ["targetIds", "entityIds"] as const;

  for (const key of keys) {
    const value = data[key];
    if (isCallbackId(value)) {
      ids.add(value);
    }
  }

  for (const key of arrayKeys) {
    const value = data[key];
    if (!Array.isArray(value)) {
      continue;
    }

    for (const entryValue of value) {
      if (isCallbackId(entryValue)) {
        ids.add(entryValue);
      }
    }
  }

  return [...ids].sort();
};

const isCallbackId = (value: unknown): value is string =>
  typeof value === "string" &&
  (/^(enemy|npc|item|trap)#[1-9][0-9]*$/u.test(value) ||
    value.startsWith("quest-"));

const isCloseCall = (hp: number): boolean => hp > 0 && hp <= 3;

const outcomeFromTerminalStatus = (
  status: TerminalStatus,
): DiarySummaryStrip["outcome"] => {
  switch (status) {
    case "WIN":
      return "victory";
    case "LOSS":
      return "defeat";
    case "ABORTED":
      return "aborted";
    case "ACTIVE":
      return "active";
  }
};

const outcomePhrase = (status: TerminalStatus): string => {
  switch (status) {
    case "WIN":
      return "victory";
    case "LOSS":
      return "defeat";
    case "ABORTED":
      return "abort";
    case "ACTIVE":
      return "ongoing";
  }
};

const runIdFromEvents = (events: readonly EngineLogEvent[]): string | null => {
  const created = events.find((event) => event.type === "state_created");
  return created?.type === "state_created" ? created.data.runId : null;
};

const seedFromEvents = (events: readonly EngineLogEvent[]): string | null => {
  const created = events.find((event) => event.type === "state_created");
  return created?.type === "state_created" ? created.data.seed : null;
};

const compareEntries = (left: DiaryEntry, right: DiaryEntry): number =>
  left.depth - right.depth ||
  left.turn - right.turn ||
  left.id.localeCompare(right.id);

const sourceCount = (entries: readonly DiaryEntry[]): number =>
  new Set(
    entries.flatMap((diaryEntry) =>
      diaryEntry.sources.map((source) => source.id),
    ),
  ).size;
