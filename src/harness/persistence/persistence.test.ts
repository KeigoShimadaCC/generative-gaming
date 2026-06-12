import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ENGINE_VERSION, PROTOCOL_VERSION } from "../../schemas/protocol.js";
import type { TraceHeader } from "../trace/recorder.js";
import {
  DEFAULT_DB_PATH,
  openDatabase,
  type PersistenceDatabase,
} from "./connection.js";
import { LOCAL_PROFILE_ID } from "./types.js";

const CREATED_AT = "2026-06-12T00:00:00.000Z";
const CREATED_AT_LATER = "2026-06-12T01:00:00.000Z";
const CREATED_AT_EARLIER = "2026-06-11T23:00:00.000Z";

const sampleHeader = (runId: string): TraceHeader => ({
  recordType: "header",
  protocolVersion: PROTOCOL_VERSION,
  engineVersion: ENGINE_VERSION,
  modelId: "none",
  contentRef: {
    providerId: "fallback:old-stock",
    packVersion: "0.0.0",
  },
  seed: "persist-seed",
  createdAt: CREATED_AT,
  runId,
});

const seedProfile = (db: PersistenceDatabase): void => {
  db.profile.upsert({
    createdAt: CREATED_AT,
    settings: { hintsEnabled: true },
  });
};

let defaultDbExistedBeforeSuite = false;
let defaultDbMtimeBeforeSuite: number | undefined;

beforeAll(() => {
  defaultDbExistedBeforeSuite = existsSync(DEFAULT_DB_PATH);
  if (defaultDbExistedBeforeSuite) {
    defaultDbMtimeBeforeSuite = statSync(DEFAULT_DB_PATH).mtimeMs;
  }
});

afterAll(() => {
  if (!defaultDbExistedBeforeSuite) {
    expect(existsSync(DEFAULT_DB_PATH)).toBe(false);
    return;
  }
  expect(statSync(DEFAULT_DB_PATH).mtimeMs).toBe(defaultDbMtimeBeforeSuite);
});

describe("persistence connection", () => {
  it("applies migrations idempotently when opened twice", () => {
    const dir = mkdtempSync(join(tmpdir(), "everdeep-migrate-"));
    const dbPath = join(dir, "everdeep.sqlite");

    try {
      const first = openDatabase({ path: dbPath });
      first.close();

      const second = openDatabase({ path: dbPath });
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("round-trips data across simulated restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "everdeep-restart-"));
    const dbPath = join(dir, "everdeep.sqlite");
    const runId = "run-restart-001";
    const eventId = "event-restart-001";

    try {
      const writer = openDatabase({ path: dbPath });
      seedProfile(writer);
      writer.runIndex.insert({
        runId,
        header: sampleHeader(runId),
        outcome: "defeat",
        depth: 3,
        turns: 42,
        summary: { cause: "starvation" },
        tracePath: `runs/${runId}.ndjson`,
      });
      writer.memoryEvents.insert({
        id: eventId,
        profileId: LOCAL_PROFILE_ID,
        runId,
        type: "death",
        payload: { floor: 3, cause: "starvation" },
        createdAt: CREATED_AT,
        salience: 100,
      });
      writer.close();

      const reader = openDatabase({ path: dbPath });
      const profile = reader.profile.get();
      const run = reader.runIndex.get(runId);
      const event = reader.memoryEvents.get(eventId);

      expect(profile).toEqual({
        id: LOCAL_PROFILE_ID,
        createdAt: CREATED_AT,
        settings: { hintsEnabled: true },
      });
      expect(run).toMatchObject({
        runId,
        protocolVersion: PROTOCOL_VERSION,
        engineVersion: ENGINE_VERSION,
        modelId: "none",
        contentRef: {
          providerId: "fallback:old-stock",
          packVersion: "0.0.0",
        },
        seed: "persist-seed",
        createdAt: CREATED_AT,
        outcome: "defeat",
        depth: 3,
        turns: 42,
        summary: { cause: "starvation" },
        tracePath: `runs/${runId}.ndjson`,
      });
      expect(event).toEqual({
        id: eventId,
        profileId: LOCAL_PROFILE_ID,
        runId,
        type: "death",
        payload: { floor: 3, cause: "starvation" },
        createdAt: CREATED_AT,
        salience: 100,
      });
      reader.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("memory event queries", () => {
  const openIsolated = (): PersistenceDatabase => {
    const db = openDatabase({ path: ":memory:" });
    seedProfile(db);
    return db;
  };

  it("returns recent events by createdAt descending", () => {
    const db = openIsolated();
    const runId = "run-recent";

    db.memoryEvents.insert({
      id: "evt-old",
      profileId: LOCAL_PROFILE_ID,
      runId,
      type: "deed",
      payload: { label: "opened chest" },
      createdAt: CREATED_AT_EARLIER,
      salience: 10,
    });
    db.memoryEvents.insert({
      id: "evt-new",
      profileId: LOCAL_PROFILE_ID,
      runId,
      type: "discovery",
      payload: { label: "found shrine" },
      createdAt: CREATED_AT_LATER,
      salience: 20,
    });
    db.memoryEvents.insert({
      id: "evt-mid",
      profileId: LOCAL_PROFILE_ID,
      runId,
      type: "refusal",
      payload: { label: "declined quest" },
      createdAt: CREATED_AT,
      salience: 50,
    });

    const recent = db.memoryEvents.recentEvents(LOCAL_PROFILE_ID, 2);
    expect(recent.map((event) => event.id)).toEqual(["evt-new", "evt-mid"]);
    db.close();
  });

  it("returns events ordered by salience then recency", () => {
    const db = openIsolated();
    const runId = "run-salience";

    db.memoryEvents.insert({
      id: "evt-low",
      profileId: LOCAL_PROFILE_ID,
      runId,
      type: "deed",
      payload: { label: "minor deed" },
      createdAt: CREATED_AT_LATER,
      salience: 5,
    });
    db.memoryEvents.insert({
      id: "evt-high-old",
      profileId: LOCAL_PROFILE_ID,
      runId,
      type: "death",
      payload: { label: "first death" },
      createdAt: CREATED_AT_EARLIER,
      salience: 100,
    });
    db.memoryEvents.insert({
      id: "evt-high-new",
      profileId: LOCAL_PROFILE_ID,
      runId,
      type: "death",
      payload: { label: "second death" },
      createdAt: CREATED_AT_LATER,
      salience: 100,
    });

    const bySalience = db.memoryEvents.eventsBySalience(
      LOCAL_PROFILE_ID,
      undefined,
      3
    );
    expect(bySalience.map((event) => event.id)).toEqual([
      "evt-high-new",
      "evt-high-old",
      "evt-low",
    ]);
    db.close();
  });

  it("filters eventsBySalience by type when provided", () => {
    const db = openIsolated();
    const runId = "run-filter";

    db.memoryEvents.insert({
      id: "evt-death",
      profileId: LOCAL_PROFILE_ID,
      runId,
      type: "death",
      payload: { label: "death" },
      createdAt: CREATED_AT,
      salience: 100,
    });
    db.memoryEvents.insert({
      id: "evt-deed",
      profileId: LOCAL_PROFILE_ID,
      runId,
      type: "deed",
      payload: { label: "deed" },
      createdAt: CREATED_AT_LATER,
      salience: 90,
    });

    const filtered = db.memoryEvents.eventsBySalience(
      LOCAL_PROFILE_ID,
      ["death", "completion"],
      5
    );
    expect(filtered.map((event) => event.type)).toEqual(["death"]);
    db.close();
  });
});
