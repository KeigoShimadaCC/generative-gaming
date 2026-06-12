"use client";

import { useGameStore } from "@/store/game-store";
import { GridRegion } from "@/components/grid";
import { HudRegion } from "@/components/hud";
import { KeymapOverlay } from "@/components/keymap-overlay/KeymapOverlay";
import { MessageLogRegion } from "@/components/log";
import { GameInputOwner } from "@/input";
import { InlineConfirmPrompt } from "@/input/InlineConfirmPrompt";

const regionClass =
  "rounded border border-gg-border bg-gg-surface text-gg-muted flex items-center justify-center text-sm uppercase tracking-wide";
const gridRegionClass = "min-h-0";

export function GameShell() {
  const gameState = useGameStore((state) => state.gameState);
  const ui = useGameStore((state) => state.ui);

  return (
    <main className="grid h-screen grid-rows-[minmax(0,1fr)_7rem] gap-2 overflow-hidden p-3">
      <GameInputOwner />
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] gap-2">
        <GridRegion className={gridRegionClass} state={gameState} />

        <div className="grid min-h-0 grid-rows-[minmax(7rem,auto)_minmax(0,1fr)] gap-2">
          <HudRegion state={gameState} />

          <section className={regionClass} aria-label="Context panel">
            Context · {ui.contextPanelMode}
          </section>
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
