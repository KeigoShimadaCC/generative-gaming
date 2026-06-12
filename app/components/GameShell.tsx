"use client";

import { useGameStore } from "@/store/game-store";

const regionClass =
  "rounded border border-gg-border bg-gg-surface text-gg-muted flex items-center justify-center text-sm uppercase tracking-wide";

export function GameShell() {
  const gameState = useGameStore((state) => state.gameState);
  const ui = useGameStore((state) => state.ui);

  return (
    <main className="grid h-screen grid-rows-[minmax(0,1fr)_7rem] gap-2 overflow-hidden p-3">
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] gap-2">
        <section
          className={`${regionClass} min-h-0`}
          aria-label="The grid"
        >
          The grid
          {gameState !== null ? (
            <span className="ml-2 text-gg-text">
              d{gameState.run.depth} · t{gameState.run.turn}
            </span>
          ) : null}
        </section>

        <div className="grid min-h-0 grid-rows-[minmax(7rem,auto)_minmax(0,1fr)] gap-2">
          <section className={regionClass} aria-label="HUD">
            HUD
            {gameState !== null ? (
              <span className="ml-2 text-gg-text">
                HP {gameState.player.hp.current}/{gameState.player.hp.max}
              </span>
            ) : null}
          </section>

          <section className={regionClass} aria-label="Context panel">
            Context · {ui.contextPanelMode}
          </section>
        </div>
      </div>

      <section className={regionClass} aria-label="Message log">
        Message log
        {gameState !== null && gameState.log.length > 0 ? (
          <span className="ml-2 truncate text-gg-text">
            {gameState.log.length} events
          </span>
        ) : null}
      </section>
    </main>
  );
}
