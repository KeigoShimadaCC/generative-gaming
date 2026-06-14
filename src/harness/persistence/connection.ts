import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { MIGRATIONS } from "./migrations.js";
import { createMemoryEventsRepository } from "./memory-events.js";
import { createProfileRepository } from "./profile.js";
import { createRunIndexRepository } from "./run-index.js";
import type { MemoryEventsRepository } from "./memory-events.js";
import type { ProfileRepository } from "./profile.js";
import type { RunIndexRepository } from "./run-index.js";

export const DEFAULT_DB_PATH = ".local/everdeep.sqlite";

export type OpenDatabaseOptions = {
  readonly path?: string;
};

export type PersistenceDatabase = {
  readonly path: string;
  readonly profile: ProfileRepository;
  readonly runIndex: RunIndexRepository;
  readonly memoryEvents: MemoryEventsRepository;
  readonly close: () => void;
};

const ensureParentDirectory = (filePath: string): void => {
  if (filePath === ":memory:") {
    return;
  }
  mkdirSync(dirname(filePath), { recursive: true });
};

const currentMigrationVersion = (db: Database.Database): number => {
  const row = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
    .get() as { version: number } | undefined;
  return row?.version ?? 0;
};

export const runMigrations = (db: Database.Database): void => {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL)"
  );

  const applied = currentMigrationVersion(db);
  for (let index = applied; index < MIGRATIONS.length; index += 1) {
    const sql = MIGRATIONS[index];
    if (sql === undefined) {
      throw new Error(`Missing migration at index ${index}`);
    }
    const migrate = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(
        index + 1
      );
    });
    migrate();
  }
};

export const openDatabase = (
  options: OpenDatabaseOptions = {}
): PersistenceDatabase => {
  const path = options.path ?? DEFAULT_DB_PATH;
  ensureParentDirectory(path);
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("journal_mode = WAL");
  runMigrations(db);

  return {
    path,
    profile: createProfileRepository(db),
    runIndex: createRunIndexRepository(db),
    memoryEvents: createMemoryEventsRepository(db),
    close: () => {
      db.close();
    },
  };
};
