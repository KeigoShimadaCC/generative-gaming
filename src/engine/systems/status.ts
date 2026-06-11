import { bounds, config } from "../../config/index.js";
import {
  StatusApplicationSchema,
  type StatusApplication,
  type StatusId,
} from "../../schemas/vocab/index.js";
import type { Rng } from "../rng/index.js";
import type {
  EngineLogEventDataByType,
  EnemyEntityInstance,
  EntityId,
  GameState,
} from "../state/index.js";
import {
  MOVE_DIRECTIONS,
  registerTickHook,
  type MoveDirection,
  type TickHook,
  type TickHooks,
  type TurnEvent,
} from "../turn/index.js";
import { applyDeath } from "./combat.js";

export type StatusEntityId = EntityId | "player";

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly status_applied: {
      readonly entityId: StatusEntityId;
      readonly status: StatusId;
      readonly duration: number;
    };
    readonly status_refreshed: {
      readonly entityId: StatusEntityId;
      readonly status: StatusId;
      readonly duration: number;
    };
    readonly status_expired: {
      readonly entityId: StatusEntityId;
      readonly status: StatusId;
    };
    readonly status_dropped_oldest: {
      readonly entityId: StatusEntityId;
      readonly status: StatusId;
    };
    readonly status_tick: {
      readonly entityId: StatusEntityId;
      readonly status: StatusId;
      readonly hpDelta: number;
    };
  }
}

type StatusLogEventType =
  | "status_applied"
  | "status_refreshed"
  | "status_expired"
  | "status_dropped_oldest"
  | "status_tick";

type StatusTickHookName = "damageOverTime" | "durations";

const MAX_CONCURRENT_STATUSES = bounds.statusVocabulary.maxConcurrentPerActor;

const HASTE_SLOW_PAIR: ReadonlySet<StatusId> = new Set(["haste", "slow"]);

const DOT_STATUSES: ReadonlySet<StatusId> = new Set(["poison", "burn", "regen"]);

export type ApplyStatusResult = {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
};

export const applyStatus = (
  state: GameState,
  entityId: StatusEntityId,
  status: StatusId,
  duration: number,
): ApplyStatusResult => {
  const parsed = StatusApplicationSchema.safeParse({ status, duration });
  if (!parsed.success) {
    return { state, events: [] };
  }

  const application = parsed.data;
  const events: TurnEvent[] = [];
  let statuses = statusesForEntity(state, entityId);

  if (HASTE_SLOW_PAIR.has(status)) {
    const opposite = status === "haste" ? "slow" : "haste";
    const hadOpposite = statuses.some((entry) => entry.status === opposite);
    if (hadOpposite) {
      statuses = statuses.filter((entry) => entry.status !== opposite);
    }
  }

  const existingIndex = statuses.findIndex(
    (entry) => entry.status === application.status,
  );

  if (existingIndex >= 0) {
    statuses = statuses.map((entry, index) =>
      index === existingIndex
        ? { status: application.status, duration: application.duration }
        : entry,
    );
    events.push(
      statusEvent(state, "status_refreshed", {
        entityId,
        status: application.status,
        duration: application.duration,
      }),
    );
  } else {
    if (statuses.length >= MAX_CONCURRENT_STATUSES) {
      const dropped = statuses[0];
      if (dropped !== undefined) {
        statuses = statuses.slice(1);
        events.push(
          statusEvent(state, "status_dropped_oldest", {
            entityId,
            status: dropped.status,
          }),
        );
      }
    }

    statuses = [...statuses, application];
    events.push(
      statusEvent(state, "status_applied", {
        entityId,
        status: application.status,
        duration: application.duration,
      }),
    );
  }

  return {
    state: withEntityStatuses(state, entityId, statuses),
    events,
  };
};

export const isStunned = (statuses: readonly StatusApplication[]): boolean =>
  statuses.some((entry) => entry.status === "stun" && entry.duration > 0);

export const slowActsThisTurn = (turn: number): boolean => turn % 2 === 0;

export const hasteExtraAction = (turn: number): boolean => turn % 2 === 1;

export const confusionRedirect = (
  rng: Rng,
  intendedDir: MoveDirection,
): MoveDirection => {
  void intendedDir;
  return rng.fork("status").pick(MOVE_DIRECTIONS.map((entry) => entry.direction));
};

export const blindFovRadius = (
  statuses: readonly StatusApplication[],
): number | null =>
  statuses.some((entry) => entry.status === "blind" && entry.duration > 0) ? 1 : null;

const tickDamageOverTime: TickHook = ({ state }) => {
  const events: TurnEvent[] = [];
  let nextState = state;

  for (const entityId of statusEntityIdsInOrder(nextState)) {
    const result = applyDotForEntity(nextState, entityId);
    nextState = result.state;
    events.push(...result.events);
  }

  return { state: nextState, events };
};

const tickDurations: TickHook = ({ state }) => {
  const events: TurnEvent[] = [];
  let nextState = state;

  for (const entityId of statusEntityIdsInOrder(nextState)) {
    const result = decrementDurationsForEntity(nextState, entityId);
    nextState = result.state;
    events.push(...result.events);
  }

  return { state: nextState, events };
};

export const statusTickHooks = {
  damageOverTime: tickDamageOverTime,
  durations: tickDurations,
} as const satisfies Pick<TickHooks, StatusTickHookName>;

export const unregisterStatusTickHooks = (() => {
  const unregisterDamageOverTime = registerTickHook(
    "damageOverTime",
    tickDamageOverTime,
  );
  const unregisterDurations = registerTickHook("durations", tickDurations);

  return () => {
    unregisterDurations();
    unregisterDamageOverTime();
  };
})();

const applyDotForEntity = (
  state: GameState,
  entityId: StatusEntityId,
): ApplyStatusResult => {
  const statuses = statusesForEntity(state, entityId);
  const dotStatuses = statuses.filter((entry) => DOT_STATUSES.has(entry.status));

  if (dotStatuses.length === 0) {
    return { state, events: [] };
  }

  const events: TurnEvent[] = [];
  let nextState = state;

  for (const entry of dotStatuses) {
    const hp = currentHp(nextState, entityId);
    if (hp === null) {
      continue;
    }

    let nextHp = hp.current;
    let hpDelta = 0;

    switch (entry.status) {
      case "poison":
        nextHp = Math.max(
          1,
          hp.current + config.statusMagnitudes.poisonHpPerTurn,
        );
        hpDelta = nextHp - hp.current;
        break;
      case "burn":
        nextHp = hp.current + config.statusMagnitudes.burnHpPerTurn;
        hpDelta = nextHp - hp.current;
        break;
      case "regen":
        nextHp = Math.min(
          hp.max,
          hp.current + config.statusMagnitudes.regenHpPerTurn,
        );
        hpDelta = nextHp - hp.current;
        break;
      default:
        continue;
    }

    if (hpDelta !== 0) {
      events.push(
        statusEvent(state, "status_tick", {
          entityId,
          status: entry.status,
          hpDelta,
        }),
      );
    }

    if (entry.status === "burn" && nextHp <= 0) {
      const death = applyBurnDeath(nextState, entityId);
      return {
        state: death.state,
        events: [...events, ...death.events],
      };
    }

    nextState = setEntityHp(nextState, entityId, nextHp);
  }

  return { state: nextState, events };
};

const decrementDurationsForEntity = (
  state: GameState,
  entityId: StatusEntityId,
): ApplyStatusResult => {
  const statuses = statusesForEntity(state, entityId);
  if (statuses.length === 0) {
    return { state, events: [] };
  }

  const events: TurnEvent[] = [];
  const remaining: StatusApplication[] = [];

  for (const entry of statuses) {
    const nextDuration = entry.duration - 1;
    if (nextDuration <= 0) {
      events.push(
        statusEvent(state, "status_expired", {
          entityId,
          status: entry.status,
        }),
      );
      continue;
    }

    remaining.push({
      status: entry.status,
      duration: nextDuration,
    });
  }

  return {
    state: withEntityStatuses(state, entityId, remaining),
    events,
  };
};

const statusEntityIdsInOrder = (state: GameState): readonly StatusEntityId[] => [
  "player",
  ...Object.keys(state.entities)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => id as EntityId),
];

const statusesForEntity = (
  state: GameState,
  entityId: StatusEntityId,
): readonly StatusApplication[] => {
  if (entityId === "player") {
    return state.player.statuses;
  }

  return state.entities[entityId]?.statuses ?? [];
};

const withEntityStatuses = (
  state: GameState,
  entityId: StatusEntityId,
  statuses: readonly StatusApplication[],
): GameState => {
  if (entityId === "player") {
    return {
      ...state,
      player: {
        ...state.player,
        statuses,
      },
    };
  }

  const entity = state.entities[entityId];
  if (entity === undefined) {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [entityId]: {
        ...entity,
        statuses,
      },
    },
  };
};

const currentHp = (
  state: GameState,
  entityId: StatusEntityId,
): { readonly current: number; readonly max: number } | null => {
  if (entityId === "player") {
    return state.player.hp;
  }

  const entity = state.entities[entityId];
  if (entity === undefined || entity.currentHP === null) {
    return null;
  }

  if (entity.kind === "enemy") {
    return {
      current: entity.currentHP,
      max: entity.definition.stats.hp,
    };
  }

  return null;
};

const setEntityHp = (
  state: GameState,
  entityId: StatusEntityId,
  current: number,
): GameState => {
  if (entityId === "player") {
    return {
      ...state,
      player: {
        ...state.player,
        hp: {
          ...state.player.hp,
          current,
        },
      },
    };
  }

  const entity = state.entities[entityId];
  if (entity === undefined || entity.kind !== "enemy") {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [entityId]: {
        ...entity,
        currentHP: current,
      } satisfies EnemyEntityInstance,
    },
  };
};

const applyBurnDeath = (
  state: GameState,
  entityId: StatusEntityId,
): ApplyStatusResult =>
  applyDeath(state, entityId, {
    attribution: {
      kind: "none",
    },
  });

const statusEvent = <Type extends StatusLogEventType>(
  state: GameState,
  type: Type,
  data: EngineLogEventDataByType[Type],
): Extract<TurnEvent, { readonly type: Type }> =>
  ({
    turn: state.run.turn,
    type,
    data,
  }) as Extract<TurnEvent, { readonly type: Type }>;
