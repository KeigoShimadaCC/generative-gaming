IMPLEMENT TASK — PHASE-49B: HUD & message log (contract: phase-plans/PHASE-49B-HUD-LOG.md; read UX §1 HUD/log specs, §3 log discipline, §10 selectable-text rule).

GATE SCOPE: alone — full pnpm run check (clean .next first; redirect-don't-pipe for exit codes). Do NOT commit.
STEP 0: store (48) carries state + events; the engine log formatter (render/log) is the TEXT TRUTH — the web log renders its strings verbatim; HUD pulse metadata rides on events (player system emits it).
OWNED FILES: app/components/hud/**, app/components/log/** (+ tests), game-route wiring lines.

THE WORK:
1. hud/: depth · turn · HP (number + bar) · fullness · level/XP · status chips (label+icon-shape, not color-only); changed-this-turn pulse driven by event metadata; glanceable layout per UX §1.
2. log/: rolling last-6 window rendering the engine formatter's strings VERBATIM in engine event order, turn-grouped; full-history overlay component (toggle prop — key wiring is PHASE-50's); selectable plain text.
3. Tests: fixture event sequences render in exact order; verbatim-strings assertion (compare against the engine formatter's output for the same events); pulse fires on change only; history overlay completeness.
DEFINITION OF DONE: pnpm run check green w/ explicit exit (paste); component tests. Report + actual vs 30m. NO commit. Then stop.
