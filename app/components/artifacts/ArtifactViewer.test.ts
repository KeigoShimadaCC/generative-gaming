import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  MemoryArtifactFs,
  type GenerationRecord,
  type RunGenerationIndex,
} from "@harness/artifacts";

import { readArtifactsRoute } from "@/api/artifacts/route-core";

import { ArtifactViewer } from "./ArtifactViewer";
import { loadArtifactViewerModelFromApi } from "./api-client";
import {
  filterArtifactDocuments,
  reachableArtifactPaths,
} from "./model";
import { loadArtifactViewerModel } from "./reader";

describe("ArtifactViewer", () => {
  it("makes every persisted floor artifact reachable through the reader-backed model", () => {
    const fs = fixtureArtifactFs();
    const model = loadArtifactViewerModel(RUN_ID, { fs, rootDir: "runs" });

    expect(reachableArtifactPaths(model)).toEqual([
      "floors/1/attempts/0/raw.txt",
      "floors/1/attempts/1/manifest.json",
      "floors/1/attempts/1/raw.txt",
      "floors/1/generation.json",
    ]);
    expect(model.floors[0]?.fallback).toBe(true);
    expect(model.floors[0]?.attempts).toHaveLength(2);
    expect(model.documents.map((document) => document.kind)).toContain("gate");
  });

  it("renders tree, readable gate reasons, usage/latency, pretty JSON, search, copy, and fallback highlight", () => {
    const model = loadArtifactViewerModel(RUN_ID, {
      fs: fixtureArtifactFs(),
      rootDir: "runs",
    });
    const markup = renderToStaticMarkup(createElement(ArtifactViewer, { model }));

    expect(markup).toContain("Generation tree");
    expect(markup).toContain("Repair attempt 1");
    expect(markup).toContain("Latency 42ms");
    expect(markup).toContain("Tokens 30 (10 in / 20 out)");
    expect(markup).toContain("Gate 0 failed");
    expect(markup).toContain("G0_INVALID_JSON");
    expect(markup).toContain('data-fallback="true"');
    expect(markup).toContain("Copy");
    expect(markup).toContain("{\n");

    const filtered = filterArtifactDocuments(model.documents, "invalid JSON");
    expect(filtered.map((document) => document.kind)).toContain("gate");
  });

  it("renders a presentable empty state for runs without artifacts", () => {
    const markup = renderToStaticMarkup(
      createElement(ArtifactViewer, { model: null, runId: "missing-run" }),
    );

    expect(markup).toContain("No generation artifacts recorded for this run");
    expect(markup).toContain("fallback play remains intact");
  });

  it("loads the Tab artifact pane model through the read-only API bridge", async () => {
    const fs = fixtureArtifactFs();
    const listResult = readArtifactsRoute("http://localhost/api/artifacts", {
      fs,
      rootDir: "runs",
    });
    const loadResult = readArtifactsRoute(
      `http://localhost/api/artifacts?runId=${encodeURIComponent(RUN_ID)}`,
      { fs, rootDir: "runs" },
    );
    const unsafeResult = readArtifactsRoute(
      "http://localhost/api/artifacts?runId=../secret",
      { fs, rootDir: "runs" },
    );

    expect(listResult.status).toBe(200);
    expect(
      listResult.payload.ok && listResult.payload.action === "list"
        ? listResult.payload.runs.map((run) => run.runId)
        : [],
    ).toEqual([RUN_ID]);
    expect(loadResult.status).toBe(200);
    expect(unsafeResult.status).toBe(400);
    if (!loadResult.payload.ok || loadResult.payload.action !== "load") {
      throw new Error("fixture artifact bridge did not load the run model");
    }

    const fetched = await loadArtifactViewerModelFromApi(RUN_ID, {
      fetcher: async () =>
        new Response(JSON.stringify(loadResult.payload), {
          status: loadResult.status,
          headers: { "content-type": "application/json" },
        }),
    });
    const markup = renderToStaticMarkup(
      createElement(ArtifactViewer, { model: fetched }),
    );

    expect(fetched?.runId).toBe(RUN_ID);
    expect(markup).toContain("Repair attempt 1");
    expect(markup).toContain("Gate 0 failed");
  });
});

const RUN_ID = "run-artifact-viewer";
const SEED = "artifact-viewer-seed";
const CREATED_AT = "2026-06-12T00:00:00.000Z";
const PROTOCOL_VERSION = "1.2.0";
const ENGINE_VERSION = "0.0.0";

const fixtureArtifactFs = (): MemoryArtifactFs => {
  const fs = new MemoryArtifactFs();
  const record = generationRecord();
  const index: RunGenerationIndex = {
    recordType: "generation-index",
    protocolVersion: PROTOCOL_VERSION,
    engineVersion: ENGINE_VERSION,
    modelId: "mock",
    seed: SEED,
    createdAt: CREATED_AT,
    runId: RUN_ID,
    updatedAt: "2026-06-12T00:01:00.000Z",
    floors: [
      {
        depth: 1,
        recordPath: "floors/1/generation.json",
        outcome: {
          kind: "fallback",
          fallbackId: "fallback:old-stock:shallows-1",
        },
        recordedAt: "2026-06-12T00:01:00.000Z",
      },
    ],
  };

  fs.files.set(`runs/${RUN_ID}/index.json`, `${JSON.stringify(index)}\n`);
  fs.files.set(
    `runs/${RUN_ID}/floors/1/generation.json`,
    `${JSON.stringify(record)}\n`,
  );

  return fs;
};

const generationRecord = (): GenerationRecord => ({
  recordType: "generation",
  protocolVersion: PROTOCOL_VERSION,
  engineVersion: ENGINE_VERSION,
  modelId: "mock",
  seed: SEED,
  createdAt: CREATED_AT,
  runId: RUN_ID,
  depth: 1,
  attempts: [
    {
      attemptIndex: 0,
      promptHash: "prompt-0",
      rawOutputPath: "floors/1/attempts/0/raw.txt",
      provider: {
        ok: false,
        usage: {
          latencyMs: 17,
          tokens: null,
        },
        error: {
          code: "parse_fail",
          message: "invalid JSON",
        },
      },
      gateReports: {
        gate0: {
          gate: 0,
          pass: false,
          checks: [
            {
              code: "G0_INVALID_JSON",
              pass: false,
              detail: "invalid JSON near byte 2",
            },
          ],
        },
      },
    },
    {
      attemptIndex: 1,
      promptHash: "prompt-1",
      rawOutputPath: "floors/1/attempts/1/raw.txt",
      provider: {
        ok: true,
        usage: {
          latencyMs: 42,
          tokens: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
          },
        },
        manifestPath: "floors/1/attempts/1/manifest.json",
      },
      gateReports: {
        gate0: {
          gate: 0,
          pass: true,
          checks: [
            {
              code: "G0_SCHEMA",
              pass: true,
              detail: "schema valid",
            },
          ],
        },
        gate1: {
          gate: 1,
          pass: true,
          checks: [
            {
              code: "G1_REF_INTEGRITY",
              pass: true,
              detail: "refs intact",
            },
          ],
        },
      },
    },
  ],
  outcome: {
    kind: "fallback",
    fallbackId: "fallback:old-stock:shallows-1",
  },
});
