import { ENGINE_VERSION, PROTOCOL_VERSION } from "../../schemas/protocol.js";
import {
  nodeArtifactFsAdapter,
  trimTrailingSlash,
  type ArtifactFsAdapter,
} from "./fs.js";
import { hashPrompt } from "./hash.js";
import type {
  AttemptProviderSnapshot,
  FloorIndexEntry,
  GenerationAttemptInput,
  GenerationAttemptRecord,
  GenerationOutcome,
  GenerationOutcomeSummary,
  GenerationRecord,
  RunGenerationIndex,
  WriteGenerationRecordInput,
} from "./types.js";

export class GenerationRecordExistsError extends Error {
  readonly code = "GENERATION_RECORD_EXISTS" as const;

  constructor(runId: string, depth: number) {
    super(`generation record already exists for run ${runId} floor ${depth}`);
    this.name = "GenerationRecordExistsError";
  }
}

export type WriteGenerationRecordOptions = {
  readonly rootDir?: string;
  readonly fs?: ArtifactFsAdapter;
};

const GENERATION_RECORD_FILE = "generation.json";
const INDEX_FILE = "index.json";
const INDEX_TEMP_SUFFIX = ".tmp";

export const generationRecordPath = (
  runId: string,
  depth: number,
  rootDir = "runs",
): string =>
  `${trimTrailingSlash(rootDir)}/${runId}/floors/${depth}/${GENERATION_RECORD_FILE}`;

export const runIndexPath = (runId: string, rootDir = "runs"): string =>
  `${trimTrailingSlash(rootDir)}/${runId}/${INDEX_FILE}`;

const toOutcomeSummary = (
  outcome: GenerationOutcome,
): GenerationOutcomeSummary =>
  outcome.kind === "manifest"
    ? { kind: "manifest" }
    : { kind: "fallback", fallbackId: outcome.fallbackId };

const relativeRunPath = (runDir: string, absolutePath: string): string => {
  const prefix = `${runDir}/`;
  if (!absolutePath.startsWith(prefix)) {
    throw new Error(`path is not under run directory: ${absolutePath}`);
  }
  return absolutePath.slice(prefix.length);
};

const buildProviderSnapshot = (
  providerResult: GenerationAttemptInput["providerResult"],
  manifestPath?: string,
): AttemptProviderSnapshot => {
  if (providerResult.ok) {
    return {
      ok: true,
      usage: providerResult.usage,
      ...(manifestPath === undefined ? {} : { manifestPath }),
    };
  }

  return {
    ok: false,
    usage: providerResult.usage,
    error: providerResult.error,
  };
};

const persistAttemptArtifacts = (
  fs: ArtifactFsAdapter,
  runDir: string,
  floorDir: string,
  attemptIndex: number,
  attempt: GenerationAttemptInput,
): GenerationAttemptRecord => {
  const attemptDir = `${floorDir}/attempts/${attemptIndex}`;
  fs.makeDir(attemptDir);

  const rawOutputPath = `${attemptDir}/raw.txt`;
  const raw =
    attempt.providerResult.ok === true
      ? attempt.providerResult.raw
      : (attempt.providerResult.raw ?? "");
  fs.writeNewFile(rawOutputPath, raw);

  let manifestRelativePath: string | undefined;
  if (attempt.providerResult.ok) {
    const manifestPath = `${attemptDir}/manifest.json`;
    fs.writeNewFile(
      manifestPath,
      `${JSON.stringify(attempt.providerResult.manifest, null, 2)}\n`,
    );
    manifestRelativePath = relativeRunPath(runDir, manifestPath);
  }

  return {
    attemptIndex,
    promptHash: hashPrompt(attempt.prompt),
    rawOutputPath: relativeRunPath(runDir, rawOutputPath),
    provider: buildProviderSnapshot(
      attempt.providerResult,
      manifestRelativePath,
    ),
    ...(attempt.gateReports === undefined
      ? {}
      : { gateReports: attempt.gateReports }),
  };
};

const loadOrCreateIndex = (
  fs: ArtifactFsAdapter,
  runDir: string,
  input: WriteGenerationRecordInput,
): RunGenerationIndex => {
  const indexPath = `${runDir}/${INDEX_FILE}`;
  if (!fs.fileExists(indexPath)) {
    return {
      recordType: "generation-index",
      protocolVersion: PROTOCOL_VERSION,
      engineVersion: ENGINE_VERSION,
      modelId: input.modelId,
      seed: input.seed,
      createdAt: input.createdAt,
      runId: input.runId,
      updatedAt: input.recordedAt,
      floors: [],
    };
  }

  return JSON.parse(fs.readFile(indexPath)) as RunGenerationIndex;
};

const writeIndexAtomically = (
  fs: ArtifactFsAdapter,
  indexPath: string,
  index: RunGenerationIndex,
): void => {
  const tempPath = `${indexPath}${INDEX_TEMP_SUFFIX}`;
  fs.writeFile(tempPath, `${JSON.stringify(index, null, 2)}\n`);
  fs.rename(tempPath, indexPath);
};

const mergeIndexForWrite = (
  fs: ArtifactFsAdapter,
  runDir: string,
  input: WriteGenerationRecordInput,
  baseIndex: RunGenerationIndex,
  floorEntry: FloorIndexEntry,
): RunGenerationIndex => {
  const latestIndex = loadOrCreateIndex(fs, runDir, input);
  const floorsByDepth = new Map<number, FloorIndexEntry>();

  for (const entry of baseIndex.floors) {
    floorsByDepth.set(entry.depth, entry);
  }
  for (const entry of latestIndex.floors) {
    floorsByDepth.set(entry.depth, entry);
  }
  floorsByDepth.set(floorEntry.depth, floorEntry);

  return {
    ...latestIndex,
    modelId: input.modelId,
    seed: input.seed,
    updatedAt: maxTimestamp(
      maxTimestamp(baseIndex.updatedAt, latestIndex.updatedAt),
      input.recordedAt,
    ),
    floors: [...floorsByDepth.values()].sort(
      (left, right) => left.depth - right.depth,
    ),
  };
};

const maxTimestamp = (left: string, right: string): string =>
  left.localeCompare(right) >= 0 ? left : right;

export const writeGenerationRecord = (
  input: WriteGenerationRecordInput,
  options: WriteGenerationRecordOptions = {},
): GenerationRecord => {
  const rootDir = trimTrailingSlash(options.rootDir ?? "runs");
  const fs = options.fs ?? nodeArtifactFsAdapter;
  const runDir = `${rootDir}/${input.runId}`;
  const floorDir = `${runDir}/floors/${input.depth}`;
  const recordPath = `${floorDir}/${GENERATION_RECORD_FILE}`;

  if (fs.fileExists(recordPath)) {
    throw new GenerationRecordExistsError(input.runId, input.depth);
  }

  fs.makeDir(floorDir);

  const attempts = input.attempts.map((attempt, attemptIndex) =>
    persistAttemptArtifacts(fs, runDir, floorDir, attemptIndex, attempt),
  );

  const outcome =
    input.outcome.kind === "manifest"
      ? {
          kind: "manifest" as const,
          manifestPath: relativeRunPath(runDir, input.outcome.manifestPath),
        }
      : input.outcome;

  const record: GenerationRecord = {
    recordType: "generation",
    protocolVersion: PROTOCOL_VERSION,
    engineVersion: ENGINE_VERSION,
    modelId: input.modelId,
    seed: input.seed,
    createdAt: input.createdAt,
    runId: input.runId,
    depth: input.depth,
    attempts,
    outcome,
  };

  fs.writeNewFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);

  const baseIndex = loadOrCreateIndex(fs, runDir, input);
  const recordRelativePath = relativeRunPath(runDir, recordPath);
  const floorEntry: FloorIndexEntry = {
    depth: input.depth,
    recordPath: recordRelativePath,
    outcome: toOutcomeSummary(input.outcome),
    recordedAt: input.recordedAt,
  };
  const nextIndex = mergeIndexForWrite(fs, runDir, input, baseIndex, floorEntry);

  writeIndexAtomically(fs, `${runDir}/${INDEX_FILE}`, nextIndex);

  return record;
};
