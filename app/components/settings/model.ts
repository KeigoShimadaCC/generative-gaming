import type { KeymapOverlayRow } from "@/input/keys";

export const SETTINGS_STORAGE_KEY = "everdeep.settings.v1";

export type GlyphSizeSetting = "small" | "medium" | "large";
export type ColorThemeSetting = "lantern" | "slate" | "ember";
export type MessageSpeedSetting = "slow" | "normal" | "fast";

export type SettingsState = {
  readonly glyphSize: GlyphSizeSetting;
  readonly colorTheme: ColorThemeSetting;
  readonly messageSpeed: MessageSpeedSetting;
  readonly autoTravel: boolean;
  readonly autoTravelStopOnThreat: boolean;
  readonly hintKill: boolean;
};

export type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

export const DEFAULT_SETTINGS: SettingsState = {
  glyphSize: "medium",
  colorTheme: "lantern",
  messageSpeed: "normal",
  autoTravel: true,
  autoTravelStopOnThreat: true,
  hintKill: true,
};

export const GLYPH_SIZE_REM: Record<GlyphSizeSetting, number> = {
  small: 0.82,
  medium: 0.98,
  large: 1.16,
};

export const MESSAGE_WINDOW_SIZE: Record<MessageSpeedSetting, number> = {
  slow: 4,
  normal: 6,
  fast: 8,
};

export const themeVariables = (
  theme: ColorThemeSetting,
): Readonly<Record<string, string>> => {
  switch (theme) {
    case "lantern":
      return {
        "--gg-bg": "#090b0f",
        "--gg-surface": "#12151a",
        "--gg-surface-raised": "#181c23",
        "--gg-border": "#2a3140",
        "--gg-text": "#e8eaed",
        "--gg-muted": "#8b939e",
        "--gg-accent": "#76c7b7",
      };
    case "slate":
      return {
        "--gg-bg": "#0d0f12",
        "--gg-surface": "#15181d",
        "--gg-surface-raised": "#1e2229",
        "--gg-border": "#343a44",
        "--gg-text": "#f0f2f5",
        "--gg-muted": "#9ca4af",
        "--gg-accent": "#d4bd6a",
      };
    case "ember":
      return {
        "--gg-bg": "#100d0b",
        "--gg-surface": "#1a1512",
        "--gg-surface-raised": "#231c17",
        "--gg-border": "#3a3029",
        "--gg-text": "#f1ece7",
        "--gg-muted": "#aa9e93",
        "--gg-accent": "#d68862",
      };
  }
};

export const loadSettings = (
  storage: SettingsStorage | null,
): SettingsState => {
  if (storage === null) {
    return DEFAULT_SETTINGS;
  }

  const raw = storage.getItem(SETTINGS_STORAGE_KEY);
  if (raw === null) {
    return DEFAULT_SETTINGS;
  }

  try {
    return normalizeSettings(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (
  storage: SettingsStorage | null,
  settings: SettingsState,
): void => {
  storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

export const normalizeSettings = (value: unknown): SettingsState => {
  if (!isRecord(value)) {
    return DEFAULT_SETTINGS;
  }

  return {
    glyphSize: isGlyphSize(value.glyphSize)
      ? value.glyphSize
      : DEFAULT_SETTINGS.glyphSize,
    colorTheme: isColorTheme(value.colorTheme)
      ? value.colorTheme
      : DEFAULT_SETTINGS.colorTheme,
    messageSpeed: isMessageSpeed(value.messageSpeed)
      ? value.messageSpeed
      : DEFAULT_SETTINGS.messageSpeed,
    autoTravel:
      typeof value.autoTravel === "boolean"
        ? value.autoTravel
        : DEFAULT_SETTINGS.autoTravel,
    autoTravelStopOnThreat:
      typeof value.autoTravelStopOnThreat === "boolean"
        ? value.autoTravelStopOnThreat
        : DEFAULT_SETTINGS.autoTravelStopOnThreat,
    hintKill:
      typeof value.hintKill === "boolean"
        ? value.hintKill
        : DEFAULT_SETTINGS.hintKill,
  };
};

export const settingsStepLabels = (): readonly string[] => [
  "Glyph size",
  "Color theme",
  "Message speed",
  "Auto-travel",
  "Auto-travel stops",
  "Hint-kill",
  "Keybindings",
];

export const deathToNewRunStepCount = (): number => 2;

export const keybindingViewRows = (
  rows: readonly KeymapOverlayRow[],
): readonly KeymapOverlayRow[] =>
  rows.filter((row) => row.group !== "Universal" || row.action !== "Close keymap");

const isGlyphSize = (value: unknown): value is GlyphSizeSetting =>
  value === "small" || value === "medium" || value === "large";

const isColorTheme = (value: unknown): value is ColorThemeSetting =>
  value === "lantern" || value === "slate" || value === "ember";

const isMessageSpeed = (value: unknown): value is MessageSpeedSetting =>
  value === "slow" || value === "normal" || value === "fast";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
