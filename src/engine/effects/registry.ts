import { bounds } from "../../config/index.js";
import type {
  Effect,
  EffectBundle,
  EffectVerbKind
} from "../../schemas/vocab/index.js";
import type { Rng } from "../rng/index.js";
import type {
  EngineLogEventDataByType,
  EntityId,
  GameState,
  Position,
  SerializableRecord
} from "../state/index.js";
import type { TurnEvent } from "../turn/index.js";

export type EffectActorId = "player" | EntityId;

export type EffectRejectionCode =
  | "bundle_size"
  | "bounds"
  | "invalid_target"
  | "missing_payload"
  | "unregistered_executor";

export type EffectExecutionContext = {
  readonly sourceId: EffectActorId | null;
  readonly targetId: EffectActorId | null;
  readonly origin: Position | null;
  readonly rng: Rng;
};

export type EffectExecutorResult = {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
  readonly rejected?: true;
};

export type EffectExecutor = (
  state: GameState,
  effect: Effect,
  ctx: EffectExecutionContext
) => EffectExecutorResult;

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly effect_executed: {
      readonly verb: EffectVerbKind;
      readonly sourceId: EffectActorId | null;
      readonly targetId: EffectActorId | null;
      readonly origin: Position | null;
      readonly details: SerializableRecord;
    };
    readonly effect_rejected: {
      readonly verb: EffectVerbKind | "bundle";
      readonly effectIndex: number | null;
      readonly code: EffectRejectionCode;
      readonly message: string;
      readonly sourceId: EffectActorId | null;
      readonly targetId: EffectActorId | null;
      readonly origin: Position | null;
    };
  }
}

type EffectLogEventType = "effect_executed" | "effect_rejected";

const executors = new Map<EffectVerbKind, EffectExecutor>();

export const registerEffectExecutor = (
  verb: EffectVerbKind,
  executor: EffectExecutor
): (() => void) => {
  const previous = executors.get(verb);
  executors.set(verb, executor);

  return () => {
    if (executors.get(verb) !== executor) {
      return;
    }

    if (previous === undefined) {
      executors.delete(verb);
      return;
    }

    executors.set(verb, previous);
  };
};

export const executeBundle = (
  state: GameState,
  bundle: EffectBundle,
  ctx: EffectExecutionContext
): EffectExecutorResult => {
  if (!isBundleSizeInBounds(bundle.effects.length)) {
    return rejectEffectBundle(
      state,
      "bundle_size",
      `effect bundle must contain ${bounds.effectVocabulary.effectsPerBundle.min}-${bounds.effectVocabulary.effectsPerBundle.max} effects`,
      ctx
    );
  }

  const events: TurnEvent[] = [];
  const executionCtx = {
    ...ctx,
    rng: ctx.rng.fork("effects")
  };
  let nextState = state;

  for (let index = 0; index < bundle.effects.length; index += 1) {
    const effect = bundle.effects[index];
    if (effect === undefined) {
      return rejectEffectBundle(
        state,
        "bounds",
        `effect at index ${index} is missing`,
        executionCtx
      );
    }

    const executor = executors.get(effect.kind);
    if (executor === undefined) {
      return {
        state,
        events: [
          effectRejectedEvent(state, effect.kind, {
            code: "unregistered_executor",
            message: `no executor registered for ${effect.kind}`,
            ctx: executionCtx,
            effectIndex: index
          })
        ],
        rejected: true
      };
    }

    const result = executor(nextState, effect, executionCtx);
    if (result.rejected === true) {
      return {
        state,
        events: withEffectIndex(result.events, index),
        rejected: true
      };
    }

    nextState = result.state;
    events.push(...result.events);
  }

  return {
    state: nextState,
    events
  };
};

export const effectExecutedEvent = (
  state: GameState,
  verb: EffectVerbKind,
  ctx: EffectExecutionContext,
  details: SerializableRecord = {}
): TurnEvent =>
  effectEvent(state, "effect_executed", {
    verb,
    sourceId: ctx.sourceId,
    targetId: ctx.targetId,
    origin: ctx.origin,
    details
  });

export const rejectEffect = (
  state: GameState,
  effect: Effect,
  code: EffectRejectionCode,
  message: string,
  ctx: EffectExecutionContext
): EffectExecutorResult => ({
  state,
  events: [
    effectRejectedEvent(state, effect.kind, {
      code,
      message,
      ctx,
      effectIndex: null
    })
  ],
  rejected: true
});

const rejectEffectBundle = (
  state: GameState,
  code: EffectRejectionCode,
  message: string,
  ctx: EffectExecutionContext
): EffectExecutorResult => ({
  state,
  events: [
    effectRejectedEvent(state, "bundle", {
      code,
      message,
      ctx,
      effectIndex: null
    })
  ],
  rejected: true
});

const effectRejectedEvent = (
  state: GameState,
  verb: EffectVerbKind | "bundle",
  options: {
    readonly code: EffectRejectionCode;
    readonly message: string;
    readonly ctx: EffectExecutionContext;
    readonly effectIndex: number | null;
  }
): TurnEvent =>
  effectEvent(state, "effect_rejected", {
    verb,
    effectIndex: options.effectIndex,
    code: options.code,
    message: options.message,
    sourceId: options.ctx.sourceId,
    targetId: options.ctx.targetId,
    origin: options.ctx.origin
  });

const withEffectIndex = (
  events: readonly TurnEvent[],
  effectIndex: number
): readonly TurnEvent[] =>
  events.map((event) => {
    if (event.type !== "effect_rejected") {
      return event;
    }

    return {
      ...event,
      data: {
        ...event.data,
        effectIndex
      }
    };
  });

const effectEvent = <Type extends EffectLogEventType>(
  state: GameState,
  type: Type,
  data: EngineLogEventDataByType[Type]
): Extract<TurnEvent, { readonly type: Type }> =>
  ({
    turn: state.run.turn,
    type,
    data
  }) as Extract<TurnEvent, { readonly type: Type }>;

const isBundleSizeInBounds = (length: number): boolean =>
  Number.isSafeInteger(length) &&
  length >= bounds.effectVocabulary.effectsPerBundle.min &&
  length <= bounds.effectVocabulary.effectsPerBundle.max;
