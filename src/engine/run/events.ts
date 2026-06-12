import type {
  EngineLogEvent,
  EngineLogEventDataByType,
  EntityId,
  GameState,
  Position
} from "../state/index.js";
import type { PlayerAction } from "../turn/index.js";

export type RunActionKind = PlayerAction["kind"] | "take_hoard";

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly run_action_resolved: {
      readonly actionKind: RunActionKind;
    };
    readonly run_action_illegal: {
      readonly actionKind: RunActionKind;
      readonly reason: string;
    };
    readonly run_floor_entered: {
      readonly floorId: string;
      readonly depth: number;
      readonly band: import("../../schemas/entities/index.js").DepthBand;
      readonly seed: string;
      readonly rosterCost: number;
      readonly spawnBudget: number;
      readonly placementDeviationCount: number;
      readonly hoardFeatureId: string | null;
    };
    readonly run_placement_deviation: {
      readonly requestId: string;
      readonly reasons: readonly string[];
    };
    readonly run_boredom: {
      readonly depth: number;
      readonly floorTurn: number;
      readonly wave: number;
      readonly budgetRemaining: number;
      readonly reason:
        | "reinforcement_spawned"
        | "budget_exhausted"
        | "no_legal_cell";
    };
    readonly run_reinforcement_spawned: {
      readonly entityId: EntityId;
      readonly definitionId: string;
      readonly depth: number;
      readonly position: Position;
      readonly cost: number;
      readonly budgetRemaining: number;
      readonly wave: number;
    };
    readonly hoard_taken: {
      readonly featureId: string;
      readonly name: string;
      readonly depth: number;
      readonly position: Position;
    };
  }
}

export type RunCustomEventType =
  | "run_action_resolved"
  | "run_action_illegal"
  | "run_floor_entered"
  | "run_placement_deviation"
  | "run_boredom"
  | "run_reinforcement_spawned"
  | "hoard_taken";

export type RunActionResolvedEvent = Extract<
  EngineLogEvent,
  { readonly type: "run_action_resolved" }
>;
export type RunActionIllegalEvent = Extract<
  EngineLogEvent,
  { readonly type: "run_action_illegal" }
>;
export type RunFloorEnteredEvent = Extract<
  EngineLogEvent,
  { readonly type: "run_floor_entered" }
>;
export type RunPlacementDeviationEvent = Extract<
  EngineLogEvent,
  { readonly type: "run_placement_deviation" }
>;
export type RunBoredomEvent = Extract<
  EngineLogEvent,
  { readonly type: "run_boredom" }
>;
export type RunReinforcementSpawnedEvent = Extract<
  EngineLogEvent,
  { readonly type: "run_reinforcement_spawned" }
>;
export type HoardTakenEvent = Extract<
  EngineLogEvent,
  { readonly type: "hoard_taken" }
>;

export type RunCustomEvent = Extract<
  EngineLogEvent,
  { readonly type: RunCustomEventType }
>;

export type RunEvent = EngineLogEvent;

export const runEvent = <Type extends RunCustomEventType>(
  turn: number,
  type: Type,
  data: EngineLogEventDataByType[Type]
): Extract<EngineLogEvent, { readonly type: Type }> =>
  ({
    turn,
    type,
    data
  }) as Extract<EngineLogEvent, { readonly type: Type }>;

export const appendRunLog = (
  state: GameState,
  events: readonly RunEvent[]
): GameState => ({
  ...state,
  log: [...state.log, ...events]
});
