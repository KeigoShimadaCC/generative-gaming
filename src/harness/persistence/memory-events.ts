import type Database from "better-sqlite3";

import type {
  MemoryEventInsert,
  MemoryEventPayload,
  MemoryEventRow,
  MemoryEventType,
} from "./types.js";

export type MemoryEventsRepository = {
  readonly insert: (event: MemoryEventInsert) => MemoryEventRow;
  readonly get: (id: string) => MemoryEventRow | undefined;
  readonly recentEvents: (
    profileId: string,
    limit: number
  ) => readonly MemoryEventRow[];
  readonly eventsBySalience: (
    profileId: string,
    types: readonly MemoryEventType[] | undefined,
    limit: number
  ) => readonly MemoryEventRow[];
};

type MemoryEventRecord = {
  readonly id: string;
  readonly profile_id: string;
  readonly run_id: string;
  readonly type: MemoryEventType;
  readonly payload_json: string;
  readonly created_at: string;
  readonly salience: number;
};

const parsePayload = (payloadJson: string): MemoryEventPayload => {
  return JSON.parse(payloadJson) as MemoryEventPayload;
};

const toRow = (record: MemoryEventRecord): MemoryEventRow => ({
  id: record.id,
  profileId: record.profile_id,
  runId: record.run_id,
  type: record.type,
  payload: parsePayload(record.payload_json),
  createdAt: record.created_at,
  salience: record.salience,
});

export const createMemoryEventsRepository = (
  db: Database.Database
): MemoryEventsRepository => {
  const insertEvent = db.prepare(`
    INSERT INTO memory_events (
      id,
      profile_id,
      run_id,
      type,
      payload_json,
      created_at,
      salience
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const selectById = db.prepare(
    "SELECT * FROM memory_events WHERE id = ?"
  );
  const recentEventsStmt = db.prepare(`
    SELECT * FROM memory_events
    WHERE profile_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const insert = (event: MemoryEventInsert): MemoryEventRow => {
    insertEvent.run(
      event.id,
      event.profileId,
      event.runId,
      event.type,
      JSON.stringify(event.payload),
      event.createdAt,
      event.salience
    );
    return {
      id: event.id,
      profileId: event.profileId,
      runId: event.runId,
      type: event.type,
      payload: event.payload,
      createdAt: event.createdAt,
      salience: event.salience,
    };
  };

  const get = (id: string): MemoryEventRow | undefined => {
    const record = selectById.get(id) as MemoryEventRecord | undefined;
    return record === undefined ? undefined : toRow(record);
  };

  const recentEvents = (
    profileId: string,
    limit: number
  ): readonly MemoryEventRow[] => {
    const records = recentEventsStmt.all(profileId, limit) as MemoryEventRecord[];
    return records.map(toRow);
  };

  const eventsBySalience = (
    profileId: string,
    types: readonly MemoryEventType[] | undefined,
    limit: number
  ): readonly MemoryEventRow[] => {
    if (types === undefined || types.length === 0) {
      const records = db
        .prepare(
          `
          SELECT * FROM memory_events
          WHERE profile_id = ?
          ORDER BY salience DESC, created_at DESC
          LIMIT ?
        `
        )
        .all(profileId, limit) as MemoryEventRecord[];
      return records.map(toRow);
    }

    const placeholders = types.map(() => "?").join(", ");
    const records = db
      .prepare(
        `
        SELECT * FROM memory_events
        WHERE profile_id = ? AND type IN (${placeholders})
        ORDER BY salience DESC, created_at DESC
        LIMIT ?
      `
      )
      .all(profileId, ...types, limit) as MemoryEventRecord[];
    return records.map(toRow);
  };

  return { insert, get, recentEvents, eventsBySalience };
};
