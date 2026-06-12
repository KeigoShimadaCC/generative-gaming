import { describe, expect, it } from "vitest";

import { keymapOverlayRows } from "@/input/keys";

import {
  DEFAULT_SETTINGS,
  GLYPH_SIZE_REM,
  MESSAGE_WINDOW_SIZE,
  SETTINGS_STORAGE_KEY,
  deathToNewRunStepCount,
  keybindingViewRows,
  loadSettings,
  saveSettings,
  settingsStepLabels,
  themeVariables,
  type SettingsStorage,
} from "./model";

describe("settings screen model", () => {
  it("persists local settings and normalizes unknown stored values", () => {
    const storage = new MemoryStorage();
    const settings = {
      ...DEFAULT_SETTINGS,
      glyphSize: "large" as const,
      colorTheme: "ember" as const,
      messageSpeed: "fast" as const,
      autoTravel: false,
      hintKill: false,
    };

    saveSettings(storage, settings);
    expect(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? "{}")).toMatchObject(
      settings,
    );
    expect(loadSettings(storage)).toEqual(settings);

    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ glyphSize: "huge", autoTravel: false }),
    );
    expect(loadSettings(storage)).toEqual({
      ...DEFAULT_SETTINGS,
      autoTravel: false,
    });
  });

  it("maps one-screen settings to live presentation values", () => {
    expect(settingsStepLabels()).toEqual([
      "Glyph size",
      "Color theme",
      "Message speed",
      "Auto-travel",
      "Auto-travel stops",
      "Hint-kill",
      "Keybindings",
    ]);
    expect(GLYPH_SIZE_REM.large).toBeGreaterThan(GLYPH_SIZE_REM.small);
    expect(MESSAGE_WINDOW_SIZE.fast).toBeGreaterThan(MESSAGE_WINDOW_SIZE.slow);
    expect(themeVariables("lantern")["--gg-accent"]).not.toBe(
      themeVariables("ember")["--gg-accent"],
    );
  });

  it("renders keybinding view rows from the shared keymap table without rebinding controls", () => {
    const rows = keybindingViewRows(keymapOverlayRows());

    expect(rows.length).toBeGreaterThan(10);
    expect(rows.map((row) => row.action)).toContain("Move north");
    expect(rows.map((row) => row.keys)).toContain(">");
  });

  it("keeps death-to-new-run within the UX step-count budget", () => {
    expect(deathToNewRunStepCount()).toBeLessThanOrEqual(2);
  });
});

class MemoryStorage implements SettingsStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
