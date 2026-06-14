import { bounds, config } from "../../config/index.js";
import type { EngineLogEventDataByType, GameState } from "../state/index.js";
import {
  registerTickHook,
  type TickHook,
  type TickHooks,
  type TurnEvent
} from "../turn/index.js";

export type PlayerHudPulseField =
  | "level"
  | "xp"
  | "hp"
  | "maxHp"
  | "attack"
  | "defense"
  | "fullness";

export type PlayerHudPulse = {
  readonly pulse: true;
  readonly fields: readonly PlayerHudPulseField[];
};

declare module "../state/types.js" {
  interface EngineLogEventDataByType {
    readonly level_up: {
      readonly actorId: "player";
      readonly levelBefore: number;
      readonly levelAfter: number;
      readonly xpBefore: number;
      readonly xpAfter: number;
      readonly xpToNextLevel: number | null;
      readonly maxHpBefore: number;
      readonly maxHpAfter: number;
      readonly currentHpBefore: number;
      readonly currentHpAfter: number;
      readonly hud: PlayerHudPulse;
    };
    readonly starvation: {
      readonly actorId: "player";
      readonly hpBefore: number;
      readonly hpAfter: number;
      readonly fullness: number;
      readonly hud: PlayerHudPulse;
    };
  }
}

export type PlayerBaseStats = {
  readonly maxHp: number;
  readonly attack: number;
  readonly defense: number;
};

export type ApplyXpResult = {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
};

export type ApplyNutritionResult = {
  readonly state: GameState;
  readonly events: readonly TurnEvent[];
};

type PlayerLogEventType = "level_up" | "starvation";

type PlayerTickHookName = "hunger" | "regen";

export const xpToNextLevel = (level: number): number =>
  config.playerCharacter.xpToNextLevelFactor * level;

export const derivePlayerBaseStats = (level: number): PlayerBaseStats => {
  const levelOffset = Math.max(
    0,
    level - config.playerCharacter.stats.level.start
  );
  const hpGrowth = config.playerCharacter.stats.hp;
  const attackGrowth = config.playerCharacter.stats.baseAttack;
  const defenseGrowth = config.playerCharacter.stats.baseDefense;

  return {
    maxHp: Math.min(
      bounds.playerCharacter.hpCap,
      hpGrowth.start + levelOffset * hpGrowth.growthPerLevel
    ),
    attack:
      attackGrowth.start +
      Math.floor(levelOffset / attackGrowth.growthEveryLevels) *
        attackGrowth.growthAmount,
    defense:
      defenseGrowth.start +
      Math.floor(levelOffset / defenseGrowth.growthEveryLevels) *
        defenseGrowth.growthAmount
  };
};

export const applyXp = (state: GameState, amount: number): ApplyXpResult => {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return applyPendingLevelUps(state);
  }

  return applyPendingLevelUps({
    ...state,
    player: {
      ...state.player,
      xp: state.player.xp + amount
    }
  });
};

export const applyNutrition = (
  state: GameState,
  amount: number
): ApplyNutritionResult => {
  if (!Number.isSafeInteger(amount) || amount === 0) {
    return { state, events: [] };
  }

  const fullnessAfter = clamp(
    state.player.fullness.current + amount,
    0,
    bounds.playerCharacter.overfedFullnessCap
  );
  const maxFullnessAfter = fullnessMaxFor(fullnessAfter);

  if (
    fullnessAfter === state.player.fullness.current &&
    maxFullnessAfter === state.player.fullness.max
  ) {
    return { state, events: [] };
  }

  return {
    state: withPlayerFullness(state, fullnessAfter, maxFullnessAfter),
    events: []
  };
};

const tickHunger: TickHook = ({ state }) => {
  const leveled = applyPendingLevelUps(state);
  const hunger = applyHungerForCompletedTurn(leveled.state);

  return {
    state: hunger.state,
    events: [...leveled.events, ...hunger.events]
  };
};

const tickNaturalRegen: TickHook = ({ state }) => {
  const completedTurn = state.run.turn + 1;
  const regen = config.playerCharacter.naturalRegen;

  if (completedTurn % regen.everyTurns !== 0) {
    return state;
  }

  if (state.player.fullness.current <= regen.requiresFullnessAbove) {
    return state;
  }

  if (state.player.hp.current >= state.player.hp.max) {
    return state;
  }

  const hpBefore = state.player.hp.current;
  const hpAfter = Math.min(state.player.hp.max, hpBefore + regen.hpGain);

  if (hpAfter === hpBefore) {
    return state;
  }

  return {
    state: withPlayerHp(state, hpAfter, state.player.hp.max),
    events: []
  };
};

export const playerTickHooks = {
  hunger: tickHunger,
  regen: tickNaturalRegen
} as const satisfies Pick<TickHooks, PlayerTickHookName>;

export const unregisterPlayerTickHooks = (() => {
  const unregisterHunger = registerTickHook("hunger", tickHunger);
  const unregisterRegen = registerTickHook("regen", tickNaturalRegen);

  return () => {
    unregisterRegen();
    unregisterHunger();
  };
})();

const applyPendingLevelUps = (state: GameState): ApplyXpResult => {
  const events: TurnEvent[] = [];
  let nextState = state;

  while (
    nextState.player.level < bounds.playerCharacter.levelCap &&
    nextState.player.xp >= xpToNextLevel(nextState.player.level)
  ) {
    const levelBefore = nextState.player.level;
    const xpBefore = nextState.player.xp;
    const maxHpBefore = nextState.player.hp.max;
    const currentHpBefore = nextState.player.hp.current;
    const threshold = xpToNextLevel(levelBefore);
    const levelAfter = levelBefore + 1;
    const xpAfter = xpBefore - threshold;
    const maxHpAfter = derivePlayerBaseStats(levelAfter).maxHp;
    const hpDelta = maxHpAfter - maxHpBefore;
    const currentHpAfter = Math.min(
      maxHpAfter,
      currentHpBefore + Math.max(0, hpDelta)
    );

    nextState = {
      ...nextState,
      player: {
        ...nextState.player,
        level: levelAfter,
        xp: xpAfter,
        hp: {
          current: currentHpAfter,
          max: maxHpAfter
        }
      }
    };

    events.push(
      playerEvent(nextState, "level_up", {
        actorId: "player",
        levelBefore,
        levelAfter,
        xpBefore,
        xpAfter,
        xpToNextLevel:
          levelAfter < bounds.playerCharacter.levelCap
            ? xpToNextLevel(levelAfter)
            : null,
        maxHpBefore,
        maxHpAfter,
        currentHpBefore,
        currentHpAfter,
        hud: hudPulse(["level", "xp", "hp", "maxHp", "attack", "defense"])
      })
    );
  }

  return { state: nextState, events };
};

const applyHungerForCompletedTurn = (state: GameState): ApplyXpResult => {
  const completedTurn = state.run.turn + 1;
  const fullness = state.player.fullness.current;

  if (fullness > 0) {
    return applyFullnessDecayForCompletedTurn(state, completedTurn);
  }

  return applyStarvationForCompletedTurn(state, completedTurn);
};

const applyFullnessDecayForCompletedTurn = (
  state: GameState,
  completedTurn: number
): ApplyXpResult => {
  const decay = config.playerCharacter.stats.fullness.decay;

  if (completedTurn % decay.everyTurns !== 0) {
    const normalizedMax = fullnessMaxFor(state.player.fullness.current);
    if (normalizedMax === state.player.fullness.max) {
      return { state, events: [] };
    }

    return {
      state: withPlayerFullness(
        state,
        state.player.fullness.current,
        normalizedMax
      ),
      events: []
    };
  }

  const fullnessAfter = Math.max(
    0,
    state.player.fullness.current - decay.amount
  );
  const maxFullnessAfter = fullnessMaxFor(fullnessAfter);

  return {
    state: withPlayerFullness(state, fullnessAfter, maxFullnessAfter),
    events: []
  };
};

const applyStarvationForCompletedTurn = (
  state: GameState,
  completedTurn: number
): ApplyXpResult => {
  const starvation = config.playerCharacter.stats.fullness.starvationDamage;

  if (completedTurn % starvation.everyTurns !== 0) {
    return { state, events: [] };
  }

  const hpBefore = state.player.hp.current;
  const hpAfter = Math.max(0, hpBefore - starvation.hpLoss);

  if (hpAfter === hpBefore) {
    return { state, events: [] };
  }

  return {
    state: withPlayerHp(state, hpAfter, state.player.hp.max),
    events: [
      playerEvent(state, "starvation", {
        actorId: "player",
        hpBefore,
        hpAfter,
        fullness: state.player.fullness.current,
        hud: hudPulse(["hp", "fullness"])
      })
    ]
  };
};

const withPlayerHp = (
  state: GameState,
  current: number,
  max: number
): GameState => ({
  ...state,
  player: {
    ...state.player,
    hp: {
      current,
      max
    }
  }
});

const withPlayerFullness = (
  state: GameState,
  current: number,
  max: number
): GameState => ({
  ...state,
  player: {
    ...state.player,
    fullness: {
      current,
      max
    }
  }
});

const fullnessMaxFor = (fullness: number): number =>
  fullness > bounds.playerCharacter.fullnessCap
    ? bounds.playerCharacter.overfedFullnessCap
    : bounds.playerCharacter.fullnessCap;

const hudPulse = (fields: readonly PlayerHudPulseField[]): PlayerHudPulse => ({
  pulse: true,
  fields
});

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const playerEvent = <Type extends PlayerLogEventType>(
  state: GameState,
  type: Type,
  data: EngineLogEventDataByType[Type]
): Extract<TurnEvent, { readonly type: Type }> =>
  ({
    turn: state.run.turn,
    type,
    data
  }) as Extract<TurnEvent, { readonly type: Type }>;
