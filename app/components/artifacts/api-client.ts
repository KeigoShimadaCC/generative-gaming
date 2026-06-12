import type { ArtifactViewerModel } from "./model";

export type ArtifactFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type ArtifactLoadPayload =
  | {
      readonly ok: true;
      readonly action: "load";
      readonly model: ArtifactViewerModel;
    }
  | {
      readonly ok: false;
      readonly error: string;
    };

export const loadArtifactViewerModelFromApi = async (
  runId: string,
  options: {
    readonly fetcher?: ArtifactFetch;
    readonly signal?: AbortSignal;
  } = {},
): Promise<ArtifactViewerModel | null> => {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const response = await fetcher(
    `/api/artifacts?runId=${encodeURIComponent(runId)}`,
    {
      method: "GET",
      headers: { accept: "application/json" },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`artifact request failed: ${response.status}`);
  }

  const payload = (await response.json()) as ArtifactLoadPayload;
  if (!payload.ok) {
    throw new Error(payload.error);
  }

  return payload.model;
};
