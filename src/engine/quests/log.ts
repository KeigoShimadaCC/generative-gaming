import type { QuestDefinition, QuestObjective } from "../../schemas/entities/index.js";
import type { GameState, QuestRuntime, QuestRuntimeStatus } from "../state/index.js";
import { readQuestProgress } from "./types.js";

export type QuestLogObjectiveHint = {
  readonly kind: QuestObjective["kind"];
  readonly hint: string;
  readonly where: string | null;
};

export type QuestLogEntry = {
  readonly questId: string;
  readonly title: string;
  readonly status: QuestRuntimeStatus;
  readonly objective: QuestLogObjectiveHint;
};

export type QuestLogState = {
  readonly active: readonly QuestLogEntry[];
  readonly completed: readonly QuestLogEntry[];
  readonly failed: readonly QuestLogEntry[];
};

export const buildQuestLog = (state: GameState): QuestLogState => {
  const active: QuestLogEntry[] = [];
  const completed: QuestLogEntry[] = [];
  const failed: QuestLogEntry[] = [];

  for (const questId of sortedQuestIds(state)) {
    const runtime = state.quests.quests[questId];

    if (runtime === undefined) {
      continue;
    }

    const entry = toLogEntry(runtime);

    switch (runtime.status) {
      case "active":
        active.push(entry);
        break;
      case "completed":
        completed.push(entry);
        break;
      case "failed":
        failed.push(entry);
        break;
      case "available":
        break;
    }
  }

  return { active, completed, failed };
};

const sortedQuestIds = (state: GameState): string[] => {
  const ids = new Set<string>([
    ...state.quests.activeQuestIds,
    ...state.quests.completedQuestIds,
    ...state.quests.failedQuestIds,
    ...Object.keys(state.quests.quests),
  ]);

  return [...ids].sort((left, right) => left.localeCompare(right));
};

const toLogEntry = (runtime: QuestRuntime): QuestLogEntry => ({
  questId: runtime.definition.id,
  title: runtime.definition.title,
  status: runtime.status,
  objective: objectiveHint(runtime.definition, readQuestProgress(runtime.progress)),
});

const objectiveHint = (
  definition: QuestDefinition,
  progress: ReturnType<typeof readQuestProgress>,
): QuestLogObjectiveHint => {
  const objective = definition.objective;

  switch (objective.kind) {
    case "fetch":
      return {
        kind: "fetch",
        hint: `Find ${objective.fetch?.itemId ?? "the item"}.`,
        where:
          objective.fetch?.floorScope === "next_floor"
            ? "This or the next floor"
            : "This floor",
      };
    case "kill":
      return {
        kind: "kill",
        hint: `Defeat targets tagged ${objective.kill?.targetTag ?? "unknown"}.`,
        where: "This floor",
      };
    case "reach":
      return {
        kind: "reach",
        hint: `Reach ${objective.reach?.featureId ?? "the landmark"}.`,
        where: "This floor",
      };
    case "deliver":
      return {
        kind: "deliver",
        hint: `Bring ${objective.deliver?.itemId ?? "the item"} to ${objective.deliver?.npcId ?? "the keeper"}.`,
        where: "Keeper dialogue or barter",
      };
    case "escort":
      return {
        kind: "escort",
        hint: `Escort ${objective.escort?.npcId ?? "the ward"} to the stairs.`,
        where: progress.escortWardEntityId ?? objective.escort?.npcId ?? null,
      };
    case "constraint":
      return {
        kind: "constraint",
        hint: constraintHint(objective.constraint?.engineFlag ?? "unknown"),
        where: "This floor",
      };
  }
};

const constraintHint = (engineFlag: string): string => {
  switch (engineFlag) {
    case "take_no_damage":
      return "Leave the floor without taking damage.";
    case "kill_nothing":
      return "Leave the floor without killing anything.";
    default:
      return `Satisfy ${engineFlag} on this floor.`;
  }
};
