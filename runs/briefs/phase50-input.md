IMPLEMENT TASK — PHASE-50: keyboard input & action dispatch (contract: phase-plans/PHASE-50-INPUT-DISPATCH.md; read UX §2 ENTIRELY — the keymap and its four rules ARE the spec — plus §3 auto-travel).

GATE SCOPE: alone — full pnpm run check (clean .next; redirect-don't-pipe). Do NOT commit.
STEP 0: the store mirrors engine state; stepping the engine happens CLIENT-SIDE (engine is a lib): wire a thin game-session holder (engine start/step via public contract) into the store update cycle — read how the fixture hydration works (48) and the CLI's session holder (25A) for the pattern. Panels exist later (51); your job is the input owner + dispatch loop.
OWNED FILES: app/input/** (+ tests), game-route wiring lines, app/components/keymap-overlay/** (the ? screen).

THE WORK:
1. Single input-owner hook: arrows/WASD/vi-keys move (8-dir), g pickup, i/q/x mode-toggle intents (store UI flags — panels consume later), . wait, > descend, ? keymap overlay, Esc cancel/close-top, Enter confirm; move-into semantics ride the engine (bump routing).
2. Dispatch loop: key → structured action → engine step → store update → events to log/HUD; illegal actions → their typed reason as a log line (explained, not eaten); input NEVER queues during animation (drop or coalesce, per UX §3).
3. Inline y/n confirm flow for dangerous-action events (the engine emits confirm-required? read how; if the engine has no confirm protocol, implement client-side for descend-with-enemies-adjacent as the MVP case and note it).
4. Auto-travel: hold/repeat move with notable-stops (enemy sighted, item underfoot, HP threshold — config-read); stops tested.
5. Keymap overlay: one page, accurate, from a single keymap table (the same table drives the handler — no drift).
6. Tests: scripted key-event suite — every UX §2 binding produces its action (table-driven); travel stops on each notable; confirm intercepts; illegal-reason surfaces; focus rule (keys ignored when overlay open except Esc/?).
DEFINITION OF DONE: pnpm run check green w/ exit code (paste); the key-table test summary. Report + actual vs 35m. NO commit. Then stop.
