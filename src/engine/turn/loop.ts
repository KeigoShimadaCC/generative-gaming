/*
 * PHASE-07B FROZEN TURN EXTENSION INTERFACE
 *
 * A turn always resolves in this order:
 * 1. the player action resolves through built-in handling or the action-resolver
 *    registry;
 * 2. every other actor runs exactly once in stable actor-id order;
 * 3. end-of-turn tick hooks run in this fixed order:
 *    damageOverTime -> durations -> hunger -> regen.
 *
 * Frozen extension surface:
 * - registerActionResolver handles move/attack/use_item/pickup/talk/inspect.
 * - registerTickHook handles damageOverTime/durations/hunger/regen.
 * - TurnHooks.actorTurn handles non-player actors in stable actor-id order.
 * - TurnHooks.ticks handles per-step tick overrides.
 *
 * Do not rename action kinds or TickHookName values, reorder TICK_HOOK_ORDER, or
 * let resolvers/hooks call ambient nondeterminism or LLMs. Resolvers and hooks
 * must return deterministic state/events.
 */

import { bounds, config, type GameConfig } from "../../config/index.js";
import { createClock } from "../clock/index.js";
import {
  ACTIVE_TERMINAL_STATUS,
  createInitialState,
  type EngineLogEvent,
  type EntityId,
  type EntityInstance,
  type GameState,
  type TerminalStatus,
} from "../state/index.js";
import {
  checkActionLegality,
  type PlayerAction,
} from "./actions.js";

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly action_illegal: {
      readonly actionKind: PlayerAction["kind"];
      readonly reason: string;
    };
    readonly action_resolved: {
      readonly actionKind: PlayerAction["kind"];
    };
    readonly actor_turn: {
      readonly actorId: EntityId;
    };
    readonly tick_hook: {
      readonly hook: TickHookName;
    };
    readonly terminal_state: {
      readonly status: Exclude<TerminalStatus, "ACTIVE">;
      readonly reason: string;
    };
  }
}

export { checkActionLegality, getAvailableActions } from "./actions.js";
export type {
  AbortAction,
  ActionLegality,
  ActionTarget,
  AttackAction,
  DescendAction,
  InspectAction,
  MoveAction,
  MoveDirection,
  PickupAction,
  PlayerAction,
  TalkAction,
  UseItemAction,
  WaitAction,
} from "./actions.js";

export type TurnEvent = EngineLogEvent;

export type ActorEntity = Extract<EntityInstance, { readonly kind: "enemy" | "npc" }>;

export type ActionResolverActionKind =
  | "move"
  | "attack"
  | "use_item"
  | "pickup"
  | "talk"
  | "inspect";

export type ActionResolverAction = Extract<
  PlayerAction,
  { readonly kind: ActionResolverActionKind }
>;

export type ActionResolverSuccess = {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
};

export type ActionResolverIllegal = {
  readonly illegal: true;
  readonly reason: string;
};

export type ActionResolverResult =
  | ActionResolverSuccess
  | ActionResolverIllegal;

export type ActionResolver<
  Action extends ActionResolverAction = ActionResolverAction,
> = (state: GameState, action: Action) => ActionResolverResult;

export type TickHookName =
  | "damageOverTime"
  | "durations"
  | "hunger"
  | "regen";

export const TICK_HOOK_ORDER = [
  "damageOverTime",
  "durations",
  "hunger",
  "regen",
] as const satisfies readonly TickHookName[];

export type TurnHookResult =
  | GameState
  | {
      readonly state: GameState;
      readonly events?: readonly TurnEvent[];
    };

export type ActorTurnHook = (context: {
  readonly state: GameState;
  readonly actor: ActorEntity;
  readonly action: PlayerAction;
}) => TurnHookResult;

export type TickHook = (context: {
  readonly state: GameState;
  readonly hook: TickHookName;
  readonly action: PlayerAction;
}) => TurnHookResult;

export type TickHooks = {
  readonly [Hook in TickHookName]: TickHook;
};

export type TurnHooks = {
  readonly actorTurn?: ActorTurnHook;
  readonly ticks?: Partial<TickHooks>;
};

export type ResolvedTurnHooks = {
  readonly actorTurn: ActorTurnHook;
  readonly ticks: TickHooks;
};

export type StepOptions = {
  readonly hooks?: TurnHooks;
};

export type StepResult = {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
};

export type StartContent = {
  readonly config?: GameConfig;
};

const actionResolvers = new Map<ActionResolverActionKind, ActionResolver>();
const tickHookRegistry = new Map<TickHookName, TickHook>();

export const registerActionResolver = <
  Kind extends ActionResolverActionKind,
>(
  actionType: Kind,
  resolver: ActionResolver<Extract<PlayerAction, { readonly kind: Kind }>>,
): (() => void) => {
  const previous = actionResolvers.get(actionType);
  const registeredResolver = resolver as ActionResolver;
  actionResolvers.set(actionType, registeredResolver);

  return () => {
    if (actionResolvers.get(actionType) !== registeredResolver) {
      return;
    }

    if (previous === undefined) {
      actionResolvers.delete(actionType);
      return;
    }

    actionResolvers.set(actionType, previous);
  };
};

export const registerTickHook = (
  slot: TickHookName,
  hook: TickHook,
): (() => void) => {
  const previous = tickHookRegistry.get(slot);
  tickHookRegistry.set(slot, hook);

  return () => {
    if (tickHookRegistry.get(slot) !== hook) {
      return;
    }

    if (previous === undefined) {
      tickHookRegistry.delete(slot);
      return;
    }

    tickHookRegistry.set(slot, previous);
  };
};

export const start = (seed: string, content: StartContent = {}): GameState =>
  createInitialState(seed, content.config ?? config);

export const step = (
  state: GameState,
  action: PlayerAction,
  options: StepOptions = {},
): StepResult => {
  if (isTerminal(state)) {
    return illegalStep(
      state,
      action,
      `run is terminal (${state.run.terminalStatus})`,
    );
  }

  const legality = checkActionLegality(state, action);
  if (legality.status === "illegal") {
    return illegalStep(state, action, legality.reason);
  }

  const forcedTerminal = forcedTerminalFor(state);
  if (forcedTerminal !== null) {
    return terminalStep(state, forcedTerminal.status, forcedTerminal.reason);
  }

  const hooks = resolveTurnHooks(options.hooks);
  const playerActionResult = applyPlayerAction(state, action);
  if (isActionResolverIllegal(playerActionResult)) {
    return illegalStep(state, action, playerActionResult.reason);
  }

  const events: TurnEvent[] = [
    turnEvent(state.run.turn, "action_resolved", {
      actionKind: action.kind,
    }),
    ...playerActionResult.events,
  ];

  let nextState = playerActionResult.state;

  if (!isTerminal(nextState)) {
    for (const actor of actorsInTurnOrder(nextState)) {
      events.push(
        turnEvent(nextState.run.turn, "actor_turn", {
          actorId: actor.id,
        }),
      );

      const result = normalizeHookResult(
        hooks.actorTurn({
          state: nextState,
          actor,
          action,
        }),
      );
      nextState = result.state;
      events.push(...result.events);

      if (isTerminal(nextState)) {
        break;
      }
    }
  }

  if (!isTerminal(nextState)) {
    for (const hook of TICK_HOOK_ORDER) {
      events.push(
        turnEvent(nextState.run.turn, "tick_hook", {
          hook,
        }),
      );

      const result = normalizeHookResult(
        hooks.ticks[hook]({
          state: nextState,
          hook,
          action,
        }),
      );
      nextState = result.state;
      events.push(...result.events);

      if (isTerminal(nextState)) {
        break;
      }
    }
  }

  if (!isTerminal(nextState)) {
    nextState = advanceTurn(nextState);

    const terminal = forcedTerminalFor(nextState);
    if (terminal !== null) {
      nextState = withTerminalStatus(nextState, terminal.status);
      events.push(
        turnEvent(nextState.run.turn, "terminal_state", {
          status: terminal.status,
          reason: terminal.reason,
        }),
      );
    }
  }

  nextState = appendLog(nextState, events);

  return {
    state: nextState,
    events,
  };
};

export const render = (state: GameState): string =>
  [
    `run=${state.run.runId}`,
    `turn=${state.run.turn}`,
    `depth=${state.run.depth}`,
    `status=${state.run.terminalStatus}`,
    `player=(${state.player.position.x},${state.player.position.y})`,
    `hp=${state.player.hp.current}/${state.player.hp.max}`,
  ].join(" ");

export const isTerminal = (state: GameState): boolean =>
  state.run.terminalStatus !== ACTIVE_TERMINAL_STATUS;

export const createNoopTurnHooks = (): ResolvedTurnHooks => ({
  actorTurn: ({ state }) => state,
  ticks: {
    damageOverTime: ({ state }) => state,
    durations: ({ state }) => state,
    hunger: ({ state }) => state,
    regen: ({ state }) => state,
  },
});

const applyPlayerAction = (
  state: GameState,
  action: PlayerAction,
): ActionResolverResult => {
  if (action.kind === "abort") {
    const status = config.runStructure.terminalStates.abort;
    const terminalState = withTerminalStatus(state, status);

    return {
      state: terminalState,
      events: [
        turnEvent(state.run.turn, "terminal_state", {
          status,
          reason: "player aborted the run",
        }),
      ],
    };
  }

  if (
    action.kind === "descend" &&
    state.run.depth >= config.runStructure.depthFloors
  ) {
    const status = config.runStructure.terminalStates.win;
    const terminalState = withTerminalStatus(state, status);

    return {
      state: terminalState,
      events: [
        turnEvent(state.run.turn, "terminal_state", {
          status,
          reason: "player descended from the final floor",
        }),
      ],
    };
  }

  if (action.kind === "wait") {
    return {
      state,
      events: [],
    };
  }

  if (isActionResolverAction(action)) {
    return applyRegisteredActionResolver(state, action);
  }

  return {
    state,
    events: [],
  };
};

const applyRegisteredActionResolver = (
  state: GameState,
  action: ActionResolverAction,
): ActionResolverResult => {
  const resolver = actionResolvers.get(action.kind);

  if (resolver === undefined) {
    return {
      illegal: true,
      reason: "no handler registered",
    };
  }

  return resolver(state, action);
};

const isActionResolverAction = (
  action: PlayerAction,
): action is ActionResolverAction => {
  switch (action.kind) {
    case "move":
    case "attack":
    case "use_item":
    case "pickup":
    case "talk":
    case "inspect":
      return true;
    case "wait":
    case "descend":
    case "abort":
      return false;
  }
};

const isActionResolverIllegal = (
  result: ActionResolverResult,
): result is ActionResolverIllegal => "illegal" in result;

const forcedTerminalFor = (
  state: GameState,
): { readonly status: Exclude<TerminalStatus, "ACTIVE">; readonly reason: string } | null => {
  if (state.player.hp.current <= 0) {
    return {
      status: config.runStructure.terminalStates.loss,
      reason: "player HP reached 0",
    };
  }

  if (state.run.turn >= bounds.runStructure.perRunHardCapTurns) {
    return {
      status: config.runStructure.terminalStates.loss,
      reason: `run hard cap reached at ${bounds.runStructure.perRunHardCapTurns} turns`,
    };
  }

  return null;
};

const terminalStep = (
  state: GameState,
  status: Exclude<TerminalStatus, "ACTIVE">,
  reason: string,
): StepResult => {
  const event = turnEvent(state.run.turn, "terminal_state", {
    status,
    reason,
  });
  const terminalState = appendLog(withTerminalStatus(state, status), [event]);

  return {
    state: terminalState,
    events: [event],
  };
};

const illegalStep = (
  state: GameState,
  action: PlayerAction,
  reason: string,
): StepResult => ({
  state,
  events: [
    turnEvent(state.run.turn, "action_illegal", {
      actionKind: action.kind,
      reason,
    }),
  ],
});

const resolveTurnHooks = (hooks: TurnHooks | undefined): ResolvedTurnHooks => {
  const noopHooks = createNoopTurnHooks();

  return {
    actorTurn: hooks?.actorTurn ?? noopHooks.actorTurn,
    ticks: resolveTickHooks(noopHooks.ticks, hooks?.ticks),
  };
};

const resolveTickHooks = (
  noopTicks: TickHooks,
  overrides: Partial<TickHooks> | undefined,
): TickHooks => ({
  damageOverTime:
    overrides?.damageOverTime ??
    tickHookRegistry.get("damageOverTime") ??
    noopTicks.damageOverTime,
  durations:
    overrides?.durations ??
    tickHookRegistry.get("durations") ??
    noopTicks.durations,
  hunger:
    overrides?.hunger ??
    tickHookRegistry.get("hunger") ??
    noopTicks.hunger,
  regen:
    overrides?.regen ??
    tickHookRegistry.get("regen") ??
    noopTicks.regen,
});

const normalizeHookResult = (
  result: TurnHookResult,
): { readonly state: GameState; readonly events: readonly TurnEvent[] } => {
  if (isHookResultEnvelope(result)) {
    return {
      state: result.state,
      events: result.events ?? [],
    };
  }

  return {
    state: result,
    events: [],
  };
};

const isHookResultEnvelope = (
  result: TurnHookResult,
): result is Extract<TurnHookResult, { readonly state: GameState }> =>
  "state" in result;

const actorsInTurnOrder = (state: GameState): readonly ActorEntity[] =>
  Object.values(state.entities)
    .filter(isActorEntity)
    .sort((a, b) => compareEntityIds(a.id, b.id));

const isActorEntity = (entity: EntityInstance): entity is ActorEntity =>
  entity.kind === "enemy" || entity.kind === "npc";

const compareEntityIds = (a: EntityId, b: EntityId): number => {
  const parsedA = parseEntityId(a);
  const parsedB = parseEntityId(b);
  const kindOrder = parsedA.kind.localeCompare(parsedB.kind);

  return kindOrder === 0 ? parsedA.index - parsedB.index : kindOrder;
};

const parseEntityId = (
  id: EntityId,
): { readonly kind: string; readonly index: number } => {
  const [kind, rawIndex] = id.split("#");

  return {
    kind: kind ?? "",
    index: Number.parseInt(rawIndex ?? "0", 10),
  };
};

const advanceTurn = (state: GameState): GameState => {
  const clock = createClock(state.run.turn);
  clock.advance();

  return {
    ...state,
    run: {
      ...state.run,
      turn: clock.now(),
    },
  };
};

const withTerminalStatus = (
  state: GameState,
  terminalStatus: Exclude<TerminalStatus, "ACTIVE">,
): GameState => ({
  ...state,
  run: {
    ...state.run,
    terminalStatus,
  },
});

const appendLog = (
  state: GameState,
  events: readonly TurnEvent[],
): GameState => ({
  ...state,
  log: [...state.log, ...events],
});

const turnEvent = (
  turn: number,
  type: TurnEvent["type"],
  data: TurnEvent["data"],
): TurnEvent =>
  ({
    turn,
    type,
    data,
  }) as TurnEvent;
