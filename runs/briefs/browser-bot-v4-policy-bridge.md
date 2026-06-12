# BRIEF: browser bot v4 — drive the browser with the real CLI policy brain

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- No Chromium/Playwright runs in your sandbox; orchestrator runs the campaign.
- Tree has uncommitted, verified work in .github/workflows/ci.yml,
  tests/eval-baselines/mock-baseline.json, app/api/director/transport-server*
  — do NOT touch those.

## BRANCH ASSIGNMENT (orchestrator authority)
Work directly on the `main` working tree. NO git commits, NO branches.

## CONTEXT
The CLI bot policies (src/harness/bots) now WIN 29/45 full runs. The
browser bot (e2e/browser-bot.ts) is an independent hand-rolled policy that
keeps dying (latest: LOSS d5, retreating from 1 enemy without fighting or
healing — runs/…/fullclear-1781301633854-run-lost-…state.json). Maintaining
two brains costs a full campaign run per heuristic tweak.

## OBJECTIVE
The browser bot makes decisions with the REAL policy code while still
exercising the real UI: state read from the page, decision from
src/harness/bots policy, action delivered as real keyboard input.

## APPROACH
1. Dev-only state bridge in the app: when a flag is set (env or query
   param, e.g. ?botBridge=1 gated to non-production), the game store
   exposes a read-only, serialized GameState snapshot on
   window.__GG_BOT_STATE__ (reuse the engine's existing state
   serialization — src/engine/state/serialize.ts — so the policy gets a
   faithful state). No bridge in production builds.
2. e2e/browser-bot.ts v4: each turn, page.evaluate the snapshot →
   deserialize in Node → call the balanced policy's decide function (reuse
   the exact decision entry the CLI driver uses in src/harness/bots) → map
   the chosen engine action to the UI key(s) (movement/attack directions,
   g, >, T, inventory flow for use_item/equip — read app/input/keys.ts for
   the mapping) → press keys → wait for the turn counter to advance.
3. Keep all v3 campaign hardening: transition wait, watchdogs, diagnostics
   dumps, telemetry (add policy decision to the telemetry line).
4. Keep the DOM-parsing fallback path ONLY for the title/summary screens
   and key-contract assertions; gameplay decisions come from the policy.
5. If an action kind cannot be expressed through the UI keymap, log it,
   substitute the policy's next-best (the policies are pure — document how
   you re-query), and dump details; do not silently wait.

## OWNED FILES
- e2e/browser-bot.ts, e2e/full-clear.spec.ts
- app/store/game-store.ts (or the cleanest store seam) + app/input files
  ONLY for the minimal dev-only bridge exposure
- a focused test for the bridge (store test: flag on → snapshot present;
  flag off → absent)
Forbidden: src/harness/bots/** changes (REUSE only), src/engine, content/,
.github/**, tests/eval-baselines/**, app/api/director/**.

## DONE = paste outputs with exit codes
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run check` → exit 0 each.
- Bridge store test → exit 0.
- Report: the policy entry point reused (file:line), the action→key
  mapping table, bridge gating proof (file:line).

## ESTIMATE / TIMEBOX
Estimate 35 min. Timebox 70 min.
