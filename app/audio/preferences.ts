export const AUDIO_STORAGE_KEY = "everdeep.audio.v1";

export type AudioPreferences = {
  readonly muted: boolean;
  readonly volume: number;
};

export type AudioStorage = Pick<Storage, "getItem" | "setItem">;

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  muted: false,
  volume: 0.72,
};

export const loadAudioPreferences = (
  storage: AudioStorage | null,
): AudioPreferences => {
  if (storage === null) {
    return DEFAULT_AUDIO_PREFERENCES;
  }

  const raw = storage.getItem(AUDIO_STORAGE_KEY);
  if (raw === null) {
    return DEFAULT_AUDIO_PREFERENCES;
  }

  try {
    return normalizeAudioPreferences(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_AUDIO_PREFERENCES;
  }
};

export const saveAudioPreferences = (
  storage: AudioStorage | null,
  preferences: AudioPreferences,
): void => {
  storage?.setItem(AUDIO_STORAGE_KEY, JSON.stringify(preferences));
};

export const normalizeAudioPreferences = (
  value: unknown,
): AudioPreferences => {
  if (!isRecord(value)) {
    return DEFAULT_AUDIO_PREFERENCES;
  }

  const volume =
    typeof value.volume === "number" &&
    Number.isFinite(value.volume) &&
    value.volume >= 0 &&
    value.volume <= 1
      ? value.volume
      : DEFAULT_AUDIO_PREFERENCES.volume;

  return {
    muted:
      typeof value.muted === "boolean"
        ? value.muted
        : DEFAULT_AUDIO_PREFERENCES.muted,
    volume,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
