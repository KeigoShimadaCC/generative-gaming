import { describe, expect, it } from "vitest";

import {
  rosterAffordable,
  rosterCost
} from "../../../src/engine/enemies/index.js";
import { depthBandForDepth } from "../../../src/engine/state/init.js";
import type { ParsedTrace } from "../../../src/harness/replay/types.js";
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION
} from "../../../src/schemas/protocol.js";

import { createWebTransportState } from "./transport-server";

describe("web director transport", () => {
  it("serves middle-band generated content for a depth 5 request", async () => {
    const { handlers } = createWebTransportState();
    const runId = "transport-depth-5-test";

    handlers.startGeneration({
      runId,
      depth: 4,
      trace: emptyTrace(runId)
    });

    const served = await handlers.getFloor({
      runId,
      depth: 5,
      seed: "transport-depth-5-seed"
    });
    const band = depthBandForDepth(5);

    expect(served.source).toBe("generated");
    expect(served.depth).toBe(5);
    expect(served.content.params.bandOrSize).toBe("middle");
    expect(band).toBe("middle");
    expect(rosterAffordable(served.content.roster, band)).toBe(true);
    expect(rosterCost(served.content.roster)).toBeGreaterThan(0);
  });
});

const emptyTrace = (runId: string): ParsedTrace => ({
  header: {
    recordType: "header",
    protocolVersion: PROTOCOL_VERSION,
    engineVersion: ENGINE_VERSION,
    modelId: "transport-test",
    contentRef: {
      providerId: "fallback:old-stock",
      packVersion: "0.0.0"
    },
    seed: "transport-test-seed",
    createdAt: "2026-06-13T00:00:00.000Z",
    runId
  },
  turns: []
});
