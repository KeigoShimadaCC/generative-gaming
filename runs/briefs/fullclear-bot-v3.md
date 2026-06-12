# BRIEF: full-clear bot v3 — fix HUD read, exploration stall, and progress watchdog

## STEP 0 — environment facts (do not rediscover)
- Repo root: /Users/keigoshimada/Documents/generative-gaming (you are already in it).
- Node 24, pnpm 10.28.x. `pnpm install` already done.
- You CANNOT launch Chromium/Playwright in your sandbox. Do not try. The
  orchestrator runs the browser campaign after you finish. Your verification
  is static + unit-level only (see DONE).
- The working tree already contains uncommitted bot v2 work in your owned
  files plus app/ changes (seed override, take-hoard key, ambient transport
  flag). Keep all of it; build on top.

## BRANCH ASSIGNMENT (orchestrator authority)
Work directly on the `main` working tree. Make NO git commits, NO branches.
The orchestrator owns all commits.

## OWNED FILES
- e2e/browser-bot.ts
- e2e/full-clear.spec.ts
- app/components/hud/Hud.tsx — ONLY if you must add a stable data attribute;
  prefer reading existing aria attributes instead.
Everything else is read-only.

## EVIDENCE FROM CAMPAIGN RUN 2 (bot v2, seed fullclear-1)
Telemetry over ~6 minutes before the orchestrator killed it:

```
[full-clear bot] depth=1 turn=271  visited=8.0% hp=unknown
[full-clear bot] depth=1 turn=544  visited=8.0% hp=unknown
[full-clear bot] depth=1 turn=817  visited=8.0% hp=unknown
[full-clear bot] depth=1 turn=1089 visited=8.0% hp=unknown
[full-clear bot] depth=1 turn=1362 visited=8.0% hp=unknown
```

Facts established from this + code reading:
1. `turn` comes from the page shell data attributes and it ADVANCES — so
   keystrokes ARE reaching the game and turns are being consumed.
2. `visited` is FROZEN at 8.0% for 1100+ game turns at depth 1 — the bot is
   oscillating in a tiny region or repeatedly waiting. The strict
   same-position pinned detector never fired because oscillation defeats it.
3. `hp=unknown` always. ROOT CAUSE ALREADY FOUND: browser-bot.ts uses
   locator `[data-hud-field="hp"] .value`, but in
   app/components/hud/Hud.tsx the value span's class comes from a CSS module
   (`styles.value` → hashed `Hud_value__*`), so `.value` never matches.
   The HudMeter renders a child with `role="meter"`, `aria-valuenow`
   (current) and `aria-valuemax` (max) — read those instead.

## TASKS
1. **Fix the HP read** via the `role="meter"` aria attributes under
   `[data-hud-field="hp"]`. No app change should be needed.
2. **Root-cause the exploration stall.** Cross-check EVERY selector and
   data-attribute browser-bot.ts uses for the grid/cells/player against the
   actual play-screen components in app/ (read them; do not guess).
   Plausible causes to rule in/out:
   - grid cell parse returns a stale or partial cell set (fog/reveal?) so
     `frontierStep` finds no frontier and the bot falls back to wait/random
     oscillation;
   - visited-set keying mismatch between `markVisited` and `frontierStep`;
   - `walkable.size` counts the full floor while the bot can only see 8%.
   Fix what you find. The bot must make monotonic exploration progress and
   actively seek stairs / descend, and on the final floor seek the Hoard and
   take an item (T key already bound).
3. **Replace the pinned detector with a no-progress watchdog**: if for 150
   consecutive game turns there is no new visited cell AND no depth change,
   abort the run with a clear reason.
4. **Diagnostic artifacts on EVERY abort path** (watchdog, turn cap, error,
   test failure): write into `test-results/fullclear-diagnostics/` a
   screenshot, the full page HTML, captured console messages, and a JSON of
   bot state (depth, turn, visited count, last 20 actions). The orchestrator
   needs these to debug runs you cannot reproduce.
5. Keep the telemetry line; add `lastAction` to it.

## DONE = paste actual command output with explicit exit codes
- `pnpm run typecheck` → exit 0
- `pnpm run lint` → exit 0
- If you extracted pure helpers (frontier/visited math), a quick vitest or
  node assertion run for them → exit 0 (optional but preferred).
- A short written diagnosis: what was wrong with exploration, what you
  changed, and what evidence supports it.

## TIMEBOX
40 minutes. If blocked >10 min on one unknown, write AMBIGUITIES + STOP.
