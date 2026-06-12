import type { TraceContentRef, TraceHeader } from "../trace/recorder.js";

export const LOCAL_PROFILE_ID = "local" as const;

export type ProfileSettings = Readonly<Record<string, unknown>>;

export type ProfileRow = {
  readonly id: string;
  readonly createdAt: string;
  readonly settings: ProfileSettings;
};

export type ProfileInsert = {
  readonly id?: string;
  readonly createdAt: string;
  readonly settings?: ProfileSettings;
};

export type RunOutcome = "victory" | "defeat" | "abort" | "ongoing";

export type RunSummary = Readonly<Record<string, unknown>>;

export type RunIndexRow = {
  readonly runId: string;
  readonly protocolVersion: string;
  readonly engineVersion: string;
  readonly modelId: string;
  readonly contentRef: TraceContentRef;
  readonly seed: string;
  readonly createdAt: string;
  readonly outcome: RunOutcome;
  readonly depth: number;
  readonly turns: number;
  readonly summary: RunSummary;
  readonly tracePath: string;
};

export type RunIndexInsert = {
  readonly runId: string;
  readonly header: TraceHeader;
  readonly outcome: RunOutcome;
  readonly depth: number;
  readonly turns: number;
  readonly summary: RunSummary;
  readonly tracePath: string;
};

export type MemoryEventType =
  | "death"
  | "deed"
  | "refusal"
  | "completion"
  | "discovery";

export type MemoryEventPayload = Readonly<Record<string, unknown>>;

export type MemoryEventRow = {
  readonly id: string;
  readonly profileId: string;
  readonly runId: string;
  readonly type: MemoryEventType;
  readonly payload: MemoryEventPayload;
  readonly createdAt: string;
  readonly salience: number;
};

export type MemoryEventInsert = {
  readonly id: string;
  readonly profileId: string;
  readonly runId: string;
  readonly type: MemoryEventType;
  readonly payload: MemoryEventPayload;
  readonly createdAt: string;
  readonly salience: number;
};
