import type {
  ProviderError,
  ProviderResult,
  ProviderUsage,
} from "../../director/provider/types.js";
import type { GateReport } from "../../gauntlet/gates01/report.js";
import type { Gate2Report } from "../../gauntlet/gate2/judge.js";
import type { PROTOCOL_VERSION } from "../../schemas/protocol.js";

/** TECH_SPEC §5 — every artifact carries this stamp set. */
export const TECH_SPEC_STAMP_FIELDS = [
  "protocolVersion",
  "engineVersion",
  "modelId",
  "seed",
  "createdAt",
] as const;

export type TechSpecStampField = (typeof TECH_SPEC_STAMP_FIELDS)[number];

export type GenerationStampFields = {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly engineVersion: string;
  readonly modelId: string;
  readonly seed: string;
  readonly createdAt: string;
};

export type GenerationStamp = GenerationStampFields & {
  readonly recordType: "generation-stamp";
};

export type GenerationOutcomeSummary =
  | { readonly kind: "manifest" }
  | { readonly kind: "fallback"; readonly fallbackId: string };

export type ServedManifestOutcome = {
  readonly kind: "manifest";
  readonly manifestPath: string;
};

export type FallbackOutcome = {
  readonly kind: "fallback";
  readonly fallbackId: string;
};

export type GenerationOutcome = ServedManifestOutcome | FallbackOutcome;

export type AttemptGateReports = {
  readonly gate0?: GateReport;
  readonly gate1?: GateReport;
  readonly gate2?: Gate2Report;
};

export type AttemptProviderSnapshot = {
  readonly ok: boolean;
  readonly usage: ProviderUsage;
  readonly error?: ProviderError;
  readonly manifestPath?: string;
};

export type GenerationAttemptRecord = {
  readonly attemptIndex: number;
  readonly promptHash: string;
  readonly rawOutputPath: string;
  readonly provider: AttemptProviderSnapshot;
  readonly gateReports?: AttemptGateReports;
};

export type GenerationRecord = GenerationStampFields & {
  readonly recordType: "generation";
  readonly runId: string;
  readonly depth: number;
  readonly attempts: readonly GenerationAttemptRecord[];
  readonly outcome: GenerationOutcome;
};

export type FloorIndexEntry = {
  readonly depth: number;
  readonly recordPath: string;
  readonly outcome: GenerationOutcomeSummary;
  readonly recordedAt: string;
};

export type RunGenerationIndex = GenerationStampFields & {
  readonly recordType: "generation-index";
  readonly runId: string;
  readonly updatedAt: string;
  readonly floors: readonly FloorIndexEntry[];
};

export type RunGenerationSummary = {
  readonly runId: string;
  readonly stamp: GenerationStamp;
  readonly updatedAt: string;
  readonly floorCount: number;
};

export type GenerationAttemptInput = {
  readonly prompt: string;
  readonly providerResult: ProviderResult;
  readonly gateReports?: AttemptGateReports;
};

export type WriteGenerationRecordInput = {
  readonly runId: string;
  readonly depth: number;
  readonly seed: string;
  readonly modelId: string;
  readonly createdAt: string;
  readonly recordedAt: string;
  readonly attempts: readonly GenerationAttemptInput[];
  readonly outcome: GenerationOutcome;
};
