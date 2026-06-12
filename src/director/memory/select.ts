import type {
  MemoryEventRow,
  MemoryEventType,
  MemoryEventsRepository,
} from "../../harness/persistence/index.js";

export type MemoryTypeWeights = Readonly<Record<MemoryEventType, number>>;

export type MemorySelectionConfig = {
  readonly fetchLimit: number;
  readonly maxPicks: number;
  readonly tokenBudget: number;
  readonly salienceWeight: number;
  readonly recencyWeight: number;
  readonly typeWeights: MemoryTypeWeights;
};

export type MemorySelectionOptions =
  & Partial<Omit<MemorySelectionConfig, "typeWeights">>
  & {
    readonly typeWeights?: Partial<MemoryTypeWeights>;
  };

export type SelectedMemory = {
  readonly event: MemoryEventRow;
  readonly score: number;
  readonly typeWeight: number;
  readonly recencyRank: number | null;
  readonly summary: string;
  readonly tokenEstimate: number;
};

export const DEFAULT_MEMORY_TYPE_WEIGHTS = {
  death: 10_000,
  refusal: 8_000,
  completion: 6_000,
  deed: 4_000,
  discovery: 1_000,
} as const satisfies MemoryTypeWeights;

export const DEFAULT_MEMORY_SELECTION_CONFIG = {
  fetchLimit: 32,
  maxPicks: 6,
  tokenBudget: 140,
  salienceWeight: 10,
  recencyWeight: 1,
  typeWeights: DEFAULT_MEMORY_TYPE_WEIGHTS,
} as const satisfies MemorySelectionConfig;

const MEMORY_HEADER = "What the Deep remembers:";
const AVG_CHARS_PER_TOKEN = 4;

export const approxMemoryTokens = (text: string): number =>
  Math.ceil(text.length / AVG_CHARS_PER_TOKEN);

export const selectMemories = (
  profileId: string,
  currentRunId: string,
  repo: Pick<MemoryEventsRepository, "eventsBySalience" | "recentEvents">,
  options: MemorySelectionOptions = {},
): readonly SelectedMemory[] => {
  const selectionConfig = normalizeSelectionConfig(options);
  const fetchLimit = Math.max(1, selectionConfig.fetchLimit);
  const recentEvents = repo.recentEvents(profileId, fetchLimit);
  const recentRanks = new Map(
    recentEvents.map((event, index) => [event.id, index] as const),
  );
  const events = uniqueEvents([
    ...repo.eventsBySalience(profileId, undefined, fetchLimit),
    ...recentEvents,
  ]).filter((event) => event.runId !== currentRunId);

  const ranked = events
    .map((event) => scoreMemoryEvent(event, recentRanks, selectionConfig))
    .sort(compareSelectedMemories);

  const picks: SelectedMemory[] = [];
  for (const candidate of ranked) {
    if (picks.length >= selectionConfig.maxPicks) {
      break;
    }

    const candidateBlock = renderMemoryBlock([...picks, candidate], {
      ...selectionConfig,
      maxPicks: selectionConfig.maxPicks,
    });
    if (candidateBlock.length === 0) {
      continue;
    }

    const renderedLineCount = candidateBlock
      .split("\n")
      .filter((line) => line.startsWith("- ")).length;
    if (renderedLineCount > picks.length) {
      picks.push(candidate);
    }
  }

  return picks;
};

export const renderMemoryBlock = (
  picks: readonly SelectedMemory[],
  options: MemorySelectionOptions = {},
): string => {
  if (picks.length === 0) {
    return "";
  }

  const selectionConfig = normalizeSelectionConfig(options);
  const lines = [MEMORY_HEADER];
  for (const pick of picks.slice(0, selectionConfig.maxPicks)) {
    const nextLine = `- ${pick.summary}`;
    const nextBlock = [...lines, nextLine].join("\n");
    if (approxMemoryTokens(nextBlock) <= selectionConfig.tokenBudget) {
      lines.push(nextLine);
      continue;
    }

    const shortened = shortenLineToBudget(
      pick.summary,
      lines,
      selectionConfig.tokenBudget,
    );
    if (shortened !== null) {
      lines.push(`- ${shortened}`);
    }
    break;
  }

  return lines.length === 1 ? "" : lines.join("\n");
};

const normalizeSelectionConfig = (
  options: MemorySelectionOptions,
): MemorySelectionConfig => ({
  fetchLimit:
    options.fetchLimit ?? DEFAULT_MEMORY_SELECTION_CONFIG.fetchLimit,
  maxPicks: options.maxPicks ?? DEFAULT_MEMORY_SELECTION_CONFIG.maxPicks,
  tokenBudget:
    options.tokenBudget ?? DEFAULT_MEMORY_SELECTION_CONFIG.tokenBudget,
  salienceWeight:
    options.salienceWeight ?? DEFAULT_MEMORY_SELECTION_CONFIG.salienceWeight,
  recencyWeight:
    options.recencyWeight ?? DEFAULT_MEMORY_SELECTION_CONFIG.recencyWeight,
  typeWeights: {
    ...DEFAULT_MEMORY_SELECTION_CONFIG.typeWeights,
    ...options.typeWeights,
  },
});

const uniqueEvents = (
  events: readonly MemoryEventRow[],
): readonly MemoryEventRow[] => {
  const byId = new Map<string, MemoryEventRow>();
  for (const event of events) {
    if (!byId.has(event.id)) {
      byId.set(event.id, event);
    }
  }
  return [...byId.values()];
};

const scoreMemoryEvent = (
  event: MemoryEventRow,
  recentRanks: ReadonlyMap<string, number>,
  selectionConfig: MemorySelectionConfig,
): SelectedMemory => {
  const recencyRank = recentRanks.get(event.id) ?? null;
  const recencyScore =
    recencyRank === null
      ? 0
      : (selectionConfig.fetchLimit - recencyRank) * selectionConfig.recencyWeight;
  const typeWeight = selectionConfig.typeWeights[event.type];
  const score =
    typeWeight + event.salience * selectionConfig.salienceWeight + recencyScore;
  const summary = renderEventSummary(event);

  return {
    event,
    score,
    typeWeight,
    recencyRank,
    summary,
    tokenEstimate: approxMemoryTokens(`- ${summary}`),
  };
};

const compareSelectedMemories = (
  left: SelectedMemory,
  right: SelectedMemory,
): number =>
  right.score - left.score
  || right.event.salience - left.event.salience
  || compareNullableRank(left.recencyRank, right.recencyRank)
  || right.event.createdAt.localeCompare(left.event.createdAt)
  || left.event.id.localeCompare(right.event.id);

const compareNullableRank = (
  left: number | null,
  right: number | null,
): number => {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left - right;
};

const renderEventSummary = (event: MemoryEventRow): string => {
  const explicit = firstString(event.payload, [
    "summary",
    "label",
    "text",
    "description",
  ]);
  if (explicit !== null) {
    return cleanSentence(`Run ${event.runId}: ${explicit}`);
  }

  switch (event.type) {
    case "death":
      return renderDeathSummary(event);
    case "refusal":
      return renderQuestSummary(event, "refused");
    case "completion":
      return renderQuestSummary(event, "completed");
    case "deed":
      return renderFallbackSummary(event, "did something worth remembering");
    case "discovery":
      return renderFallbackSummary(event, "discovered something");
  }
};

const renderDeathSummary = (event: MemoryEventRow): string => {
  const floor = firstScalar(event.payload, ["floor", "depth"]);
  const cause = firstString(event.payload, [
    "cause",
    "lastAction",
    "finalAction",
    "reason",
  ]);
  const floorText = floor === null ? "" : ` on floor ${floor}`;
  const causeText = cause === null ? "" : ` ${cause}`;
  return cleanSentence(`Run ${event.runId}: died${causeText}${floorText}`);
};

const renderQuestSummary = (
  event: MemoryEventRow,
  verb: "completed" | "refused",
): string => {
  const questId = firstScalar(event.payload, ["questId", "quest"]);
  const npcId = firstScalar(event.payload, ["npcId", "npc"]);
  const questText = questId === null ? "a quest" : `quest ${questId}`;
  const npcText = npcId === null ? "" : ` from ${npcId}`;
  return cleanSentence(`Run ${event.runId}: ${verb} ${questText}${npcText}`);
};

const renderFallbackSummary = (
  event: MemoryEventRow,
  fallback: string,
): string => {
  const detail = stablePayloadText(event.payload);
  return cleanSentence(
    `Run ${event.runId}: ${detail.length === 0 ? fallback : detail}`,
  );
};

const firstString = (
  payload: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): string | null => {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const firstScalar = (
  payload: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): string | number | null => {
  for (const key of keys) {
    const value = payload[key];
    if (
      (typeof value === "string" && value.trim().length > 0)
      || typeof value === "number"
    ) {
      return value;
    }
  }
  return null;
};

const stablePayloadText = (
  payload: Readonly<Record<string, unknown>>,
): string =>
  Object.keys(payload)
    .sort()
    .map((key) => `${key}=${stableValueText(payload[key])}`)
    .join(", ");

const stableValueText = (value: unknown): string => {
  if (value === null) {
    return "null";
  }
  if (
    typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableValueText).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${stablePayloadText(value as Readonly<Record<string, unknown>>)}}`;
  }
  return String(value);
};

const cleanSentence = (text: string): string =>
  text.replace(/\s+/g, " ").trim().replace(/[.。]+$/, "");

const shortenLineToBudget = (
  summary: string,
  existingLines: readonly string[],
  tokenBudget: number,
): string | null => {
  const words = summary.split(/\s+/).filter((word) => word.length > 0);
  while (words.length > 0) {
    const shortened = `${words.join(" ")}...`;
    const block = [...existingLines, `- ${shortened}`].join("\n");
    if (approxMemoryTokens(block) <= tokenBudget) {
      return shortened;
    }
    words.pop();
  }
  return null;
};
