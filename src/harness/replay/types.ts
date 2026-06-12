import type { RunEvent } from "../../engine/run/events.js";
import type { RunAction } from "../../engine/run/loop.js";
import type {
  TraceContentRef,
  TraceHeader as RecorderTraceHeader
} from "../trace/recorder.js";

export type ContentRef = TraceContentRef;

export type TraceHeader = RecorderTraceHeader;

export type TraceTurnRecord = {
  readonly turn: number;
  readonly action: RunAction;
  readonly events: readonly RunEvent[];
  readonly stateHash: string;
};

export type ParsedTrace = {
  readonly header: TraceHeader;
  readonly turns: readonly TraceTurnRecord[];
};

export type DivergenceReport = {
  readonly firstDivergentTurn: number;
  readonly expectedHash: string;
  readonly actualHash: string;
};

export type VerifyResult =
  | { readonly status: "identical" }
  | { readonly status: "diverged"; readonly report: DivergenceReport }
  | { readonly status: "unreadable"; readonly error: string };
