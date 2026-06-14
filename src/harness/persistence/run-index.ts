import type Database from "better-sqlite3";

import type { RunIndexInsert, RunIndexRow, RunSummary } from "./types.js";
import type { TraceContentRef } from "../trace/recorder.js";

export type RunIndexRepository = {
  readonly insert: (entry: RunIndexInsert) => RunIndexRow;
  readonly get: (runId: string) => RunIndexRow | undefined;
  readonly listRecent: (limit: number) => readonly RunIndexRow[];
};

type RunIndexRecord = {
  readonly run_id: string;
  readonly protocol_version: string;
  readonly engine_version: string;
  readonly model_id: string;
  readonly content_provider_id: string;
  readonly content_pack_version: string;
  readonly seed: string;
  readonly created_at: string;
  readonly outcome: RunIndexRow["outcome"];
  readonly depth: number;
  readonly turns: number;
  readonly summary_json: string;
  readonly trace_path: string;
};

const parseSummary = (summaryJson: string): RunSummary => {
  return JSON.parse(summaryJson) as RunSummary;
};

const toContentRef = (record: RunIndexRecord): TraceContentRef => ({
  providerId: record.content_provider_id,
  packVersion: record.content_pack_version,
});

const toRow = (record: RunIndexRecord): RunIndexRow => ({
  runId: record.run_id,
  protocolVersion: record.protocol_version,
  engineVersion: record.engine_version,
  modelId: record.model_id,
  contentRef: toContentRef(record),
  seed: record.seed,
  createdAt: record.created_at,
  outcome: record.outcome,
  depth: record.depth,
  turns: record.turns,
  summary: parseSummary(record.summary_json),
  tracePath: record.trace_path,
});

export const createRunIndexRepository = (
  db: Database.Database
): RunIndexRepository => {
  const insertRun = db.prepare(`
    INSERT INTO run_index (
      run_id,
      protocol_version,
      engine_version,
      model_id,
      content_provider_id,
      content_pack_version,
      seed,
      created_at,
      outcome,
      depth,
      turns,
      summary_json,
      trace_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectById = db.prepare(
    "SELECT * FROM run_index WHERE run_id = ?"
  );
  const listRecentStmt = db.prepare(`
    SELECT * FROM run_index
    ORDER BY created_at DESC, rowid DESC
    LIMIT ?
  `);

  const insert = (entry: RunIndexInsert): RunIndexRow => {
    const { header } = entry;
    insertRun.run(
      entry.runId,
      header.protocolVersion,
      header.engineVersion,
      header.modelId,
      header.contentRef.providerId,
      header.contentRef.packVersion,
      header.seed,
      header.createdAt,
      entry.outcome,
      entry.depth,
      entry.turns,
      JSON.stringify(entry.summary),
      entry.tracePath
    );
    return {
      runId: entry.runId,
      protocolVersion: header.protocolVersion,
      engineVersion: header.engineVersion,
      modelId: header.modelId,
      contentRef: header.contentRef,
      seed: header.seed,
      createdAt: header.createdAt,
      outcome: entry.outcome,
      depth: entry.depth,
      turns: entry.turns,
      summary: entry.summary,
      tracePath: entry.tracePath,
    };
  };

  const get = (runId: string): RunIndexRow | undefined => {
    const record = selectById.get(runId) as RunIndexRecord | undefined;
    return record === undefined ? undefined : toRow(record);
  };

  const listRecent = (limit: number): readonly RunIndexRow[] => {
    const records = listRecentStmt.all(limit) as RunIndexRecord[];
    return records.map(toRow);
  };

  return { insert, get, listRecent };
};
