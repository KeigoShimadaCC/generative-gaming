import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { ParsedTrace } from "../../harness/replay/types.js";
import type { FloorContent } from "../../engine/run/index.js";

import {
  createPrefetchController,
  type PrefetchController,
  type PrefetchControllerOptions,
} from "./prefetch.js";
import type { PrefetchStatus, ServedFloor } from "./types.js";

export type StartGenerationRequest = {
  readonly runId: string;
  readonly depth: number;
  readonly trace: ParsedTrace;
};

export type PollStatusRequest = {
  readonly runId: string;
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

export const createRunControllerRegistry = (): RunControllerRegistry => {
  const controllers = new Map<string, PrefetchController>();

  return {
    get: (runId) => controllers.get(runId) ?? null,
    getOrCreate: (runId, options) => {
      const existing = controllers.get(runId);
      if (existing !== undefined) {
        return existing;
      }

      const created = createPrefetchController({ ...options, runId });
      controllers.set(runId, created);
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
    const controller = registry.getOrCreate(request.runId, {
      ...defaultOptions,
      runId: request.runId,
    });
    controller.onFloorEnter(request.depth, request.trace);
    return { ok: true, prefetchDepth: request.depth + 1 };
  },
  pollStatus: (request) =>
    registry.get(request.runId)?.pollStatus() ?? { status: "idle" },
  getFloor: async (request) => {
    const controller = registry.get(request.runId);
    if (controller === null) {
      throw new Error(`run ${request.runId} is not active`);
    }

    return controller.resolveFloor(request.depth, request.seed);
  },
});

type JsonRequest = {
  readonly action: "startGeneration" | "pollStatus" | "getFloor";
  readonly body: Record<string, unknown>;
};

const readJsonBody = async (request: IncomingMessage): Promise<JsonRequest> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonRequest;
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
          handlers.startGeneration(payload.body as StartGenerationRequest),
        );
        return;
      }

      if (payload.action === "pollStatus") {
        writeJson(
          response,
          200,
          handlers.pollStatus(payload.body as PollStatusRequest),
        );
        return;
      }

      if (payload.action === "getFloor") {
        const floor = await handlers.getFloor(payload.body as GetFloorRequest);
        writeJson(response, 200, floor);
        return;
      }

      writeJson(response, 400, { error: "unknown_action" });
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

export const floorContentId = (content: FloorContent): string =>
  `${content.params.bandOrSize}:${content.roster.map((enemy) => enemy.id).join(",")}`;
