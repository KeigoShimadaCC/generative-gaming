"use client";

import { useEffect, useState } from "react";

import { keymapOverlayRows } from "@/input/keys";

import {
  clampAudioVolume,
  loadSettingsAudio,
  saveSettingsAudio,
  type AudioPreferences,
} from "./audio-settings";
import styles from "./SettingsScreen.module.css";
import {
  keybindingViewRows,
  type ColorThemeSetting,
  type GlyphSizeSetting,
  type MessageSpeedSetting,
  type MotionSetting,
  type RenderSurfaceSetting,
  type SettingsState,
} from "./model";

type SettingsScreenProps = {
  readonly settings: SettingsState;
  readonly onChange: (settings: SettingsState) => void;
  readonly onBack: () => void;
};

export function SettingsScreen({
  settings,
  onChange,
  onBack,
}: SettingsScreenProps) {
  const [audio, setAudio] = useState<AudioPreferences>(() =>
    loadSettingsAudio(null),
  );

  useEffect(() => {
    setAudio(loadSettingsAudio(browserStorage()));
  }, []);

  const patch = (partial: Partial<SettingsState>): void =>
    onChange({ ...settings, ...partial });

  const patchAudio = (partial: Partial<AudioPreferences>): void => {
    const next: AudioPreferences = {
      ...audio,
      ...partial,
      ...(partial.volume === undefined
        ? {}
        : { volume: clampAudioVolume(partial.volume) }),
    };
    saveSettingsAudio(browserStorage(), next);
    setAudio(next);
  };

  return (
    <section className={styles.screen} aria-label="Settings">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>The Last Lantern</div>
          <h1 className={styles.title}>Settings</h1>
        </div>
        <button className={styles.backButton} type="button" onClick={onBack}>
          Back
        </button>
      </div>

      <div className={styles.grid}>
        <fieldset className={styles.group}>
          <legend>Glyph size</legend>
          <SegmentedControl<GlyphSizeSetting>
            value={settings.glyphSize}
            options={[
              ["small", "Small"],
              ["medium", "Medium"],
              ["large", "Large"],
            ]}
            onChange={(glyphSize) => patch({ glyphSize })}
          />
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Color theme</legend>
          <SegmentedControl<ColorThemeSetting>
            value={settings.colorTheme}
            options={[
              ["lantern", "Lantern"],
              ["slate", "Slate"],
              ["ember", "Ember"],
            ]}
            onChange={(colorTheme) => patch({ colorTheme })}
          />
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Message speed</legend>
          <SegmentedControl<MessageSpeedSetting>
            value={settings.messageSpeed}
            options={[
              ["slow", "Slow"],
              ["normal", "Normal"],
              ["fast", "Fast"],
            ]}
            onChange={(messageSpeed) => patch({ messageSpeed })}
          />
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Motion</legend>
          <SegmentedControl<MotionSetting>
            ariaLabel="Motion preference"
            value={settings.motion}
            options={[
              ["full", "Full"],
              ["reduced", "Reduced"],
              ["off", "Off"],
            ]}
            onChange={(motion) => patch({ motion })}
          />
        </fieldset>

        <fieldset className={styles.group}>
          <legend>Render surface</legend>
          <SegmentedControl<RenderSurfaceSetting>
            ariaLabel="Render surface"
            columns={2}
            value={settings.renderSurface}
            options={[
              ["dom", "DOM glyphs"],
              ["pixi", "Canvas"],
            ]}
            onChange={(renderSurface) => patch({ renderSurface })}
          />
        </fieldset>

        <ToggleRow
          checked={settings.aiArtEnabled}
          label="AI-generated art"
          onChange={(aiArtEnabled) => patch({ aiArtEnabled })}
        />

        <fieldset className={styles.group}>
          <legend>Audio</legend>
          <ToggleRow
            checked={!audio.muted}
            label="Sound"
            onChange={(enabled) => patchAudio({ muted: !enabled })}
          />
          <label className={styles.volumeRow}>
            <span id="settings-audio-volume-label">Volume</span>
            <input
              aria-labelledby="settings-audio-volume-label"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(audio.volume * 100)}
              className={styles.volumeSlider}
              disabled={audio.muted}
              max={100}
              min={0}
              step={1}
              type="range"
              value={Math.round(audio.volume * 100)}
              onChange={(event) =>
                patchAudio({
                  volume: Number.parseInt(event.currentTarget.value, 10) / 100,
                })
              }
            />
          </label>
        </fieldset>

        <ToggleRow
          checked={settings.autoTravel}
          label="Auto-travel"
          onChange={(autoTravel) => patch({ autoTravel })}
        />
        <ToggleRow
          checked={settings.autoTravelStopOnThreat}
          label="Auto-travel stops"
          onChange={(autoTravelStopOnThreat) => patch({ autoTravelStopOnThreat })}
        />
        <ToggleRow
          checked={settings.hintKill}
          label="Hint-kill"
          onChange={(hintKill) => patch({ hintKill })}
        />

        <section className={styles.keymap} aria-label="Keybinding view">
          <h2>Keybindings</h2>
          <div className={styles.keyRows}>
            {keybindingViewRows(keymapOverlayRows()).map((row) => (
              <div className={styles.keyRow} key={row.id}>
                <span>{row.action}</span>
                <kbd>{row.keys}</kbd>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function SegmentedControl<Value extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  columns = 3,
}: {
  readonly value: Value;
  readonly options: readonly (readonly [Value, string])[];
  readonly onChange: (value: Value) => void;
  readonly ariaLabel?: string;
  readonly columns?: 2 | 3;
}) {
  return (
    <div
      className={
        columns === 2 ? styles.segmentedTwo : styles.segmented
      }
      role="group"
      {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
    >
      {options.map(([optionValue, label]) => (
        <button
          aria-pressed={optionValue === value}
          className={optionValue === value ? styles.selected : ""}
          data-selected={optionValue === value ? "true" : "false"}
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  checked,
  label,
  onChange,
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.toggleRow}>
      <span>{label}</span>
      <input
        checked={checked}
        type="checkbox"
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

const browserStorage = (): Storage | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
};
