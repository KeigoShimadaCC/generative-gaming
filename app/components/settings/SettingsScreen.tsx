"use client";

import { keymapOverlayRows } from "@/input/keys";

import styles from "./SettingsScreen.module.css";
import {
  keybindingViewRows,
  type ColorThemeSetting,
  type GlyphSizeSetting,
  type MessageSpeedSetting,
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
  const patch = (partial: Partial<SettingsState>): void =>
    onChange({ ...settings, ...partial });

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
}: {
  readonly value: Value;
  readonly options: readonly (readonly [Value, string])[];
  readonly onChange: (value: Value) => void;
}) {
  return (
    <div className={styles.segmented}>
      {options.map(([optionValue, label]) => (
        <button
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
