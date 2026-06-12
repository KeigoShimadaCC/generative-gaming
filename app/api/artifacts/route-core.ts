import {
  listRuns,
  type ArtifactReadOptions,
  type RunGenerationSummary,
} from "../../../src/harness/artifacts/index.js";

import { loadArtifactViewerModel } from "@/components/artifacts/reader";
import type { ArtifactViewerModel } from "@/components/artifacts/model";

export type ArtifactsRoutePayload =
  | {
      readonly ok: true;
      readonly action: "list";
      readonly runs: readonly RunGenerationSummary[];
    }
  | {
      readonly ok: true;
      readonly action: "load";
      readonly model: ArtifactViewerModel;
    }
  | {
      readonly ok: false;
      readonly error: string;
    };

export type ArtifactsRouteResult = {
  readonly status: number;
  readonly payload: ArtifactsRoutePayload;
};

export const readArtifactsRoute = (
  requestUrl: string | URL,
  options: ArtifactReadOptions,
): ArtifactsRouteResult => {
  const url =
    typeof requestUrl === "string"
      ? new URL(requestUrl, "http://localhost")
      : requestUrl;
  const runId = url.searchParams.get("runId");

  if (runId === null || runId.trim().length === 0) {
    return {
      status: 200,
      payload: {
        ok: true,
        action: "list",
        runs: listRuns(options),
      },
    };
  }

  if (!isSafeRunId(runId)) {
    return {
      status: 400,
      payload: { ok: false, error: "invalid_run_id" },
    };
  }

  try {
    return {
      status: 200,
      payload: {
        ok: true,
        action: "load",
        model: loadArtifactViewerModel(runId, options),
      },
    };
  } catch (error) {
    return {
      status: 404,
      payload: {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
};

const isSafeRunId = (runId: string): boolean =>
  /^[A-Za-z0-9._:#-]+$/u.test(runId);
