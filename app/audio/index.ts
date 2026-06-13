export { createAmbientLayer, type AmbientLayer } from "./ambient";
export { deriveGameAudioEvents } from "./events";
export {
  createBrowserAudioContext,
  createMasterGain,
  isBrowserAudioAvailable,
  playSfx,
  type AudioContextLike,
} from "./engine";
export {
  AUDIO_STORAGE_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  loadAudioPreferences,
  saveAudioPreferences,
  type AudioPreferences,
} from "./preferences";
export type { DepthBand, GameAudioEvent, GameSfxKind } from "./types";
export { useGameAudio, type GameAudioController } from "./useGameAudio";
