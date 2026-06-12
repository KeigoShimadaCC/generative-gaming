import type { GameState } from "@engine/state";

export type HudPulseTarget =
  | "depth"
  | "turn"
  | "hp"
  | "fullness"
  | "levelXp"
  | "statuses"
  | "quests";

export type StatusChipShape =
  | "circle"
  | "diamond"
  | "square"
  | "dot"
  | "triangle"
  | "bar"
  | "cross";

export type HudRenderCursor = {
  readonly runId: string;
  readonly floorId: string;
  readonly logLength: number;
};

export type HudMeterView = {
  readonly current: number;
  readonly max: number;
  readonly percent: number;
  readonly pulse: boolean;
};

export type HudLevelXpView = {
  readonly level: number;
  readonly xp: number;
  readonly pulse: boolean;
};

export type HudStatusChipView = {
  readonly status: string;
  readonly label: string;
  readonly duration: number;
  readonly shape: StatusChipShape;
};

export type HudViewModel = {
  readonly depth: {
    readonly value: number;
    readonly pulse: boolean;
  };
  readonly turn: {
    readonly value: number;
    readonly pulse: boolean;
  };
  readonly hp: HudMeterView;
  readonly fullness: HudMeterView;
  readonly levelXp: HudLevelXpView;
  readonly statuses: readonly HudStatusChipView[];
  readonly statusesPulse: boolean;
  readonly quests: {
    readonly active: number;
    readonly completed: number;
    readonly pulse: boolean;
  };
  readonly cursor: HudRenderCursor;
};

type RuntimeLogEvent = {
  readonly type?: unknown;
  readonly data?: unknown;
};

type RuntimeRecord = {
  readonly [key: string]: unknown;
};

const STATUS_SHAPES: Readonly<Record<string, StatusChipShape>> = {
  poison: "diamond",
  burn: "triangle",
  regen: "circle",
  stun: "bar",
  confusion: "cross",
  slow: "square",
  haste: "dot",
  blind: "cross",
  shield: "square",
  weaken: "triangle",
};

export const createHudViewModel = (
  state: GameState,
  previousCursor?: HudRenderCursor,
): HudViewModel => {
  const pulses = hudPulsesSinceLastRender(state, previousCursor);

  return {
    depth: {
      value: state.run.depth,
      pulse: pulses.has("depth"),
    },
    turn: {
      value: state.run.turn,
      pulse: pulses.has("turn"),
    },
    hp: {
      current: state.player.hp.current,
      max: state.player.hp.max,
      percent: percent(state.player.hp.current, state.player.hp.max),
      pulse: pulses.has("hp"),
    },
    fullness: {
      current: state.player.fullness.current,
      max: state.player.fullness.max,
      percent: percent(
        state.player.fullness.current,
        state.player.fullness.max,
      ),
      pulse: pulses.has("fullness"),
    },
    levelXp: {
      level: state.player.level,
      xp: state.player.xp,
      pulse: pulses.has("levelXp"),
    },
    statuses: state.player.statuses.map((application) => ({
      status: application.status,
      label: labelForStatus(application.status),
      duration: application.duration,
      shape: shapeForStatus(application.status),
    })),
    statusesPulse: pulses.has("statuses"),
    quests: {
      active: state.quests.activeQuestIds.length,
      completed: state.quests.completedQuestIds.length,
      pulse: pulses.has("quests"),
    },
    cursor: cursorForState(state),
  };
};

const cursorForState = (state: GameState): HudRenderCursor => ({
  runId: state.run.runId,
  floorId: state.floor.floorId,
  logLength: state.log.length,
});

const hudPulsesSinceLastRender = (
  state: GameState,
  previousCursor?: HudRenderCursor,
): ReadonlySet<HudPulseTarget> => {
  const cursor = cursorForState(state);
  const canDiff =
    previousCursor !== undefined &&
    previousCursor.runId === cursor.runId &&
    previousCursor.floorId === cursor.floorId &&
    previousCursor.logLength <= cursor.logLength;

  if (!canDiff) {
    return new Set();
  }

  const pulses = new Set<HudPulseTarget>();
  const events = (state.log as readonly RuntimeLogEvent[]).slice(
    previousCursor.logLength,
  );

  for (const event of events) {
    if (typeof event.type === "string" && event.type.startsWith("quest_")) {
      pulses.add("quests");
    }

    const hud = asRecord(asRecord(event.data)?.hud);

    if (hud?.pulse !== true) {
      continue;
    }

    const fields = arrayValue(hud.fields);

    for (const field of fields) {
      if (typeof field !== "string") {
        continue;
      }

      for (const target of pulseTargetsForField(field)) {
        pulses.add(target);
      }
    }
  }

  return pulses;
};

const pulseTargetsForField = (
  field: string,
): readonly HudPulseTarget[] => {
  switch (field) {
    case "depth":
      return ["depth"];
    case "turn":
      return ["turn"];
    case "hp":
    case "maxHp":
      return ["hp"];
    case "fullness":
      return ["fullness"];
    case "level":
    case "xp":
    case "attack":
    case "defense":
      return ["levelXp"];
    case "status":
    case "statuses":
      return ["statuses"];
    case "quest":
    case "quests":
      return ["quests"];
    default:
      return [];
  }
};

const labelForStatus = (status: string): string =>
  status
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const shapeForStatus = (status: string): StatusChipShape =>
  STATUS_SHAPES[status] ?? "square";

const percent = (current: number, max: number): number => {
  if (max <= 0) {
    return 0;
  }

  return clamp((current / max) * 100, 0, 100);
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const asRecord = (value: unknown): RuntimeRecord | null =>
  value !== null && typeof value === "object"
    ? (value as RuntimeRecord)
    : null;

const arrayValue = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];
