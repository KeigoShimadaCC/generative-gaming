import { config } from "@engine/config";
import { fogAt, idx } from "@engine/map";
import { defaultVisibleFog, fogFromState, gridFromState } from "@engine/render";
import type { GameState, Position } from "@engine/state";

export type AutoTravelStopReason =
  | "enemy_sighted"
  | "item_underfoot"
  | "hp_threshold";

export type AutoTravelStop = {
  readonly reason: AutoTravelStopReason;
  readonly message: string;
};

export const autoTravelStopFor = (state: GameState): AutoTravelStop | null => {
  const hpStop = hpThresholdStop(state);
  if (hpStop !== null) {
    return hpStop;
  }

  if (itemUnderfoot(state)) {
    return {
      reason: "item_underfoot",
      message: "Auto-travel stopped: item underfoot.",
    };
  }

  if (enemySighted(state)) {
    return {
      reason: "enemy_sighted",
      message: "Auto-travel stopped: enemy sighted.",
    };
  }

  return null;
};

export const hpStopPercentFor = (state: GameState): number =>
  config.difficultyGate.thresholdsByBand[state.run.band]
    .medianHpRetentionPercent.min;

const hpThresholdStop = (state: GameState): AutoTravelStop | null => {
  const thresholdPercent = hpStopPercentFor(state);
  const currentPercent =
    state.player.hp.max <= 0
      ? 0
      : (state.player.hp.current / state.player.hp.max) * 100;

  if (currentPercent > thresholdPercent) {
    return null;
  }

  return {
    reason: "hp_threshold",
    message: `Auto-travel stopped: HP at ${Math.ceil(currentPercent)}%, threshold ${thresholdPercent}%.`,
  };
};

const itemUnderfoot = (state: GameState): boolean =>
  Object.values(state.entities).some(
    (entity) =>
      entity.kind === "item" && samePosition(entity.position, state.player.position),
  );

const enemySighted = (state: GameState): boolean =>
  Object.values(state.entities).some(
    (entity) => entity.kind === "enemy" && isVisible(state, entity.position),
  );

const isVisible = (state: GameState, position: Position): boolean => {
  const grid = gridFromState(state);
  if (grid === null) {
    return false;
  }

  const fog = fogFromState(state, grid) ?? defaultVisibleFog(grid);
  const index = idx(grid, position);
  if (index < 0 || index >= fog.tiles.length) {
    return false;
  }

  return fogAt(fog, position).state === "visible";
};

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;
