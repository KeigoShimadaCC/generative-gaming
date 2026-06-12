"use client";

import { useGameStore } from "@/store/game-store";
import { GridRegion } from "@/components/grid";
import { HudRegion } from "@/components/hud";
import { MessageLogRegion } from "@/components/log";

const regionClass =
  "rounded border border-gg-border bg-gg-surface text-gg-muted flex items-center justify-center text-sm uppercase tracking-wide";
const gridRegionClass = "min-h-0";

export function GameShell() {
  const gameState = useGameStore((state) => state.gameState);
  const ui = useGameStore((state) => state.ui);

  return (
    <main className="grid h-screen grid-rows-[minmax(0,1fr)_7rem] gap-2 overflow-hidden p-3">
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] gap-2">
        <GridRegion className={gridRegionClass} state={gameState} />

        <div className="grid min-h-0 grid-rows-[minmax(7rem,auto)_minmax(0,1fr)] gap-2">
          <HudRegion state={gameState} />

          <section className={regionClass} aria-label="Context panel">
            Context · {ui.contextPanelMode}
          </section>
        </div>
      </div>

      <MessageLogRegion state={gameState} />
    </main>
  );
}
