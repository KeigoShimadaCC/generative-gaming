import type {
  AttemptGateReports,
  GenerationAttemptRecord,
  GenerationRecord,
  RunGenerationIndex,
} from "@harness/artifacts";

export type ArtifactGateSummary = {
  readonly gate: "gate0" | "gate1" | "gate2";
  readonly label: string;
  readonly pass: boolean;
  readonly summary: string;
  readonly json: string;
};

export type ArtifactAttemptView = {
  readonly id: string;
  readonly attemptIndex: number;
  readonly label: string;
  readonly promptHash: string;
  readonly providerOk: boolean;
  readonly usageLine: string;
  readonly latencyLine: string;
  readonly rawOutputPath: string;
  readonly manifestPath: string | null;
  readonly gateSummaries: readonly ArtifactGateSummary[];
};

export type ArtifactDocumentView = {
  readonly id: string;
  readonly title: string;
  readonly path: string | null;
  readonly kind: "record" | "raw" | "manifest" | "gate" | "outcome";
  readonly depth: number;
  readonly attemptIndex: number | null;
  readonly fallback: boolean;
  readonly pretty: string;
  readonly searchText: string;
};

export type ArtifactFloorView = {
  readonly id: string;
  readonly depth: number;
  readonly recordPath: string;
  readonly outcomeLabel: string;
  readonly fallback: boolean;
  readonly attempts: readonly ArtifactAttemptView[];
};

export type ArtifactViewerModel = {
  readonly runId: string;
  readonly modelId: string;
  readonly seed: string;
  readonly updatedAt: string;
  readonly floors: readonly ArtifactFloorView[];
  readonly documents: readonly ArtifactDocumentView[];
};

export const createArtifactViewerModel = ({
  index,
  records,
}: {
  readonly index: RunGenerationIndex;
  readonly records: readonly GenerationRecord[];
}): ArtifactViewerModel => {
  const recordByDepth = new Map(records.map((record) => [record.depth, record]));
  const floors: ArtifactFloorView[] = [];
  const documents: ArtifactDocumentView[] = [];

  for (const floor of [...index.floors].sort((left, right) => left.depth - right.depth)) {
    const record = recordByDepth.get(floor.depth);
    if (record === undefined) {
      continue;
    }

    const fallback = record.outcome.kind === "fallback";
    const attempts = record.attempts.map((attempt) =>
      attemptView(record.depth, attempt),
    );

    floors.push({
      id: `floor:${record.depth}`,
      depth: record.depth,
      recordPath: floor.recordPath,
      outcomeLabel: outcomeLabel(record),
      fallback,
      attempts,
    });

    documents.push(
      documentView({
        id: `record:${record.depth}`,
        title: `Floor ${record.depth} generation record`,
        path: floor.recordPath,
        kind: "record",
        depth: record.depth,
        attemptIndex: null,
        fallback,
        value: record,
      }),
      documentView({
        id: `outcome:${record.depth}`,
        title: `Floor ${record.depth} outcome`,
        path: record.outcome.kind === "manifest" ? record.outcome.manifestPath : null,
        kind: "outcome",
        depth: record.depth,
        attemptIndex: null,
        fallback,
        value: record.outcome,
      }),
    );

    for (const attempt of record.attempts) {
      documents.push(
        documentView({
          id: `raw:${record.depth}:${attempt.attemptIndex}`,
          title: `Floor ${record.depth} attempt ${attempt.attemptIndex} raw output`,
          path: attempt.rawOutputPath,
          kind: "raw",
          depth: record.depth,
          attemptIndex: attempt.attemptIndex,
          fallback,
          value: {
            path: attempt.rawOutputPath,
            provider: attempt.provider,
          },
        }),
      );

      if (attempt.provider.manifestPath !== undefined) {
        documents.push(
          documentView({
            id: `manifest:${record.depth}:${attempt.attemptIndex}`,
            title: `Floor ${record.depth} attempt ${attempt.attemptIndex} manifest`,
            path: attempt.provider.manifestPath,
            kind: "manifest",
            depth: record.depth,
            attemptIndex: attempt.attemptIndex,
            fallback,
            value: {
              path: attempt.provider.manifestPath,
              promptHash: attempt.promptHash,
            },
          }),
        );
      }

      for (const gate of gateSummaries(attempt.gateReports)) {
        documents.push(
          documentView({
            id: `gate:${record.depth}:${attempt.attemptIndex}:${gate.gate}`,
            title: `Floor ${record.depth} attempt ${attempt.attemptIndex} ${gate.label}`,
            path: null,
            kind: "gate",
            depth: record.depth,
            attemptIndex: attempt.attemptIndex,
            fallback,
            value: JSON.parse(gate.json) as unknown,
            extraSearchText: gate.summary,
          }),
        );
      }
    }
  }

  return {
    runId: index.runId,
    modelId: index.modelId,
    seed: index.seed,
    updatedAt: index.updatedAt,
    floors,
    documents,
  };
};

export const filterArtifactDocuments = (
  documents: readonly ArtifactDocumentView[],
  query: string,
): readonly ArtifactDocumentView[] => {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return documents;
  }

  return documents.filter((document) =>
    document.searchText.toLowerCase().includes(normalized),
  );
};

export const reachableArtifactPaths = (
  model: ArtifactViewerModel,
): readonly string[] =>
  [
    ...new Set(
      model.documents.flatMap((document) =>
        document.path === null ? [] : [document.path],
      ),
    ),
  ].sort();

const attemptView = (
  depth: number,
  attempt: GenerationAttemptRecord,
): ArtifactAttemptView => ({
  id: `attempt:${depth}:${attempt.attemptIndex}`,
  attemptIndex: attempt.attemptIndex,
  label:
    attempt.attemptIndex === 0
      ? "Initial attempt"
      : `Repair attempt ${attempt.attemptIndex}`,
  promptHash: attempt.promptHash,
  providerOk: attempt.provider.ok,
  usageLine: usageLine(attempt),
  latencyLine: `Latency ${attempt.provider.usage.latencyMs}ms`,
  rawOutputPath: attempt.rawOutputPath,
  manifestPath: attempt.provider.manifestPath ?? null,
  gateSummaries: gateSummaries(attempt.gateReports),
});

const gateSummaries = (
  gateReports: AttemptGateReports | undefined,
): readonly ArtifactGateSummary[] => {
  if (gateReports === undefined) {
    return [];
  }

  return [
    gateReports.gate0 === undefined
      ? null
      : {
          gate: "gate0" as const,
          label: "Gate 0",
          pass: gateReports.gate0.pass,
          summary: gateReportSummary("Gate 0", gateReports.gate0),
          json: prettyJson(gateReports.gate0),
        },
    gateReports.gate1 === undefined
      ? null
      : {
          gate: "gate1" as const,
          label: "Gate 1",
          pass: gateReports.gate1.pass,
          summary: gateReportSummary("Gate 1", gateReports.gate1),
          json: prettyJson(gateReports.gate1),
        },
    gateReports.gate2 === undefined
      ? null
      : {
          gate: "gate2" as const,
          label: "Gate 2",
          pass: gateReports.gate2.pass,
          summary: gateReportSummary("Gate 2", gateReports.gate2),
          json: prettyJson(gateReports.gate2),
        },
  ].filter((summary): summary is ArtifactGateSummary => summary !== null);
};

const gateReportSummary = (
  label: string,
  report: { readonly pass: boolean; readonly checks: readonly { readonly pass: boolean; readonly code: string; readonly detail: string }[] },
): string => {
  const failed = report.checks.filter((check) => !check.pass);
  if (failed.length === 0) {
    return `${label} passed: ${report.checks.map((check) => check.code).join(", ")}`;
  }

  return `${label} failed: ${failed
    .map((check) => `${check.code} (${check.detail})`)
    .join("; ")}`;
};

const usageLine = (attempt: GenerationAttemptRecord): string => {
  const tokens = attempt.provider.usage.tokens;
  if (tokens === null || tokens === undefined) {
    return "Tokens unavailable";
  }

  const total = tokens.totalTokens ?? "?";
  const input = tokens.inputTokens ?? "?";
  const output = tokens.outputTokens ?? "?";

  return `Tokens ${total} (${input} in / ${output} out)`;
};

const outcomeLabel = (record: GenerationRecord): string =>
  record.outcome.kind === "fallback"
    ? `Fallback: ${record.outcome.fallbackId}`
    : `Manifest: ${record.outcome.manifestPath}`;

const documentView = ({
  id,
  title,
  path,
  kind,
  depth,
  attemptIndex,
  fallback,
  value,
  extraSearchText = "",
}: {
  readonly id: string;
  readonly title: string;
  readonly path: string | null;
  readonly kind: ArtifactDocumentView["kind"];
  readonly depth: number;
  readonly attemptIndex: number | null;
  readonly fallback: boolean;
  readonly value: unknown;
  readonly extraSearchText?: string;
}): ArtifactDocumentView => {
  const pretty = typeof value === "string" ? value : prettyJson(value);

  return {
    id,
    title,
    path,
    kind,
    depth,
    attemptIndex,
    fallback,
    pretty,
    searchText: [title, path ?? "", kind, pretty, extraSearchText].join("\n"),
  };
};

const prettyJson = (value: unknown): string => JSON.stringify(value, null, 2);
