import { createInitialState, type GameState } from "@engine/state";

export const DEV_FIXTURE_SEED = "phase-48-dev-fixture";

export const createDevFixtureState = (): GameState =>
  createInitialState(DEV_FIXTURE_SEED);
