IMPLEMENT TASK — PHASE-52+53 combined: floor transition UX + title/settings/run index (contracts: phase-plans/PHASE-52-FLOOR-TRANSITION-UX.md — UX §6 verbatim is the spec — and PHASE-53-TITLE-SETTINGS-RUNINDEX.md; serial lane, one worker).

GATE SCOPE: alone — full pnpm run check (clean .next; redirect-don't-pipe). Do NOT commit.
STEP 0: 38's prefetch controller has the three states (ready/in-flight/none) + async resolveFloor for UI; 27's run index repo; 23B replay; trace recording happens in the session holder (check it does — if the web session holder doesn't record traces yet, wire the canonical recorder in: it's part of 52's arrival/descend lifecycle).
OWNED FILES: app/components/transition/**, app/components/title/**, app/components/settings/**, app/components/runindex/** (+ tests), game-route/session-holder wiring lines.

THE WORK (52):
1. Descend → transition screen: floor number + one-line whisper (narration intro if present); controller-state driven: ready → 1–2s pure theater; in-flight → shimmer up to config stairsCap → fallback served IDENTICALLY (no visual difference — test by asserting identical presentation props for generated vs fallback); interruptible (any key skips theater once floor ready).
2. Arrival ritual: grid fade-in from entrance, intro line to log, quest chips update; ~2s, then rhythm.
3. Client latency instrumentation: stairs-to-playable ms logged to console/store (feeds 56's measurement).
THE WORK (53):
4. Title: continue (active run from store/persistence) / new run (seed display, one key to descend) / run index / settings; death-to-new-run flow ≤10s (UX §8 — test the step count, the wall-clock claim lands in 56).
5. Settings (one screen, persisted localStorage): glyph size, color theme, message speed, auto-travel toggles, hint-kill, keybinding VIEW (from the keymap table).
6. Run index: list from persistence (outcome/depth/date); per-run: replay-in-grid (23B verify + step-through rendering via the real grid, read-only) + diary slot (54A stub link).
7. Tests: transition state matrix (mock latencies incl. the identical-presentation assertion); arrival sequence; title flows; settings persistence; replay stepping on a fixture trace.
DEFINITION OF DONE: pnpm run check green w/ exit (paste). Report + actual vs 60m. NO commit. Then stop.
