import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { ParsedTrace } from "../../harness/replay/types.js";
import type { FloorContent } from "../../engine/run/index.js";

import {
  createPrefetchController,
  type PrefetchController,
  type PrefetchControllerOptions,
} from "./prefetch.js";
import {
  TransportJsonRequestSchema,
  type TransportJsonRequest,
} from "./transport-validation.js";
import type { PrefetchStatus, ServedFloor } from "./types.js";

export type StartGenerationRequest = {
  readonly runId: string;
  readonly depth: number;
  readonly trace: ParsedTrace;
};

export type PollStatusRequest = {
  readonly runId: string;
  readonly depth?: number;
};

export type GetFloorRequest = {
  readonly runId: string;
  readonly depth: number;
  readonly seed: string;
};

export type StartGenerationResponse = {
  readonly ok: true;
  readonly prefetchDepth: number;
};

export type PollStatusResponse = PrefetchStatus;

export type GetFloorResponse = ServedFloor;

export type TransportHandlers = {
  readonly startGeneration: (
    request: StartGenerationRequest,
  ) => StartGenerationResponse;
  readonly pollStatus: (request: PollStatusRequest) => PollStatusResponse;
  readonly getFloor: (request: GetFloorRequest) => Promise<GetFloorResponse>;
};

export type RunControllerRegistry = {
  readonly get: (runId: string) => PrefetchController | null;
  readonly getOrCreate: (
    runId: string,
    options: PrefetchControllerOptions,
  ) => PrefetchController;
  readonly remove: (runId: string) => void;
};

export type RunControllerRegistryOptions = {
  readonly maxControllers?: number;
  /** When set, all controllers use this runId instead of the map key. */
  readonly controllerRunId?: string;
};

const DEFAULT_MAX_CONTROLLERS = 128;

export const createRunControllerRegistry = (
  options: RunControllerRegistryOptions = {},
): RunControllerRegistry => {
  const controllers = new Map<string, PrefetchController>();
  const maxControllers = options.maxControllers ?? DEFAULT_MAX_CONTROLLERS;
  const controllerRunId = options.controllerRunId;

  const touch = (runId: string, controller: PrefetchController): void => {
    controllers.delete(runId);
    controllers.set(runId, controller);
  };

  const evictOverflow = (): void => {
    while (controllers.size > maxControllers) {
      const oldestRunId = controllers.keys().next().value as string | undefined;
      if (oldestRunId === undefined) {
        return;
      }
      const oldest = controllers.get(oldestRunId);
      oldest?.cancel();
      controllers.delete(oldestRunId);
    }
  };

  return {
    get: (runId) => {
      const controller = controllers.get(runId);
      if (controller === undefined) {
        return null;
      }
      touch(runId, controller);
      return controller;
    },
    getOrCreate: (runId, options) => {
      const existing = controllers.get(runId);
      if (existing !== undefined) {
        touch(runId, existing);
        return existing;
      }

      const created = createPrefetchController({
        ...options,
        runId: controllerRunId ?? runId,
      });
      controllers.set(runId, created);
      evictOverflow();
      return created;
    },
    remove: (runId) => {
      const controller = controllers.get(runId);
      controller?.cancel();
      controllers.delete(runId);
    },
  };
};

export const createTransportHandlers = (
  registry: RunControllerRegistry,
  defaultOptions: Omit<PrefetchControllerOptions, "runId">,
): TransportHandlers => ({
  startGeneration: (request) => {
    if (request.trace.terminal !== undefined && request.trace.terminal !== null) {
      registry.remove(request.runId);
      return { ok: true, prefetchDepth: request.depth + 1 };
    }

    const controller = registry.getOrCreate(request.runId, {
      ...defaultOptions,
      runId: request.runId,
    });
    controller.onFloorEnter(request.depth, request.trace);
    return { ok: true, prefetchDepth: request.depth + 1 };
  },
  pollStatus: (request) =>
    statusForRequestedDepth(
      registry.get(request.runId)?.pollStatus() ?? { status: "idle" },
      request.depth,
    ),
  getFloor: async (request) => {
    const controller = registry.get(request.runId);
    if (controller === null) {
      throw new Error(`run ${request.runId} is not active`);
    }

    return controller.resolveFloor(request.depth, request.seed);
  },
});

type HttpHarnessRequestErrorCode = "invalid_json" | "invalid_request";

class HttpHarnessRequestError extends Error {
  readonly status: number;
  readonly code: HttpHarnessRequestErrorCode;

  constructor(status: number, code: HttpHarnessRequestErrorCode) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const readJsonBody = async (
  request: IncomingMessage,
): Promise<TransportJsonRequest> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpHarnessRequestError(400, "invalid_json");
  }

  const result = TransportJsonRequestSchema.safeParse(parsed);
  if (!result.success) {
    throw new HttpHarnessRequestError(400, "invalid_request");
  }

  return result.data;
};

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void => {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
};

export const createHttpHarness = (
  handlers: TransportHandlers,
): ReturnType<typeof createServer> =>
  createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/director") {
      writeJson(response, 404, { error: "not_found" });
      return;
    }

    try {
      const payload = await readJsonBody(request);
      if (payload.action === "startGeneration") {
        writeJson(
          response,
          200,
          handlers.startGeneration(payload.body),
        );
        return;
      }

      if (payload.action === "pollStatus") {
        writeJson(
          response,
          200,
          handlers.pollStatus(payload.body),
        );
        return;
      }

      if (payload.action === "getFloor") {
        const floor = await handlers.getFloor(payload.body);
        writeJson(response, 200, floor);
        return;
      }

      writeJson(response, 400, { error: "unknown_action" });
    } catch (error) {
      if (error instanceof HttpHarnessRequestError) {
        writeJson(response, error.status, { error: error.code });
        return;
      }

      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

export const floorContentId = (content: FloorContent): string =>
  `${content.params.bandOrSize}:${content.roster.map((enemy) => enemy.id).join(",")}`;

const statusForRequestedDepth = (
  status: PrefetchStatus,
  requestedDepth: number | undefined,
): PrefetchStatus => {
  if (
    requestedDepth !== undefined &&
    "depth" in status &&
    status.depth !== requestedDepth
  ) {
    return { status: "idle" };
  }

  return status;
};
