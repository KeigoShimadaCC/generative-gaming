import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
} from "../../../src/schemas/protocol.js";
import { START_GENERATION_BODY_MAX_BYTES } from "./route-helpers";

const handlerMocks = vi.hoisted(() => ({
  startGeneration: vi.fn(),
  pollStatus: vi.fn(),
  getFloor: vi.fn(),
}));

vi.mock("./transport-server", () => ({
  getTransportHandlers: () => handlerMocks,
}));

import { POST as startGenerationPost } from "./start-generation/route";

describe("director API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlerMocks.startGeneration.mockReturnValue({ ok: true, prefetchDepth: 2 });
    handlerMocks.pollStatus.mockReturnValue({ status: "idle" });
    handlerMocks.getFloor.mockResolvedValue({
      depth: 2,
      source: "fallback",
      content: {
        params: {
          bandOrSize: "shallows",
          roomCountRange: { min: 3, max: 5 },
          flavor: "warren",
          seed: "route-seed",
        },
        roster: [],
        items: [],
        traps: [],
        npcs: [],
      },
    });
  });

  it("rejects start-generation bodies with missing depth", async () => {
    const body = validStartGenerationBody();
    const response = await startGenerationPost(
      jsonRequest({ runId: body.runId, trace: body.trace }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(handlerMocks.startGeneration).not.toHaveBeenCalled();
  });

  it("rejects start-generation bodies with non-numeric depth", async () => {
    const response = await startGenerationPost(
      jsonRequest({ ...validStartGenerationBody(), depth: "2" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(handlerMocks.startGeneration).not.toHaveBeenCalled();
  });

  it("sanitizes internal errors from start-generation", async () => {
    handlerMocks.startGeneration.mockImplementation(() => {
      throw new Error(
        "failed reading /Users/keigoshimada/Documents/generative-gaming/.env",
      );
    });

    const response = await startGenerationPost(
      jsonRequest(validStartGenerationBody()),
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "internal_error" });
    expect(JSON.stringify(payload)).not.toContain("/Users/");
  });

  it("caps start-generation request bodies", async () => {
    const response = await startGenerationPost(
      new Request("http://localhost/api/director/start-generation", {
        method: "POST",
        body: "x".repeat(START_GENERATION_BODY_MAX_BYTES + 1),
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "body_too_large" });
    expect(handlerMocks.startGeneration).not.toHaveBeenCalled();
  });
});

const jsonRequest = (body: unknown): Request =>
  new Request("http://localhost/api/director/start-generation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const validStartGenerationBody = () => ({
  runId: "route-run",
  depth: 1,
  trace: {
    header: {
      recordType: "header",
      protocolVersion: PROTOCOL_VERSION,
      engineVersion: ENGINE_VERSION,
      modelId: "route-test",
      contentRef: {
        providerId: "route-test",
        packVersion: "0.0.0",
      },
      seed: "route-seed",
      runId: "route-run",
      createdAt: "2026-06-14T00:00:00.000Z",
    },
    turns: [],
  },
});
