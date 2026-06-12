"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

import { useGameStore } from "@/store/game-store";
import { DiaryLayer, type DiaryLayerTab } from "@/components/diary";
import { GridRegion } from "@/components/grid";
import { HudRegion } from "@/components/hud";
import { KeymapOverlay } from "@/components/keymap-overlay/KeymapOverlay";
import { MessageLogRegion } from "@/components/log";
import { ContextPanelFrame } from "@/components/panels/frame";
import { questMarkersForState } from "@/components/panels/model";
import { RunIndexScreen } from "@/components/runindex";
import {
  GLYPH_SIZE_REM,
  MESSAGE_WINDOW_SIZE,
  themeVariables,
} from "@/components/settings";
import { SettingsScreen } from "@/components/settings";
import { TitleScreen } from "@/components/title";
import { FloorTransitionOverlay } from "@/components/transition";
import { GameInputOwner } from "@/input";
import { InlineConfirmPrompt } from "@/input/InlineConfirmPrompt";
import type { Position } from "@engine/state";
import { composeDiary } from "@harness/diary";

const gridRegionClass = "min-h-0";

export function GameShell() {
  const gameState = useGameStore((state) => state.gameState);
  const screen = useGameStore((state) => state.screen);
  const settings = useGameStore((state) => state.settings);
  const activeRun = useGameStore((state) => state.activeRun);
  const runIndex = useGameStore((state) => state.runIndex);
  const terminalRun = useGameStore((state) => state.terminalRun);
  const transition = useGameStore((state) => state.transition);
  const ui = useGameStore((state) => state.ui);
  const hydratePersistence = useGameStore((state) => state.hydratePersistence);
  const startGameSession = useGameStore((state) => state.startGameSession);
  const continueActiveRun = useGameStore((state) => state.continueActiveRun);
  const openTitle = useGameStore((state) => state.openTitle);
  const openSettings = useGameStore((state) => state.openSettings);
  const openRunIndex = useGameStore((state) => state.openRunIndex);
  const updateSettings = useGameStore((state) => state.updateSettings);
  const skipTransitionTheater = useGameStore(
    (state) => state.skipTransitionTheater,
  );
  const patchUi = useGameStore((state) => state.patchUi);
  const [hoverPosition, setHoverPosition] = useState<Position | null>(null);
  const questMarkers = useMemo(
    () => (gameState === null ? [] : questMarkersForState(gameState)),
    [gameState],
  );
  const diary = useMemo(
    () => (gameState === null ? null : composeDiary({ state: gameState })),
    [gameState],
  );
  const shellStyle = themeVariables(settings.colorTheme) as CSSProperties;

  useEffect(() => {
    hydratePersistence();
  }, [hydratePersistence]);

  if (screen === "settings") {
    return (
      <div data-screen="settings" data-testid="game-state" style={shellStyle}>
        <SettingsScreen
          settings={settings}
          onBack={openTitle}
          onChange={updateSettings}
        />
      </div>
    );
  }

  if (screen === "run-index") {
    return (
      <div data-screen="run-index" data-testid="game-state" style={shellStyle}>
        <RunIndexScreen runs={runIndex} onBack={openTitle} />
      </div>
    );
  }

  if (screen !== "playing" || gameState === null) {
    return (
      <div
        data-screen={terminalRun === null ? "title" : "summary"}
        data-terminal-status={terminalRun?.run.terminalStatus ?? "none"}
        data-testid="game-state"
        style={shellStyle}
      >
        <TitleScreen
          activeRun={activeRun?.gameState ?? null}
          terminalRun={terminalRun}
          onContinue={continueActiveRun}
          onNewRun={(seed) => startGameSession({ seed })}
          onRunIndex={openRunIndex}
          onSettings={openSettings}
        />
      </div>
    );
  }

  return (
    <main
      className="grid h-screen grid-rows-[minmax(0,1fr)_7rem] gap-2 overflow-hidden p-3"
      data-depth={gameState.run.depth}
      data-diary-open={ui.diaryOpen ? "true" : "false"}
      data-input-locked={ui.inputLocked ? "true" : "false"}
      data-panel-mode={ui.contextPanelMode}
      data-screen="playing"
      data-terminal-status={gameState.run.terminalStatus}
      data-testid="game-state"
      data-transition-phase={transition?.phase ?? "none"}
      data-turn={gameState.run.turn}
      style={shellStyle}
    >
      <GameInputOwner />
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] gap-2">
        <div
          className="min-h-0"
          onMouseMove={(event) => setHoverPosition(positionFromGridEvent(event))}
          onMouseLeave={() => setHoverPosition(null)}
        >
          <GridRegion
            className={gridRegionClass}
            glyphSizeRem={GLYPH_SIZE_REM[settings.glyphSize]}
            markers={questMarkers}
            state={gameState}
          />
        </div>

        <div className="grid min-h-0 grid-rows-[minmax(7rem,auto)_minmax(0,1fr)] gap-2">
          <HudRegion state={gameState} />

          <ContextPanelFrame
            hoverPosition={hoverPosition}
            mode={ui.contextPanelMode}
            state={gameState}
          />
        </div>
      </div>

      <div className="relative min-h-0">
        <MessageLogRegion
          state={gameState}
          windowSize={MESSAGE_WINDOW_SIZE[settings.messageSpeed]}
        />
        <InlineConfirmPrompt confirm={ui.pendingConfirm} />
      </div>
      <KeymapOverlay open={ui.keymapOpen} />
      <FloorTransitionOverlay
        transition={transition}
        onSkip={skipTransitionTheater}
      />
      {diary !== null && (ui.diaryOpen || ui.artifactOpen) ? (
        <DiaryLayer
          activeTab={ui.artifactOpen ? "artifacts" : "diary"}
          artifactModel={null}
          diary={diary}
          onClose={() => patchUi({ diaryOpen: false, artifactOpen: false })}
          onSelectTab={(tab: DiaryLayerTab) =>
            patchUi({
              diaryOpen: tab === "diary",
              artifactOpen: tab === "artifacts",
            })
          }
        />
      ) : null}
    </main>
  );
}

const positionFromGridEvent = (
  event: MouseEvent<HTMLDivElement>,
): Position | null => {
  const target =
    event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>("[data-x][data-y]")
      : null;
  const x = Number.parseInt(target?.dataset.x ?? "", 10);
  const y = Number.parseInt(target?.dataset.y ?? "", 10);

  return Number.isSafeInteger(x) && Number.isSafeInteger(y)
    ? { x, y }
    : null;
};
