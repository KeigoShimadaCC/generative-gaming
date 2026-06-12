"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./ArtifactViewer.module.css";
import { loadArtifactViewerModelFromApi } from "./api-client";
import {
  filterArtifactDocuments,
  type ArtifactDocumentView,
  type ArtifactViewerModel,
} from "./model";

type ArtifactViewerProps = {
  readonly model: ArtifactViewerModel | null;
  readonly runId?: string | null;
};

export function ArtifactViewer({ model, runId = null }: ArtifactViewerProps) {
  const [query, setQuery] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null,
  );
  const [remoteModel, setRemoteModel] = useState<ArtifactViewerModel | null>(
    null,
  );
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const effectiveModel = model ?? remoteModel;
  const documents = useMemo(
    () =>
      effectiveModel === null
        ? []
        : filterArtifactDocuments(effectiveModel.documents, query),
    [effectiveModel, query],
  );
  const selected =
    documents.find((document) => document.id === selectedDocumentId) ??
    documents[0] ??
    null;

  useEffect(() => {
    if (model !== null || runId === null) {
      return;
    }

    const controller = new AbortController();
    setLoadState("loading");
    setRemoteModel(null);

    void loadArtifactViewerModelFromApi(runId, {
      signal: controller.signal,
    }).then(
      (loaded) => {
        if (!controller.signal.aborted) {
          setRemoteModel(loaded);
          setLoadState("loaded");
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setRemoteModel(null);
          setLoadState("error");
        }
      },
    );

    return () => controller.abort();
  }, [model, runId]);

  if (effectiveModel === null) {
    return (
      <section className={styles.empty} aria-label="Artifact viewer">
        <h2>Artifacts</h2>
        <p>{artifactEmptyMessage(loadState, runId)}</p>
      </section>
    );
  }

  return (
    <section className={styles.viewer} aria-label="Artifact viewer">
      <div className={styles.header}>
        <div>
          <h2>Artifacts</h2>
          <p>
            Run {effectiveModel.runId} · {effectiveModel.modelId} · seed{" "}
            {effectiveModel.seed}
          </p>
        </div>
        <label className={styles.search}>
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedDocumentId(null);
            }}
          />
        </label>
      </div>

      <div className={styles.layout}>
        <div className={styles.tree} aria-label="Generation tree">
          {effectiveModel.floors.map((floor) => (
            <section
              className={[
                styles.floor,
                floor.fallback ? styles.fallback : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-fallback={floor.fallback ? "true" : "false"}
              key={floor.id}
            >
              <button
                type="button"
                onClick={() => setSelectedDocumentId(`record:${floor.depth}`)}
              >
                <span>Floor {floor.depth}</span>
                <strong>{floor.outcomeLabel}</strong>
              </button>
              <ol>
                {floor.attempts.map((attempt) => (
                  <li key={attempt.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedDocumentId(
                          attempt.manifestPath === null
                            ? `raw:${floor.depth}:${attempt.attemptIndex}`
                            : `manifest:${floor.depth}:${attempt.attemptIndex}`,
                        )
                      }
                    >
                      <span>{attempt.label}</span>
                      <em>{attempt.providerOk ? "provider ok" : "provider failed"}</em>
                    </button>
                    <div className={styles.usage}>
                      {attempt.latencyLine} · {attempt.usageLine}
                    </div>
                    <div className={styles.paths}>
                      <code>{attempt.rawOutputPath}</code>
                      {attempt.manifestPath === null ? null : (
                        <code>{attempt.manifestPath}</code>
                      )}
                    </div>
                    {attempt.gateSummaries.length === 0 ? null : (
                      <ul className={styles.gates}>
                        {attempt.gateSummaries.map((gate) => (
                          <li
                            className={gate.pass ? styles.gatePass : styles.gateFail}
                            key={`${attempt.id}:${gate.gate}`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedDocumentId(
                                  `gate:${floor.depth}:${attempt.attemptIndex}:${gate.gate}`,
                                )
                              }
                            >
                              <span>{gate.label}</span>
                              <strong>{gate.pass ? "PASS" : "FAIL"}</strong>
                            </button>
                            <p>{gate.summary}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <DocumentPane document={selected} resultCount={documents.length} />
      </div>
    </section>
  );
}

const artifactEmptyMessage = (
  loadState: "idle" | "loading" | "loaded" | "error",
  runId: string | null,
): string => {
  if (loadState === "loading") {
    return "Loading generation artifacts...";
  }

  if (loadState === "error") {
    return "Artifact records are unavailable; fallback play remains intact.";
  }

  return runId === null
    ? "No generation artifacts selected."
    : "No generation artifacts recorded for this run; fallback play remains intact.";
};

function DocumentPane({
  document,
  resultCount,
}: {
  readonly document: ArtifactDocumentView | null;
  readonly resultCount: number;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (document === null) {
    return (
      <div className={styles.document} aria-label="Artifact document">
        <div className={styles.noDocument}>No matching artifacts</div>
      </div>
    );
  }

  return (
    <article
      className={[
        styles.document,
        document.fallback ? styles.fallbackDocument : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Artifact document"
      data-fallback={document.fallback ? "true" : "false"}
    >
      <header>
        <div>
          <h3>{document.title}</h3>
          <p>
            {resultCount} document{resultCount === 1 ? "" : "s"}
            {document.path === null ? "" : ` · ${document.path}`}
          </p>
        </div>
        <button
          type="button"
          data-copy-text={document.pretty}
          onClick={() => {
            setCopiedId(document.id);
            void navigator.clipboard?.writeText(document.pretty);
          }}
        >
          {copiedId === document.id ? "Copied" : "Copy"}
        </button>
      </header>
      <pre>{document.pretty}</pre>
    </article>
  );
}
