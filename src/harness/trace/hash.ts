import { serialize, type GameState } from "../../engine/state/index.js";

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const computeStateHash = (state: GameState): string =>
  hashSerializedState(serialize(state));

export const hashSerializedState = (serialized: string): string => {
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
};
