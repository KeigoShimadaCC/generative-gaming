import type Database from "better-sqlite3";

import {
  LOCAL_PROFILE_ID,
  type ProfileInsert,
  type ProfileRow,
  type ProfileSettings,
} from "./types.js";

export type ProfileRepository = {
  readonly get: (id?: string) => ProfileRow | undefined;
  readonly upsert: (profile: ProfileInsert) => ProfileRow;
  readonly updateSettings: (
    settings: ProfileSettings,
    id?: string
  ) => ProfileRow;
};

type ProfileRecord = {
  readonly id: string;
  readonly created_at: string;
  readonly settings_json: string;
};

const parseSettings = (settingsJson: string): ProfileSettings => {
  return JSON.parse(settingsJson) as ProfileSettings;
};

const toRow = (record: ProfileRecord): ProfileRow => ({
  id: record.id,
  createdAt: record.created_at,
  settings: parseSettings(record.settings_json),
});

export const createProfileRepository = (
  db: Database.Database
): ProfileRepository => {
  const selectById = db.prepare(
    "SELECT id, created_at, settings_json FROM profiles WHERE id = ?"
  );
  const insertProfile = db.prepare(
    "INSERT INTO profiles (id, created_at, settings_json) VALUES (?, ?, ?)"
  );
  const updateProfile = db.prepare(
    "UPDATE profiles SET settings_json = ? WHERE id = ?"
  );

  const get = (id: string = LOCAL_PROFILE_ID): ProfileRow | undefined => {
    const record = selectById.get(id) as ProfileRecord | undefined;
    return record === undefined ? undefined : toRow(record);
  };

  const upsert = (profile: ProfileInsert): ProfileRow => {
    const id = profile.id ?? LOCAL_PROFILE_ID;
    const settings = profile.settings ?? {};
    const existing = get(id);
    if (existing === undefined) {
      insertProfile.run(id, profile.createdAt, JSON.stringify(settings));
      return {
        id,
        createdAt: profile.createdAt,
        settings,
      };
    }
    updateProfile.run(JSON.stringify(settings), id);
    return {
      id,
      createdAt: existing.createdAt,
      settings,
    };
  };

  const updateSettings = (
    settings: ProfileSettings,
    id: string = LOCAL_PROFILE_ID
  ): ProfileRow => {
    const existing = get(id);
    if (existing === undefined) {
      throw new Error(`Profile not found: ${id}`);
    }
    updateProfile.run(JSON.stringify(settings), id);
    return {
      ...existing,
      settings,
    };
  };

  return { get, upsert, updateSettings };
};
