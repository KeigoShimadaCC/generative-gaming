"use client";

import {
  useMemo,
  useRef,
  type CSSProperties,
} from "react";

import type { GameState } from "@engine/state";

import styles from "./Hud.module.css";
import {
  createHudViewModel,
  type HudMeterView,
  type HudStatusChipView,
  type HudViewModel,
  type StatusChipShape,
} from "./model";

type HudRegionProps = {
  readonly state: GameState | null;
  readonly className?: string;
};

type HudFrameProps = {
  readonly model: HudViewModel | null;
};

export function HudRegion({ state, className }: HudRegionProps) {
  const cursorRef = useRef<HudViewModel["cursor"] | undefined>(undefined);
  const model = useMemo(() => {
    if (state === null) {
      cursorRef.current = undefined;
      return null;
    }

    const nextModel = createHudViewModel(state, cursorRef.current);
    cursorRef.current = nextModel.cursor;

    return nextModel;
  }, [state]);

  return (
    <section
      className={[styles.region, className].filter(Boolean).join(" ")}
      aria-label="HUD"
    >
      <HudFrame model={model} />
    </section>
  );
}

export function HudFrame({ model }: HudFrameProps) {
  if (model === null) {
    return <div className={styles.empty}>No run</div>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.topline}>
        <HudStat label="Depth" value={`D${model.depth.value}`} pulse={model.depth.pulse} />
        <HudStat label="Turn" value={String(model.turn.value)} pulse={model.turn.pulse} />
      </div>

      <HudMeter label="HP" meter={model.hp} />
      <HudMeter label="Full" meter={model.fullness} fullness />

      <div
        className={[styles.levelXp, model.levelXp.pulse ? styles.pulse : ""]
          .filter(Boolean)
          .join(" ")}
        data-hud-field="level-xp"
        data-pulse={model.levelXp.pulse ? "true" : "false"}
      >
        <div>
          <span className={styles.label}>Level</span>
          <span className={[styles.value, styles.levelValue].join(" ")}>
            {model.levelXp.level}
          </span>
        </div>
        <div>
          <span className={styles.label}>XP</span>
          <span className={[styles.value, styles.xpValue].join(" ")}>
            {model.levelXp.xp}
          </span>
        </div>
      </div>

      <StatusChips
        quests={model.quests}
        statuses={model.statuses}
        pulse={model.statusesPulse}
      />
    </div>
  );
}

function HudStat({
  label,
  value,
  pulse,
}: {
  readonly label: string;
  readonly value: string;
  readonly pulse: boolean;
}) {
  return (
    <div
      className={[styles.stat, pulse ? styles.pulse : ""]
        .filter(Boolean)
        .join(" ")}
      data-hud-field={label.toLowerCase()}
      data-pulse={pulse ? "true" : "false"}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  );
}

function HudMeter({
  label,
  meter,
  fullness = false,
}: {
  readonly label: string;
  readonly meter: HudMeterView;
  readonly fullness?: boolean;
}) {
  const style = {
    "--gg-hud-fill": `${meter.percent}%`,
  } as CSSProperties;

  return (
    <div
      className={[styles.meter, meter.pulse ? styles.pulse : ""]
        .filter(Boolean)
        .join(" ")}
      data-hud-field={fullness ? "fullness" : "hp"}
      data-pulse={meter.pulse ? "true" : "false"}
    >
      <div className={styles.meterHeader}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>
          {meter.current}/{meter.max}
        </span>
      </div>
      <div
        className={styles.bar}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={meter.max}
        aria-valuenow={meter.current}
      >
        <span
          className={[
            styles.barFill,
            fullness ? styles.fullnessFill : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            width: "var(--gg-hud-fill)",
            ...style,
          }}
        />
      </div>
    </div>
  );
}

function StatusChips({
  quests,
  statuses,
  pulse,
}: {
  readonly quests: HudViewModel["quests"];
  readonly statuses: readonly HudStatusChipView[];
  readonly pulse: boolean;
}) {
  return (
    <div
      className={[styles.statuses, pulse ? styles.pulse : ""]
        .filter(Boolean)
        .join(" ")}
      data-hud-field="statuses"
      data-pulse={pulse ? "true" : "false"}
      aria-label="Statuses"
    >
      <span
        className={[styles.chip, quests.pulse ? styles.pulse : ""]
          .filter(Boolean)
          .join(" ")}
        data-hud-field="quests"
        data-pulse={quests.pulse ? "true" : "false"}
      >
        <span
          className={[
            styles.chipIcon,
            shapeClass("diamond"),
          ].join(" ")}
          aria-hidden="true"
        />
        Quest {quests.active}/{quests.completed}
      </span>
      {statuses.length === 0 ? (
        <span className={[styles.chip, styles.noStatus].join(" ")}>
          <span
            className={[
              styles.chipIcon,
              shapeClass("square"),
            ].join(" ")}
            aria-hidden="true"
          />
          OK
        </span>
      ) : (
        statuses.map((status) => (
          <span
            className={styles.chip}
            data-status={status.status}
            data-status-shape={status.shape}
            key={status.status}
          >
            <span
              className={[
                styles.chipIcon,
                shapeClass(status.shape),
              ].join(" ")}
              aria-hidden="true"
            />
            <span>{status.label}</span>
            <span className={styles.chipDuration}>{status.duration}t</span>
          </span>
        ))
      )}
    </div>
  );
}

const shapeClass = (shape: StatusChipShape): string => {
  switch (shape) {
    case "circle":
      return cssClass(styles.shapeCircle);
    case "diamond":
      return cssClass(styles.shapeDiamond);
    case "square":
      return cssClass(styles.shapeSquare);
    case "dot":
      return cssClass(styles.shapeDot);
    case "triangle":
      return cssClass(styles.shapeTriangle);
    case "bar":
      return cssClass(styles.shapeBar);
    case "cross":
      return cssClass(styles.shapeCross);
  }
};

const cssClass = (className: string | undefined): string => className ?? "";
