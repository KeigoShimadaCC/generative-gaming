import {
  AUDIO_STORAGE_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  loadAudioPreferences,
  saveAudioPreferences,
  type AudioPreferences,
  type AudioStorage,
} from "@/audio/preferences";

export {
  AUDIO_STORAGE_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  type AudioPreferences,
  type AudioStorage,
};

export const loadSettingsAudio = (
  storage: AudioStorage | null,
): AudioPreferences => loadAudioPreferences(storage);

export const saveSettingsAudio = (
  storage: AudioStorage | null,
  preferences: AudioPreferences,
): void => {
  saveAudioPreferences(storage, preferences);
};

export const clampAudioVolume = (volume: number): number =>
  Math.min(1, Math.max(0, volume));
