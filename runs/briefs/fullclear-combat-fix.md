# BRIEF: full-clear blocker — bump-attack does not resolve combat (diagnose root cause, then fix)

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- You CANNOT launch Chromium/Playwright in your sandbox. Verification is
  `pnpm run check` (typecheck+lint+tests) and unit tests only. The
  orchestrator runs the browser campaign.
- Working tree has uncommitted bot v3 + app changes. Keep them; build on top.

## BRANCH ASSIGNMENT (orchestrator authority)
Work directly on the `main` working tree. NO git commits, NO branches.

## EVIDENCE (campaign run 3, seed fullclear-1, full diagnostics in
test-results/fullclear-diagnostics/*.state.json — read them)
- Bot at player (22,5), enemy adjacent at (23,4). Bot pressed `u`
  (up-right diagonal) for 20+ consecutive game turns: action log
  `attack-adjacent-enemy:23,4 key=u` from t143 through t163.
- The enemy NEVER died. Player HP stayed 20/20 the whole time. Game turns
  DID advance (engine log shows enemy actor turns + ticks each turn).
- So: a diagonal bump into an adjacent enemy consumes a turn but resolves
  no combat in either direction. This matches the known backlog item
  "enemy behavior hook unwired in stepRun / bots take zero damage"
  (PROGRESS.md backlog).
- Separate confirmed bug: hydration error on load — TitleScreen's
  `titleSeedOverride()` reads `window.location` inside a `useState`
  initializer, so SSR and client render different seeds and React rebuilds
  the tree (console pageerror in the diagnostics dumps).

## OBJECTIVE
A bot (and a player) bumping into an adjacent enemy must deal damage and
eventually kill it — through the real engine path the web UI uses — and the
title seed override must not cause a hydration mismatch.

## TASKS (diagnosis FIRST — report what you find before fixing)
1. Trace the web UI input path for a diagonal move-into-enemy: keymap intent
   → GameShell dispatch → engine step. Establish exactly where it becomes a
   no-op that still advances the turn. Check BOTH:
   a. whether diagonal bump-attack is legal in the engine (cardinal-only?),
   b. whether melee combat resolution is wired at all on this path
      (the backlogged stepRun enemy-behavior hook).
2. Fix the root cause in the engine/UI so bump-attacks resolve combat. If
   diagonal attacks are intentionally illegal per GAME_DESIGN.md, do NOT
   change the rule — instead document that in your report and make the
   ILLEGAL bump not consume a turn (a rejected action must not pass time),
   and update e2e/browser-bot.ts to attack cardinally / reroute.
3. Add/extend an engine unit test proving: player bump-attack kills an
   enemy in N hits, and (if rule allows) diagonal bump behaves the same as
   cardinal; illegal bumps do not consume a turn.
4. Fix the TitleScreen hydration mismatch: resolve the seed override without
   SSR/client divergence (e.g. apply it in an effect or via Next
   searchParams), keeping `?seed=` functional for the e2e campaign.
5. Bot hardening in e2e/browser-bot.ts: add a loop-breaker — if the same
   action repeats 12 times with no observable state change (enemy still
   there, HP unchanged, position unchanged), switch strategy (reroute
   around the blocker) instead of repeating.

## OWNED FILES
- src/engine/** (only what the root cause requires — name every file you
  touched in the report)
- tests/** for the new unit tests, or colocated engine test files matching
  repo convention
- app/components/title/TitleScreen.tsx
- app/ input-dispatch files ONLY if the root cause is there (name them)
- e2e/browser-bot.ts
Forbidden: src/schemas, src/gauntlet, src/director, content/, docs, CI.

## CONTEXT
- Engine step entry: src/engine (stepRun / action resolution — you locate
  precisely; the backlog notes the enemy behavior hook is unwired there).
- Movement keys: app/input/keys.ts KEYMAP_BINDINGS (8-way movement bound,
  including vi diagonals y/u/b/n).
- GAME_DESIGN.md is the rules authority for whether diagonal attacks exist.

## DONE = paste actual command output with explicit exit codes
- Written root-cause diagnosis (file + line of the break).
- `pnpm run check` → exit 0 (530+ tests, including your new ones).
- List of every file changed and why.

## ESTIMATE / TIMEBOX
Estimate 25 min. Timebox 50 min. If the engine fix balloons beyond the
melee-resolution path (e.g. requires reworking the actor scheduler), STOP
at the diagnosis and report — do not start a rework.
