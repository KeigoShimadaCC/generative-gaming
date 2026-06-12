import type { GameState } from "@engine/state";

export const RUN_INDEX_STORAGE_KEY = "everdeep.runIndex.v1";
export const ACTIVE_RUN_STORAGE_KEY = "everdeep.activeRun.v1";

export type RunIndexOutcome = "victory" | "defeat" | "abort" | "ongoing";

export type RunIndexEntry = {
  readonly runId: string;
  readonly seed: string;
  readonly createdAt: string;
  readonly outcome: RunIndexOutcome;
  readonly depth: number;
  readonly turns: number;
  readonly summary: Readonly<Record<string, unknown>>;
  readonly traceContent: string;
};

export type ActiveRunRecord = {
  readonly runId: string;
  readonly seed: string;
  readonly createdAt: string;
  readonly gameState: GameState;
  readonly traceContent: string;
};

export type RunIndexStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const outcomeFromState = (state: GameState): RunIndexOutcome => {
  switch (state.run.terminalStatus) {
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

export const runIndexEntryFromState = ({
  state,
  createdAt,
  traceContent,
}: {
  readonly state: GameState;
  readonly createdAt: string;
  readonly traceContent: string;
}): RunIndexEntry => ({
  runId: state.run.runId,
  seed: state.run.seed,
  createdAt,
  outcome: outcomeFromState(state),
  depth: state.run.depth,
  turns: state.run.turn,
  summary: {
    terminalStatus: state.run.terminalStatus,
    hp: state.player.hp.current,
    entities: Object.keys(state.entities).length,
  },
  traceContent,
});

export const loadRunIndex = (
  storage: RunIndexStorage | null,
): readonly RunIndexEntry[] => {
  if (storage === null) {
    return [];
  }

  const raw = storage.getItem(RUN_INDEX_STORAGE_KEY);
  if (raw === null) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.flatMap((entry) => normalizeRunIndexEntry(entry))
      : [];
  } catch {
    return [];
  }
};

export const saveRunIndex = (
  storage: RunIndexStorage | null,
  entries: readonly RunIndexEntry[],
): void => {
  storage?.setItem(RUN_INDEX_STORAGE_KEY, JSON.stringify(entries));
};

export const upsertRunIndexEntry = (
  storage: RunIndexStorage | null,
  entry: RunIndexEntry,
): readonly RunIndexEntry[] => {
  const next = [
    entry,
    ...loadRunIndex(storage).filter((current) => current.runId !== entry.runId),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  saveRunIndex(storage, next);
  return next;
};

export const loadActiveRun = (
  storage: RunIndexStorage | null,
): ActiveRunRecord | null => {
  if (storage === null) {
    return null;
  }

  const raw = storage.getItem(ACTIVE_RUN_STORAGE_KEY);
  if (raw === null) {
    return null;
  }

  try {
    return normalizeActiveRun(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
};

export const saveActiveRun = (
  storage: RunIndexStorage | null,
  record: ActiveRunRecord,
): void => {
  storage?.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(record));
};

export const clearActiveRun = (storage: RunIndexStorage | null): void => {
  storage?.removeItem(ACTIVE_RUN_STORAGE_KEY);
};

export const formatRunDate = (createdAt: string): string => {
  const date = new Date(createdAt);

  return Number.isNaN(date.getTime())
    ? createdAt
    : date.toISOString().slice(0, 10);
};

const normalizeRunIndexEntry = (value: unknown): readonly RunIndexEntry[] => {
  if (!isRecord(value)) {
    return [];
  }

  if (
    typeof value.runId !== "string" ||
    typeof value.seed !== "string" ||
    typeof value.createdAt !== "string" ||
    !isOutcome(value.outcome) ||
    typeof value.depth !== "number" ||
    typeof value.turns !== "number" ||
    typeof value.traceContent !== "string"
  ) {
    return [];
  }

  return [
    {
      runId: value.runId,
      seed: value.seed,
      createdAt: value.createdAt,
      outcome: value.outcome,
      depth: value.depth,
      turns: value.turns,
      summary: isRecord(value.summary) ? value.summary : {},
      traceContent: value.traceContent,
    },
  ];
};

const normalizeActiveRun = (value: unknown): ActiveRunRecord | null => {
  if (!isRecord(value) || !isRecord(value.gameState)) {
    return null;
  }

  if (
    typeof value.runId !== "string" ||
    typeof value.seed !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.traceContent !== "string"
  ) {
    return null;
  }

  return {
    runId: value.runId,
    seed: value.seed,
    createdAt: value.createdAt,
    gameState: value.gameState as unknown as GameState,
    traceContent: value.traceContent,
  };
};

const isOutcome = (value: unknown): value is RunIndexOutcome =>
  value === "victory" ||
  value === "defeat" ||
  value === "abort" ||
  value === "ongoing";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
