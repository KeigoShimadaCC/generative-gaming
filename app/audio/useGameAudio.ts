"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { GameState } from "@engine/state";
import { useGameStore } from "@/store/game-store";

import { createAmbientLayer, type AmbientLayer } from "./ambient";
import { deriveGameAudioEvents } from "./events";
import {
  createBrowserAudioContext,
  createMasterGain,
  playSfx,
} from "./engine";
import {
  loadAudioPreferences,
  saveAudioPreferences,
  type AudioPreferences,
} from "./preferences";
import type { DepthBand } from "./types";

const SFX_LEVEL = 0.85;
const AMBIENT_LEVEL = 0.22;

export type GameAudioController = {
  readonly unlocked: boolean;
  readonly preferences: AudioPreferences;
  readonly setMuted: (muted: boolean) => void;
  readonly setVolume: (volume: number) => void;
  readonly toggleMuted: () => void;
};

const browserStorage = (): Storage | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
};

export const useGameAudio = (): GameAudioController => {
  const gameState = useGameStore((state) => state.gameState);
  const screen = useGameStore((state) => state.screen);
  const previousStateRef = useRef<GameState | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const ambientRef = useRef<AmbientLayer | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [preferences, setPreferences] = useState<AudioPreferences>(() =>
    loadAudioPreferences(null),
  );

  useEffect(() => {
    setPreferences(loadAudioPreferences(browserStorage()));
  }, []);

  const applyMasterLevels = useCallback((next: AudioPreferences) => {
    const master = masterGainRef.current;
    if (master === null) {
      return;
    }

    const t = master.context.currentTime;
    const level = next.muted ? 0 : next.volume;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(level, t + 0.04);
    ambientRef.current?.setLevel(next.muted ? 0 : AMBIENT_LEVEL * level);
  }, []);

  const ensureAudioGraph = useCallback(async (): Promise<boolean> => {
    if (contextRef.current !== null && contextRef.current.state !== "closed") {
      if (contextRef.current.state === "suspended") {
        await contextRef.current.resume();
      }
      if (!unlocked) {
        setUnlocked(true);
      }
      return true;
    }

    const context = createBrowserAudioContext();
    if (context === null) {
      return false;
    }

    if (context.state === "suspended") {
      await context.resume();
    }

    masterGainRef.current = createMasterGain(context);
    contextRef.current = context;
    applyMasterLevels(preferences);
    setUnlocked(true);
    return true;
  }, [applyMasterLevels, preferences, unlocked]);

  const setMuted = useCallback(
    (muted: boolean) => {
      setPreferences((current) => {
        const next = { ...current, muted };
        saveAudioPreferences(browserStorage(), next);
        applyMasterLevels(next);
        return next;
      });
    },
    [applyMasterLevels],
  );

  const setVolume = useCallback(
    (volume: number) => {
      const clamped = Math.min(1, Math.max(0, volume));
      setPreferences((current) => {
        const next = { ...current, volume: clamped };
        saveAudioPreferences(browserStorage(), next);
        applyMasterLevels(next);
        return next;
      });
    },
    [applyMasterLevels],
  );

  const toggleMuted = useCallback(() => {
    setPreferences((current) => {
      const next = { ...current, muted: !current.muted };
      saveAudioPreferences(browserStorage(), next);
      applyMasterLevels(next);
      return next;
    });
  }, [applyMasterLevels]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const unlock = (): void => {
      void ensureAudioGraph();
    };

    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [ensureAudioGraph]);

  useEffect(() => {
    if (!unlocked || contextRef.current === null || masterGainRef.current === null) {
      return;
    }

    const playing = screen === "playing" && gameState !== null;
    const band: DepthBand = gameState?.run.band ?? "shallows";

    if (!playing) {
      ambientRef.current?.stop();
      ambientRef.current = null;
      return;
    }

    if (ambientRef.current === null) {
      ambientRef.current = createAmbientLayer(
        contextRef.current,
        masterGainRef.current,
        band,
      );
      applyMasterLevels(preferences);
      return;
    }

    ambientRef.current.setBand(band);
  }, [applyMasterLevels, gameState, preferences.muted, preferences.volume, screen, unlocked]);

  useEffect(() => {
    if (gameState === null) {
      previousStateRef.current = null;
      return;
    }

    const previous = previousStateRef.current;
    const events = deriveGameAudioEvents(previous, gameState);
    previousStateRef.current = gameState;

    if (
      events.length === 0 ||
      !unlocked ||
      masterGainRef.current === null ||
      preferences.muted
    ) {
      return;
    }

    const master = masterGainRef.current;
    const sfxGain = master.context.createGain();
    sfxGain.gain.value = SFX_LEVEL;
    sfxGain.connect(master);

    for (const event of events) {
      playSfx(master.context, sfxGain, event.kind);
    }

    let disconnected = false;
    const disconnectSfxGain = (): void => {
      if (disconnected) {
        return;
      }

      disconnected = true;
      sfxGain.disconnect();
    };
    const disconnectTimer = window.setTimeout(disconnectSfxGain, 1_000);

    return () => {
      window.clearTimeout(disconnectTimer);
      disconnectSfxGain();
    };
  }, [gameState, preferences.muted, unlocked]);

  useEffect(
    () => () => {
      ambientRef.current?.stop();
      ambientRef.current = null;
      void contextRef.current?.close();
      contextRef.current = null;
      masterGainRef.current = null;
    },
    [],
  );

  return {
    unlocked,
    preferences,
    setMuted,
    setVolume,
    toggleMuted,
  };
};
