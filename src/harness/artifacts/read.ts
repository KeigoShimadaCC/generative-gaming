import {
  nodeArtifactFsAdapter,
  trimTrailingSlash,
  type ArtifactFsAdapter,
} from "./fs.js";
import type {
  FloorIndexEntry,
  GenerationRecord,
  RunGenerationIndex,
  RunGenerationSummary,
} from "./types.js";

export type ArtifactReadOptions = {
  readonly rootDir?: string;
  readonly fs?: ArtifactFsAdapter;
};

const INDEX_FILE = "index.json";

const resolveReadContext = (options: ArtifactReadOptions = {}) => ({
  rootDir: trimTrailingSlash(options.rootDir ?? "runs"),
  fs: options.fs ?? nodeArtifactFsAdapter,
});

const loadRunIndexFile = (
  fs: ArtifactFsAdapter,
  rootDir: string,
  runId: string,
): RunGenerationIndex => {
  const indexPath = `${rootDir}/${runId}/${INDEX_FILE}`;
  if (!fs.fileExists(indexPath)) {
    throw new Error(`generation index not found for run: ${runId}`);
  }

  return JSON.parse(fs.readFile(indexPath)) as RunGenerationIndex;
};

export const listRuns = (
  options: ArtifactReadOptions = {},
): readonly RunGenerationSummary[] => {
  const { rootDir, fs } = resolveReadContext(options);
  if (!fs.isDirectory(rootDir)) {
    return [];
  }

  const summaries: RunGenerationSummary[] = [];

  for (const runId of fs.listEntries(rootDir)) {
    const indexPath = `${rootDir}/${runId}/${INDEX_FILE}`;
    if (!fs.fileExists(indexPath)) {
      continue;
    }

    const index = JSON.parse(fs.readFile(indexPath)) as RunGenerationIndex;
    if (index.recordType !== "generation-index") {
      continue;
    }

    summaries.push({
      runId: index.runId,
      stamp: {
        recordType: "generation-stamp",
        protocolVersion: index.protocolVersion,
        engineVersion: index.engineVersion,
        modelId: index.modelId,
        seed: index.seed,
        createdAt: index.createdAt,
      },
      updatedAt: index.updatedAt,
      floorCount: index.floors.length,
    });
  }

  return summaries.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
};

export const listFloors = (
  runId: string,
  options: ArtifactReadOptions = {},
): readonly FloorIndexEntry[] => {
  const { rootDir, fs } = resolveReadContext(options);
  const index = loadRunIndexFile(fs, rootDir, runId);
  return [...index.floors].sort((left, right) => left.depth - right.depth);
};

export const loadGenerationChain = (
  runId: string,
  depth: number,
  options: ArtifactReadOptions = {},
): GenerationRecord => {
  const { rootDir, fs } = resolveReadContext(options);
  const index = loadRunIndexFile(fs, rootDir, runId);
  const floorEntry = index.floors.find((entry) => entry.depth === depth);
  if (floorEntry === undefined) {
    throw new Error(
      `generation record not indexed for run ${runId} floor ${depth}`,
    );
  }

  const recordPath = `${rootDir}/${runId}/${floorEntry.recordPath}`;
  if (!fs.fileExists(recordPath)) {
    throw new Error(`generation record missing at ${recordPath}`);
  }

  return JSON.parse(fs.readFile(recordPath)) as GenerationRecord;
};

export const readRunIndex = (
  runId: string,
  options: ArtifactReadOptions = {},
): RunGenerationIndex => {
  const { rootDir, fs } = resolveReadContext(options);
  return loadRunIndexFile(fs, rootDir, runId);
};
