"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { useGameStore } from "@/store/game-store";
import type { GameState } from "@engine/state";

import {
  GRID_FIXTURE_STORIES,
  createMidActionGridFixtureState,
} from "./fixtures";
import styles from "./GameGrid.module.css";
import {
  createGridViewModel,
  hasRenderableGrid,
  type GridCellView,
  type GridLayer,
  type GridOverlayMarker,
  type GridRenderCursor,
  type GridShape,
  type GridViewModel,
} from "./model";

type GameGridProps = {
  readonly state: GameState | null;
  readonly glyphSizeRem?: number;
  readonly markers?: readonly GridOverlayMarker[];
};

type GridRegionProps = GameGridProps & {
  readonly className?: string;
};

export function GridRegion({
  state,
  glyphSizeRem,
  markers = [],
  className,
}: GridRegionProps) {
  const setGameState = useGameStore((store) => store.setGameState);
  const devFixtureMode = useLocalDevFixtureMode();
  const needsDevFixture =
    devFixtureMode && (state === null || !hasRenderableGrid(state));

  useEffect(() => {
    if (needsDevFixture) {
      setGameState(createMidActionGridFixtureState());
    }
  }, [needsDevFixture, setGameState]);

  return (
    <section
      className={[styles.region, className].filter(Boolean).join(" ")}
      aria-label="The grid"
      data-testid="game-grid-region"
    >
      <GameGrid state={state} glyphSizeRem={glyphSizeRem} markers={markers} />
      {devFixtureMode ? <GridFixtureControls /> : null}
    </section>
  );
}

export function GameGrid({ state, glyphSizeRem, markers = [] }: GameGridProps) {
  const cursorRef = useRef<GridRenderCursor | undefined>(undefined);
  const model = useMemo(() => {
    if (state === null) {
      return null;
    }

    const nextModel = createGridViewModel(state, cursorRef.current, markers);
    cursorRef.current = nextModel.cursor;

    return nextModel;
  }, [state, markers]);

  if (model === null || model.width === 0 || model.height === 0) {
    return (
      <div className={styles.stage}>
        <div className={styles.empty}>No floor grid</div>
      </div>
    );
  }

  return <GridFrame model={model} glyphSizeRem={glyphSizeRem} />;
}

export function GridFrame({ model, glyphSizeRem }: {
  readonly model: GridViewModel;
  readonly glyphSizeRem?: number;
}) {
  const style = {
    gridTemplateColumns: `repeat(${model.width}, var(--gg-grid-cell-size))`,
    ...(glyphSizeRem === undefined
      ? {}
      : { "--gg-grid-glyph-size": `${glyphSizeRem}rem` }),
  } as CSSProperties;

  return (
    <div className={styles.stage}>
      <div
        className={styles.grid}
        role="grid"
        aria-rowcount={model.height}
        aria-colcount={model.width}
        data-testid="game-grid"
        data-width={model.width}
        data-height={model.height}
        style={style}
      >
        {model.rows.map((row, rowIndex) => (
          <div
            className={styles.row}
            role="row"
            aria-rowindex={rowIndex + 1}
            key={rowIndex}
          >
            {row.map((cell) => (
              <GridCell cell={cell} key={cell.key} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const GridCell = memo(
  function GridCell({ cell }: { readonly cell: GridCellView }) {
    const className = [
      styles.cell,
      styles[cell.fog],
      layerClass(cell.layer),
      shapeClass(cell.shape),
      cell.hitFlash ? styles.hitFlash : "",
      cell.motion === null ? "" : styles.moveArrive,
    ]
      .filter(Boolean)
      .join(" ");
    const style = (
      cell.motion === null
        ? undefined
        : {
            "--gg-move-x": String(cell.motion.dx),
            "--gg-move-y": String(cell.motion.dy),
          }
    ) as CSSProperties | undefined;

    return (
      <div
        className={className}
        role="gridcell"
        aria-colindex={cell.x + 1}
        aria-label={`${cell.x},${cell.y} ${cell.label}`}
        title={`${cell.x},${cell.y} ${cell.label}`}
        data-x={cell.x}
        data-y={cell.y}
        data-glyph={cell.glyph}
        data-fog={cell.fog}
        data-layer={cell.layer}
        data-label={cell.label}
        data-shape={cell.shape}
        data-hit-flash={cell.hitFlash ? "true" : "false"}
        data-motion={cell.motion === null ? "none" : "arrive"}
        style={style}
      >
        <span className={styles.glyph} aria-hidden="true">
          {cell.glyph === " " ? "\u00a0" : cell.glyph}
        </span>
        {cell.badge.length > 0 ? (
          <span className={styles.badge} aria-hidden="true">
            {cell.badge}
          </span>
        ) : null}
        {cell.markers.map((marker) => (
          <span
            className={[
              styles.marker,
              marker.tone === "quest" ? styles.questMarker : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-marker-id={marker.id}
            data-marker-tone={marker.tone}
            key={marker.id}
            title={marker.label}
            aria-label={marker.label}
          >
            !
          </span>
        ))}
        {cell.pulses.map((pulse) => (
          <span
            className={[
              styles.pulse,
              pulse.kind === "damage"
                ? styles.damagePulse
                : styles.healPulse,
            ].join(" ")}
            data-pulse-kind={pulse.kind}
            key={pulse.id}
            aria-hidden="true"
          >
            {pulse.text}
          </span>
        ))}
      </div>
    );
  },
  (previous, next) => previous.cell.renderKey === next.cell.renderKey,
);

function GridFixtureControls() {
  const setGameState = useGameStore((state) => state.setGameState);

  return (
    <div className={styles.fixtureBar} aria-label="Grid fixtures">
      {GRID_FIXTURE_STORIES.map((fixture) => (
        <button
          className={styles.fixtureButton}
          key={fixture.id}
          type="button"
          onClick={() => setGameState(fixture.createState())}
        >
          {fixture.label}
        </button>
      ))}
    </div>
  );
}

const layerClass = (layer: GridLayer): string => {
  switch (layer) {
    case "player":
      return cssClass(styles.player);
    case "enemy":
      return cssClass(styles.enemy);
    case "npc":
      return cssClass(styles.npc);
    case "item":
      return cssClass(styles.item);
    case "trap":
      return cssClass(styles.trap);
    case "terrain":
      return cssClass(styles.terrain);
    case "empty":
      return cssClass(styles.emptyLayer);
  }
};

const shapeClass = (shape: GridShape): string => {
  switch (shape) {
    case "circle":
      return `${cssClass(styles.shape)} ${cssClass(styles.shapeCircle)}`;
    case "diamond":
      return `${cssClass(styles.shape)} ${cssClass(styles.shapeDiamond)}`;
    case "square":
      return `${cssClass(styles.shape)} ${cssClass(styles.shapeSquare)}`;
    case "dot":
      return `${cssClass(styles.shape)} ${cssClass(styles.shapeDot)}`;
    case "triangle":
      return `${cssClass(styles.shape)} ${cssClass(styles.shapeTriangle)}`;
    case "none":
      return "";
  }
};

const cssClass = (className: string | undefined): string => className ?? "";

const useLocalDevFixtureMode = (): boolean => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isLocalDevBrowser());
  }, []);

  return enabled;
};

const isLocalDevBrowser = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1"
  );
};
