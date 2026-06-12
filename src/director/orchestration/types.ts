import type { FloorContent } from "../../engine/run/index.js";
import type { ParsedTrace } from "../../harness/replay/types.js";
import type { GenerationRecord } from "../../harness/artifacts/index.js";

export type PrefetchClock = () => number;

export const createPrefetchCounterClock = (start = 0): PrefetchClock => {
  let value = start;

  return () => {
    const current = value;
    value += 1;
    return current;
  };
};

export type PrefetchConfig = {
  readonly stairsCapMs?: number;
};

export type PrefetchStatus =
  | { readonly status: "idle" }
  | {
      readonly status: "in_flight";
      readonly depth: number;
      readonly startedAtMs: number;
    }
  | { readonly status: "ready"; readonly depth: number }
  | {
      readonly status: "discarded";
      readonly depth: number;
      readonly reason: string;
    };

export type ServedFloorSource = "generated" | "fallback";

export type ServedFloor = {
  readonly content: FloorContent;
  readonly source: ServedFloorSource;
  readonly depth: number;
  readonly record?: GenerationRecord;
};

export type FloorEnterHook = (
  depth: number,
  trace: ParsedTrace,
) => void | Promise<void>;
