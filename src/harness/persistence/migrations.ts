export const MIGRATIONS: readonly string[] = [
  `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS run_index (
  run_id TEXT PRIMARY KEY NOT NULL,
  protocol_version TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  model_id TEXT NOT NULL,
  content_provider_id TEXT NOT NULL,
  content_pack_version TEXT NOT NULL,
  seed TEXT NOT NULL,
  created_at TEXT NOT NULL,
  outcome TEXT NOT NULL,
  depth INTEGER NOT NULL,
  turns INTEGER NOT NULL,
  summary_json TEXT NOT NULL,
  trace_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_events (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  run_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('death', 'deed', 'refusal', 'completion', 'discovery')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  salience INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_events_profile_created
  ON memory_events (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_events_profile_salience
  ON memory_events (profile_id, salience DESC, created_at DESC);
`,
] as const;
