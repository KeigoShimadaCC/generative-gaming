"use client";

import {
  useMemo,
  useState,
  type MouseEvent,
} from "react";

import { useGameStore } from "@/store/game-store";
import { GridRegion } from "@/components/grid";
import { HudRegion } from "@/components/hud";
import { KeymapOverlay } from "@/components/keymap-overlay/KeymapOverlay";
import { MessageLogRegion } from "@/components/log";
import { ContextPanelFrame } from "@/components/panels/frame";
import { questMarkersForState } from "@/components/panels/model";
import { GameInputOwner } from "@/input";
import { InlineConfirmPrompt } from "@/input/InlineConfirmPrompt";
import type { Position } from "@engine/state";

const gridRegionClass = "min-h-0";

export function GameShell() {
  const gameState = useGameStore((state) => state.gameState);
  const ui = useGameStore((state) => state.ui);
  const [hoverPosition, setHoverPosition] = useState<Position | null>(null);
  const questMarkers = useMemo(
    () => (gameState === null ? [] : questMarkersForState(gameState)),
    [gameState],
  );

  return (
    <main className="grid h-screen grid-rows-[minmax(0,1fr)_7rem] gap-2 overflow-hidden p-3">
      <GameInputOwner />
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] gap-2">
        <div
          className="min-h-0"
          onMouseMove={(event) => setHoverPosition(positionFromGridEvent(event))}
          onMouseLeave={() => setHoverPosition(null)}
        >
          <GridRegion
            className={gridRegionClass}
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
        <MessageLogRegion state={gameState} />
        <InlineConfirmPrompt confirm={ui.pendingConfirm} />
      </div>
      <KeymapOverlay open={ui.keymapOpen} />
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
