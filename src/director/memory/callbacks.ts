import type { RunSummary } from "../../harness/persistence/index.js";

export type CallbackRunEvent = {
  readonly turn?: number;
  readonly type: string;
  readonly data?: unknown;
};

export type CallbackReferenceKind = "entity" | "quest";

export type CallbackReference = {
  readonly kind: CallbackReferenceKind;
  readonly id: string;
  readonly firstTurn: number;
  readonly lastTurn: number;
  readonly count: number;
  readonly eventTypes: readonly string[];
};

export type RunCallbackSnapshot = {
  readonly entities: readonly CallbackReference[];
  readonly quests: readonly CallbackReference[];
};

export type RunCallbackTracker = {
  readonly recordEvent: (event: CallbackRunEvent) => void;
  readonly recordEvents: (events: readonly CallbackRunEvent[]) => void;
  readonly snapshot: () => RunCallbackSnapshot;
};

export type RunCallbackRenderOptions = {
  readonly maxReferencesPerKind?: number;
  readonly tokenBudget?: number;
};

const DEFAULT_CALLBACK_TOKEN_BUDGET = 90;
const DEFAULT_REFERENCES_PER_KIND = 4;
const CALLBACK_HEADER = "Earlier this run:";
const ENTITY_ID_PATTERN = /^(enemy|npc|item|trap)#[1-9][0-9]*$/;
const AVG_CHARS_PER_TOKEN = 4;

const ENTITY_REFERENCE_KEYS = [
  "actorId",
  "defenderId",
  "entityId",
  "npcId",
  "sourceEntityId",
  "sourceId",
  "targetId",
  "trapId",
] as const;
const ENTITY_REFERENCE_ARRAY_KEYS = ["targetIds", "entityIds"] as const;
const QUEST_REFERENCE_KEYS = ["questId"] as const;

export const createRunCallbackTracker = (): RunCallbackTracker => {
  const entities = new Map<string, MutableCallbackReference>();
  const quests = new Map<string, MutableCallbackReference>();

  const recordEvent = (event: CallbackRunEvent): void => {
    const data = asRecord(event.data);
    if (data === null) {
      return;
    }

    const turn = event.turn ?? 0;
    for (const entityId of entityIdsFromData(data)) {
      upsertReference(entities, "entity", entityId, event.type, turn);
    }
    for (const questId of questIdsFromData(data)) {
      upsertReference(quests, "quest", questId, event.type, turn);
    }
  };

  return {
    recordEvent,
    recordEvents: (events) => {
      for (const event of events) {
        recordEvent(event);
      }
    },
    snapshot: () => ({
      entities: freezeReferences(entities),
      quests: freezeReferences(quests),
    }),
  };
};

export const renderRunCallbackBlock = (
  snapshot: RunCallbackSnapshot,
  options: RunCallbackRenderOptions = {},
): string => {
  const maxReferences =
    options.maxReferencesPerKind ?? DEFAULT_REFERENCES_PER_KIND;
  const tokenBudget = options.tokenBudget ?? DEFAULT_CALLBACK_TOKEN_BUDGET;
  const lines = [CALLBACK_HEADER];
  appendReferenceLines(lines, snapshot.quests, maxReferences, tokenBudget);
  appendReferenceLines(lines, snapshot.entities, maxReferences, tokenBudget);
  return lines.length === 1 ? "" : lines.join("\n");
};

export const buildLearnedSummary = (
  runSummary: RunSummary,
  events: readonly CallbackRunEvent[],
): string => {
  const runFacts = runFactsFromSummary(runSummary);
  const tracker = createRunCallbackTracker();
  tracker.recordEvents(events);
  const snapshot = tracker.snapshot();
  const deathCount = events.filter(isPlayerDeathEvent).length;
  const refusedQuestIds = eventIdsByType(events, "quest_refused", "questId");
  const completedQuestIds = eventIdsByType(events, "quest_completed", "questId");
  const failedQuestIds = eventIdsByType(events, "quest_failed", "questId");
  const hoardNames = eventIdsByType(events, "hoard_taken", "name");

  const clauses = [runFacts];
  if (deathCount > 0) {
    clauses.push("the delver died");
  }
  if (refusedQuestIds.length > 0) {
    clauses.push(`refused ${joinReadable(refusedQuestIds)}`);
  }
  if (completedQuestIds.length > 0) {
    clauses.push(`completed ${joinReadable(completedQuestIds)}`);
  }
  if (failedQuestIds.length > 0) {
    clauses.push(`failed ${joinReadable(failedQuestIds)}`);
  }
  if (hoardNames.length > 0) {
    clauses.push(`reached the Hoard for ${joinReadable(hoardNames)}`);
  }
  if (snapshot.entities.length > 0) {
    clauses.push(
      `callbacks should remember ${joinReadable(
        snapshot.entities.slice(0, 3).map((entity) => entity.id),
      )}`,
    );
  }

  return `What the dungeon learned: ${clauses.join("; ")}.`;
};

type MutableCallbackReference = {
  readonly kind: CallbackReferenceKind;
  readonly id: string;
  firstTurn: number;
  lastTurn: number;
  count: number;
  readonly eventTypes: Set<string>;
};

const upsertReference = (
  references: Map<string, MutableCallbackReference>,
  kind: CallbackReferenceKind,
  id: string,
  eventType: string,
  turn: number,
): void => {
  const current = references.get(id);
  if (current === undefined) {
    references.set(id, {
      kind,
      id,
      firstTurn: turn,
      lastTurn: turn,
      count: 1,
      eventTypes: new Set([eventType]),
    });
    return;
  }

  current.firstTurn = Math.min(current.firstTurn, turn);
  current.lastTurn = Math.max(current.lastTurn, turn);
  current.count += 1;
  current.eventTypes.add(eventType);
};

const freezeReferences = (
  references: ReadonlyMap<string, MutableCallbackReference>,
): readonly CallbackReference[] =>
  [...references.values()]
    .map((reference) => ({
      kind: reference.kind,
      id: reference.id,
      firstTurn: reference.firstTurn,
      lastTurn: reference.lastTurn,
      count: reference.count,
      eventTypes: [...reference.eventTypes].sort(),
    }))
    .sort(
      (left, right) =>
        left.firstTurn - right.firstTurn
        || left.id.localeCompare(right.id),
    );

const appendReferenceLines = (
  lines: string[],
  references: readonly CallbackReference[],
  maxReferences: number,
  tokenBudget: number,
): void => {
  for (const reference of references.slice(0, maxReferences)) {
    const nextLine = `- ${reference.kind} ${reference.id}: ${reference.eventTypes.join(
      ", ",
    )} (${reference.count})`;
    const nextBlock = [...lines, nextLine].join("\n");
    if (approxTokens(nextBlock) > tokenBudget) {
      return;
    }
    lines.push(nextLine);
  }
};

const entityIdsFromData = (
  data: Readonly<Record<string, unknown>>,
): readonly string[] => {
  const ids = new Set<string>();
  for (const key of ENTITY_REFERENCE_KEYS) {
    const value = data[key];
    if (typeof value === "string" && ENTITY_ID_PATTERN.test(value)) {
      ids.add(value);
    }
  }
  for (const key of ENTITY_REFERENCE_ARRAY_KEYS) {
    const value = data[key];
    if (!Array.isArray(value)) {
      continue;
    }
    for (const entry of value) {
      if (typeof entry === "string" && ENTITY_ID_PATTERN.test(entry)) {
        ids.add(entry);
      }
    }
  }
  return [...ids].sort();
};

const questIdsFromData = (
  data: Readonly<Record<string, unknown>>,
): readonly string[] => {
  const ids = new Set<string>();
  for (const key of QUEST_REFERENCE_KEYS) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) {
      ids.add(value.trim());
    }
  }
  return [...ids].sort();
};

const runFactsFromSummary = (runSummary: RunSummary): string => {
  const outcome = scalarText(runSummary.outcome) ?? "ended";
  const depth = scalarText(runSummary.depth);
  const turns = scalarText(runSummary.turns);
  const depthText = depth === null ? "" : ` on floor ${depth}`;
  const turnText = turns === null ? "" : ` after ${turns} turns`;
  return `the run ended in ${outcome}${depthText}${turnText}`;
};

const eventIdsByType = (
  events: readonly CallbackRunEvent[],
  eventType: string,
  dataKey: string,
): readonly string[] => {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type !== eventType) {
      continue;
    }
    const data = asRecord(event.data);
    const value = data?.[dataKey];
    if (typeof value === "string" && value.trim().length > 0) {
      ids.add(value.trim());
    }
  }
  return [...ids].sort();
};

const isPlayerDeathEvent = (event: CallbackRunEvent): boolean => {
  if (event.type !== "entity_died") {
    return false;
  }
  const data = asRecord(event.data);
  return data?.kind === "player" || data?.entityId === "player";
};

const joinReadable = (values: readonly string[]): string => {
  if (values.length === 0) {
    return "";
  }
  if (values.length === 1) {
    return values[0] ?? "";
  }
  const head = values.slice(0, -1).join(", ");
  return `${head}, and ${values[values.length - 1]}`;
};

const scalarText = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
};

const asRecord = (
  value: unknown,
): Readonly<Record<string, unknown>> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;

const approxTokens = (text: string): number =>
  Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
