import { config } from "../../config/index.js";
import type { EngineLogEvent as RunEvent } from "../events.js";
import type {
  GameState,
  SerializableRecord,
  TerminalStatus
} from "../state/index.js";
import { ACTIVE_TERMINAL_STATUS } from "../state/index.js";
import type { TurnEvent } from "../turn/index.js";
import { runEvent } from "./events.js";

export type TakeHoardAction = {
  readonly kind: "take_hoard";
};

export type HoardActionResult =
  | {
      readonly state: GameState;
      readonly events: readonly RunEvent[];
    }
  | {
      readonly illegal: true;
      readonly reason: string;
    };

export type RunDiscoverySummary = {
  readonly kind: "floor" | "hoard" | "item";
  readonly id: string;
  readonly depth: number;
  readonly turn: number;
};

export type QuestSummary = {
  readonly offered: readonly string[];
  readonly accepted: readonly string[];
  readonly refused: readonly string[];
  readonly completed: readonly string[];
  readonly failed: readonly string[];
  readonly rewardsPaid: readonly string[];
};

export type RunSummary = {
  readonly terminalStatus: TerminalStatus;
  readonly depth: number;
  readonly turns: number;
  readonly kills: number;
  readonly discoveries: readonly RunDiscoverySummary[];
  readonly quests: QuestSummary;
};

export type RunSummaryFallback = {
  readonly terminalStatus?: TerminalStatus;
  readonly depth?: number;
  readonly turns?: number;
};

export const takeOneThingAtHoard = (state: GameState): HoardActionResult => {
  if (state.run.terminalStatus !== ACTIVE_TERMINAL_STATUS) {
    return {
      illegal: true,
      reason: `run is terminal (${state.run.terminalStatus})`
    };
  }

  if (state.run.depth !== config.runStructure.depthFloors) {
    return {
      illegal: true,
      reason: "the Hoard exists only on the final floor"
    };
  }

  const hoard = hoardAtPlayer(state);
  if (hoard === null) {
    return {
      illegal: true,
      reason: "player is not standing at the Hoard"
    };
  }

  const won = withTerminalStatus(state, config.runStructure.terminalStates.win);
  return {
    state: won,
    events: [
      runEvent(state.run.turn, "hoard_taken", {
        featureId: hoard.id,
        name: hoard.name,
        depth: state.run.depth,
        position: state.player.position
      }),
      turnEvent(state.run.turn, "terminal_state", {
        status: config.runStructure.terminalStates.win,
        reason: "player took one thing from the Hoard"
      })
    ]
  };
};

export const summarizeRun = (state: GameState): RunSummary =>
  summarizeRunEvents(state.log, {
    terminalStatus: state.run.terminalStatus,
    depth: state.run.depth,
    turns: state.run.turn
  });

export const summarizeRunEvents = (
  events: readonly RunEvent[],
  fallback: RunSummaryFallback = {}
): RunSummary => {
  const kills = new Set<string>();
  const discoveries: RunDiscoverySummary[] = [];
  const quests = mutableQuestSummary();
  let terminalStatus = fallback.terminalStatus ?? ACTIVE_TERMINAL_STATUS;
  let depth = fallback.depth ?? 0;
  let turns = fallback.turns ?? 0;

  for (const logEvent of events) {
    turns = Math.max(turns, logEvent.turn);

    switch (logEvent.type) {
      case "state_created":
        depth = Math.max(depth, logEvent.data.depth);
        break;
      case "run_floor_entered":
        depth = Math.max(depth, logEvent.data.depth);
        discoveries.push({
          kind: "floor",
          id: logEvent.data.floorId,
          depth: logEvent.data.depth,
          turn: logEvent.turn
        });
        break;
      case "entity_died":
        if (logEvent.data.kind === "enemy") {
          kills.add(logEvent.data.entityId);
        }
        break;
      case "item_identified":
        discoveries.push({
          kind: "item",
          id: logEvent.data.definitionId,
          depth,
          turn: logEvent.turn
        });
        break;
      case "hoard_taken":
        depth = Math.max(depth, logEvent.data.depth);
        discoveries.push({
          kind: "hoard",
          id: logEvent.data.featureId,
          depth: logEvent.data.depth,
          turn: logEvent.turn
        });
        break;
      case "quest_offered":
        quests.offered.add(logEvent.data.questId);
        break;
      case "quest_accepted":
        quests.accepted.add(logEvent.data.questId);
        break;
      case "quest_refused":
        quests.refused.add(logEvent.data.questId);
        break;
      case "quest_completed":
        quests.completed.add(logEvent.data.questId);
        break;
      case "quest_failed":
        quests.failed.add(logEvent.data.questId);
        break;
      case "quest_reward_paid":
        quests.rewardsPaid.add(logEvent.data.questId);
        break;
      case "terminal_state":
        terminalStatus = logEvent.data.status;
        break;
      default:
        break;
    }
  }

  return {
    terminalStatus,
    depth,
    turns,
    kills: kills.size,
    discoveries,
    quests: freezeQuestSummary(quests)
  };
};

const hoardAtPlayer = (
  state: GameState
): { readonly id: string; readonly name: string } | null => {
  for (const feature of decorativeFeatures(state)) {
    if (!isHoardFeature(feature)) {
      continue;
    }

    if (
      feature.x === state.player.position.x &&
      feature.y === state.player.position.y
    ) {
      return {
        id: feature.id,
        name: feature.name
      };
    }
  }

  return null;
};

const decorativeFeatures = (
  state: GameState
): readonly SerializableRecord[] => {
  const opaque = state.floor.geometry.opaque as {
    readonly knowledge?: {
      readonly decorativeFeatures?: readonly SerializableRecord[];
    };
  } | null;

  return opaque?.knowledge?.decorativeFeatures ?? [];
};

const isHoardFeature = (
  feature: SerializableRecord
): feature is SerializableRecord & {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
} =>
  typeof feature.id === "string" &&
  feature.id.length > 0 &&
  typeof feature.name === "string" &&
  typeof feature.x === "number" &&
  Number.isSafeInteger(feature.x) &&
  typeof feature.y === "number" &&
  Number.isSafeInteger(feature.y) &&
  feature.kind === "hoard";

const mutableQuestSummary = () => ({
  offered: new Set<string>(),
  accepted: new Set<string>(),
  refused: new Set<string>(),
  completed: new Set<string>(),
  failed: new Set<string>(),
  rewardsPaid: new Set<string>()
});

const freezeQuestSummary = (
  summary: ReturnType<typeof mutableQuestSummary>
): QuestSummary => ({
  offered: [...summary.offered].sort(),
  accepted: [...summary.accepted].sort(),
  refused: [...summary.refused].sort(),
  completed: [...summary.completed].sort(),
  failed: [...summary.failed].sort(),
  rewardsPaid: [...summary.rewardsPaid].sort()
});

const withTerminalStatus = (
  state: GameState,
  terminalStatus: Exclude<TerminalStatus, "ACTIVE">
): GameState => ({
  ...state,
  run: {
    ...state.run,
    terminalStatus
  }
});

const turnEvent = (
  turn: number,
  type: TurnEvent["type"],
  data: TurnEvent["data"]
): TurnEvent =>
  ({
    turn,
    type,
    data
  }) as TurnEvent;
