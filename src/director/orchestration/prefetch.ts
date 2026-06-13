import {
  MessageChannel,
  receiveMessageOnPort,
  type MessagePort,
} from "node:worker_threads";

import { bounds, config, type GameBounds, type GameConfig } from "../../config/index.js";
import type { MaterializedFloor } from "../apply/index.js";
import { assemblePrompt } from "../prompt/assemble.js";
import { summarizeTrace } from "../prompt/summarize.js";
import type { DirectorProvider } from "../provider/index.js";
import { generateFloor, type GenerateFloorContext, type RepairClock } from "../../gauntlet/repair.js";
import type { Gate2RunOptions } from "../../gauntlet/gate2/run.js";
import type { FloorContent, FloorContentProvider } from "../../engine/run/index.js";
import { depthBandForDepth } from "../../engine/state/init.js";
import {
  createFallbackFloorContentProvider,
} from "../../harness/fallback-provider.js";
import type { WriteGenerationRecordOptions } from "../../harness/artifacts/index.js";
import type {
  EnemyDefinition,
  ItemDefinition,
  NpcDefinition,
  TrapDefinition,
} from "../../schemas/entities/index.js";
import type {
  FloorManifest,
  ManifestItemEntry,
  ManifestNpcEntry,
  ManifestRosterEntry,
  ManifestTrapEntry,
} from "../../schemas/manifest.js";
import type { ParsedTrace } from "../../harness/replay/types.js";

import {
  createPrefetchCounterClock,
  type PrefetchClock,
  type PrefetchConfig,
  type PrefetchStatus,
  type ServedFloor,
  type ServedFloorSource,
} from "./types.js";

const DEFAULT_STAIRS_CAP_MS = 8_000;
const SYNC_WAIT_SLICE_MS = 10;

type ReadySlot = {
  readonly depth: number;
  readonly content: FloorContent;
  readonly source: ServedFloorSource;
};

type InFlightSlot = {
  readonly depth: number;
  readonly startedAtMs: number;
  readonly promise: Promise<void>;
  readonly abortController: AbortController;
};

type DiscardedPrefetch = {
  readonly depth: number;
  readonly reason: string;
  readonly atMs: number;
};

export type PrefetchControllerOptions = {
  readonly runId: string;
  readonly seed: string;
  readonly modelId: string;
  readonly provider: DirectorProvider;
  readonly gameConfig?: GameConfig;
  readonly gameBounds?: GameBounds;
  readonly prefetch?: PrefetchConfig;
  readonly fallbackProvider?: FloorContentProvider;
  readonly artifacts?: WriteGenerationRecordOptions;
  readonly gate2?: Gate2RunOptions;
  readonly clock?: PrefetchClock;
  readonly now?: RepairClock;
  readonly repairCap?: number;
  readonly providerGenerationTimeoutMs?: number;
};

export type PrefetchController = {
  readonly onFloorEnter: (depth: number, trace: ParsedTrace) => void;
  readonly getFloor: (depth: number, seed: string) => FloorContent;
  readonly resolveFloor: (depth: number, seed: string) => Promise<ServedFloor>;
  readonly pollStatus: () => PrefetchStatus;
  readonly cancel: () => void;
  readonly getDiscards: () => readonly DiscardedPrefetch[];
};

let globalGenerationInFlight: Promise<void> | null = null;

const waitOnPort = (port: MessagePort, timeoutMs: number): void => {
  (
    receiveMessageOnPort as (
      targetPort: MessagePort,
      options: { readonly timeout: number },
    ) => void
  )(port, { timeout: timeoutMs });
};

const waitForPromiseSync = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  clock: PrefetchClock,
): T | null => {
  if (timeoutMs <= 0) {
    return null;
  }

  const { port1, port2 } = new MessageChannel();
  let settled = false;
  let value: T | null = null;

  void promise.then(
    (resolved) => {
      value = resolved;
      settled = true;
      port1.postMessage("done");
    },
    () => {
      settled = true;
      port1.postMessage("done");
    },
  );

  const deadline = clock() + timeoutMs;
  while (!settled && clock() < deadline) {
    const remaining = deadline - clock();
    if (remaining <= 0) {
      break;
    }

    waitOnPort(port2, Math.min(SYNC_WAIT_SLICE_MS, remaining));
  }

  return settled ? value : null;
};

const withoutPlacementHint = <
  T extends { readonly placementHint: FloorManifest["roster"][number]["placementHint"] },
>(
  entry: T,
): Omit<T, "placementHint"> => {
  const copy = { ...entry } as {
    placementHint?: FloorManifest["roster"][number]["placementHint"];
  } & Record<string, unknown>;
  delete copy.placementHint;
  return copy as Omit<T, "placementHint">;
};

const manifestRosterToDefinitions = (
  roster: readonly ManifestRosterEntry[],
): readonly EnemyDefinition[] => roster.map(withoutPlacementHint);

const manifestItemsToDefinitions = (
  items: readonly ManifestItemEntry[],
): readonly ItemDefinition[] => items.map(withoutPlacementHint);

const manifestTrapsToDefinitions = (
  traps: readonly ManifestTrapEntry[],
): readonly TrapDefinition[] => traps.map(withoutPlacementHint);

const manifestNpcsToDefinitions = (
  npcs: readonly ManifestNpcEntry[],
): readonly NpcDefinition[] => npcs.map(withoutPlacementHint);

const materializedToFloorContent = (
  floor: MaterializedFloor,
  seed: string,
): FloorContent => {
  const manifest = floor.manifest;

  return {
    params: {
      ...manifest.params,
      seed,
    },
    roster: floor.runtime.roster.length > 0
      ? floor.runtime.roster
      : manifestRosterToDefinitions(manifest.roster),
    items: manifestItemsToDefinitions(manifest.items),
    traps: manifestTrapsToDefinitions(manifest.traps),
    npcs: manifestNpcsToDefinitions(manifest.npcs),
    ...(manifest.quest === null ? {} : { quest: manifest.quest }),
  };
};

const generatedResultToFloorContent = (
  floor: MaterializedFloor | FloorContent,
  seed: string,
): FloorContent =>
  "manifest" in floor ? materializedToFloorContent(floor, seed) : floor;

export const createPrefetchController = (
  options: PrefetchControllerOptions,
): PrefetchController => {
  const gameConfig = options.gameConfig ?? config;
  const gameBounds = options.gameBounds ?? bounds;
  const stairsCapMs = options.prefetch?.stairsCapMs ?? DEFAULT_STAIRS_CAP_MS;
  const clock = options.clock ?? createPrefetchCounterClock();
  const fallbackProvider =
    options.fallbackProvider ?? createFallbackFloorContentProvider();

  let cancelled = false;
  let readySlot: ReadySlot | null = null;
  let inFlightSlot: InFlightSlot | null = null;
  let lastStatus: PrefetchStatus = { status: "idle" };
  const discards: DiscardedPrefetch[] = [];
  const servedSources = new Map<number, ServedFloorSource>();
  let currentFloorDepth = 0;

  const setStatus = (status: PrefetchStatus): void => {
    lastStatus = status;
  };

  const buildPrompt = (depth: number, trace: ParsedTrace): string => {
    const band = depthBandForDepth(depth, gameConfig);
    const traceFacts = summarizeTrace(trace, { band });

    return assemblePrompt({
      band,
      depth,
      config: gameConfig,
      bounds: gameBounds,
      traceFacts,
      runContext: {
        seed: options.seed,
        runId: options.runId,
      },
    });
  };

  const buildGenerateContext = (
    depth: number,
    prompt: string,
    signal: AbortSignal,
  ): GenerateFloorContext => ({
    prompt,
    provider: options.provider,
    runId: options.runId,
    depth,
    seed: options.seed,
    modelId: options.modelId,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.repairCap === undefined ? {} : { repairCap: options.repairCap }),
    ...(options.gate2 === undefined ? {} : { gate2: options.gate2 }),
    fallbackProvider,
    ...(options.artifacts === undefined ? {} : { artifacts: options.artifacts }),
    providerOptions: {
      timeoutMs: options.providerGenerationTimeoutMs
        ?? gameConfig.director.manifestTimeoutMs,
      ...(signal.aborted ? { timeoutMs: 1 } : {}),
    },
  });

  const recordDiscard = (depth: number, reason: string): void => {
    if (readySlot?.depth === depth) {
      readySlot = null;
    }

    discards.push({
      depth,
      reason,
      atMs: clock(),
    });
    setStatus({ status: "discarded", depth, reason });
  };

  const completeGeneration = (
    depth: number,
    content: FloorContent,
    source: ServedFloorSource,
  ): void => {
    if (cancelled) {
      recordDiscard(depth, "cancelled");
      return;
    }

    const priorSource = servedSources.get(depth);
    if (priorSource === "fallback" && currentFloorDepth >= depth) {
      recordDiscard(depth, "fallback_already_served");
      return;
    }

    if (readySlot !== null && readySlot.depth !== depth) {
      recordDiscard(readySlot.depth, "superseded_by_new_prefetch");
    }

    readySlot = { depth, content, source };
    setStatus({ status: "ready", depth });
  };

  const runGeneration = async (
    depth: number,
    trace: ParsedTrace,
    abortController: AbortController,
    releaseGlobal: () => void,
    globalGate: Promise<void>,
  ): Promise<void> => {
    const prompt = buildPrompt(depth, trace);
    const generateContext = buildGenerateContext(
      depth,
      prompt,
      abortController.signal,
    );
    try {
      const result = await generateFloor(generateContext);

      if (cancelled || abortController.signal.aborted) {
        recordDiscard(depth, "cancelled");
        return;
      }

      const source: ServedFloorSource =
        result.record.outcome.kind === "manifest" ? "generated" : "fallback";
      const content = generatedResultToFloorContent(result.floor, options.seed);
      completeGeneration(depth, content, source);
    } finally {
      releaseGlobal();
      if (globalGenerationInFlight === globalGate) {
        globalGenerationInFlight = null;
      }
    }
  };

  const startPrefetch = (depth: number, trace: ParsedTrace): void => {
    if (cancelled) {
      return;
    }

    if (depth < 1 || depth > gameConfig.runStructure.depthFloors) {
      return;
    }

    if (readySlot?.depth === depth) {
      return;
    }

    if (inFlightSlot?.depth === depth) {
      return;
    }

    if (inFlightSlot !== null) {
      return;
    }

    if (globalGenerationInFlight !== null) {
      return;
    }

    const abortController = new AbortController();
    const startedAtMs = clock();
    let releaseGlobal: (() => void) | undefined;
    const globalGate = new Promise<void>((resolve) => {
      releaseGlobal = resolve;
    });
    globalGenerationInFlight = globalGate;

    const promise = runGeneration(
      depth,
      trace,
      abortController,
      releaseGlobal!,
      globalGate,
    ).finally(() => {
      if (inFlightSlot?.promise === promise) {
        inFlightSlot = null;
        if (readySlot === null) {
          setStatus({ status: "idle" });
        }
      }
    });

    inFlightSlot = {
      depth,
      startedAtMs,
      promise,
      abortController,
    };
    setStatus({ status: "in_flight", depth, startedAtMs });
  };

  const consumeReady = (depth: number): ReadySlot | null => {
    if (readySlot?.depth !== depth) {
      return null;
    }

    const slot = readySlot;
    readySlot = null;
    setStatus({ status: "idle" });
    return slot;
  };

  const serveFallback = (depth: number, seed: string): ServedFloor => {
    const content = fallbackProvider.getFloor(depth, seed);
    servedSources.set(depth, "fallback");

    return {
      content,
      source: "fallback",
      depth,
    };
  };

  const waitForReadySlot = async (
    depth: number,
    startedAtMs: number,
  ): Promise<ReadySlot | null> => {
    const deadline = startedAtMs + stairsCapMs;

    while (clock() < deadline) {
      const ready = consumeReady(depth);
      if (ready !== null) {
        return ready;
      }

      if (inFlightSlot?.depth !== depth) {
        return null;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, SYNC_WAIT_SLICE_MS);
      });
    }

    return consumeReady(depth);
  };

  const servedFromReady = (ready: ReadySlot, seed: string): ServedFloor => {
    servedSources.set(ready.depth, ready.source);

    return {
      content: {
        ...ready.content,
        params: {
          ...ready.content.params,
          seed,
        },
      },
      source: ready.source,
      depth: ready.depth,
    };
  };

  const resolveFloor = async (
    depth: number,
    seed: string,
  ): Promise<ServedFloor> => {
    const ready = consumeReady(depth);
    if (ready !== null) {
      return servedFromReady(ready, seed);
    }

    if (inFlightSlot?.depth === depth) {
      const waited = await waitForReadySlot(depth, inFlightSlot.startedAtMs);
      if (waited !== null) {
        return servedFromReady(waited, seed);
      }

      return serveFallback(depth, seed);
    }

    startPrefetch(depth, emptyTrace(options.runId, options.seed));
    return serveFallback(depth, seed);
  };

  const onFloorEnter = (depth: number, trace: ParsedTrace): void => {
    currentFloorDepth = depth;
    startPrefetch(depth + 1, trace);
  };

  const getFloor = (depth: number, seed: string): FloorContent => {
    const ready = consumeReady(depth);
    if (ready !== null) {
      servedSources.set(depth, ready.source);
      startPrefetch(depth + 1, emptyTrace(options.runId, options.seed));
      return {
        ...ready.content,
        params: {
          ...ready.content.params,
          seed,
        },
      };
    }

    if (inFlightSlot?.depth === depth) {
      const remainingMs = Math.max(
        0,
        stairsCapMs - (clock() - inFlightSlot.startedAtMs),
      );
      const resolved = waitForPromiseSync(
        inFlightSlot.promise.then(() => consumeReady(depth)),
        remainingMs,
        clock,
      );

      if (resolved !== null) {
        servedSources.set(depth, resolved.source);
        startPrefetch(depth + 1, emptyTrace(options.runId, options.seed));
        return {
          ...resolved.content,
          params: {
            ...resolved.content.params,
            seed,
          },
        };
      }

      const served = serveFallback(depth, seed);
      return served.content;
    }

    startPrefetch(depth, emptyTrace(options.runId, options.seed));
    return serveFallback(depth, seed).content;
  };

  const pollStatus = (): PrefetchStatus => {
    if (cancelled) {
      return { status: "idle" };
    }

    if (readySlot !== null) {
      return { status: "ready", depth: readySlot.depth };
    }

    if (inFlightSlot !== null) {
      return {
        status: "in_flight",
        depth: inFlightSlot.depth,
        startedAtMs: inFlightSlot.startedAtMs,
      };
    }

    return lastStatus.status === "discarded"
      ? lastStatus
      : { status: "idle" };
  };

  const cancel = (): void => {
    cancelled = true;
    inFlightSlot?.abortController.abort();
    inFlightSlot = null;
    readySlot = null;
    setStatus({ status: "idle" });
  };

  return {
    onFloorEnter,
    getFloor,
    resolveFloor,
    pollStatus,
    cancel,
    getDiscards: () => discards,
  };
};

export class DirectorFloorProvider implements FloorContentProvider {
  private readonly controller: PrefetchController;

  constructor(controller: PrefetchController) {
    this.controller = controller;
  }

  getFloor(depth: number, seed: string): FloorContent {
    return this.controller.getFloor(depth, seed);
  }
}

export const createDirectorFloorProvider = (
  options: PrefetchControllerOptions,
): DirectorFloorProvider =>
  new DirectorFloorProvider(createPrefetchController(options));

export const resetGlobalGenerationSemaphoreForTests = (): void => {
  globalGenerationInFlight = null;
};

const emptyTrace = (runId: string, seed: string): ParsedTrace => ({
  header: {
    recordType: "header",
    protocolVersion: "1.2.0",
    engineVersion: "0.0.0",
    modelId: "prefetch",
    contentRef: { providerId: "prefetch", packVersion: "0.0.0" },
    seed,
    createdAt: "2026-06-12T00:00:00.000Z",
    runId,
  },
  turns: [],
});
