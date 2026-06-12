# BRIEF: gameplay hooks default-on — CLI simulate path still has zero enemy damage

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- No Chromium/Playwright in your sandbox. CLI simulate works fine in-sandbox.
- HEAD is 63b3101e. e2e/ files have uncommitted survival-policy changes —
  do not touch e2e/.

## BRANCH ASSIGNMENT (orchestrator authority)
Work directly on the `main` working tree. NO git commits, NO branches.

## EVIDENCE (orchestrator batch, 2026-06-13, /tmp/balance-post-combat.json)
45/45 runs (cautious/balanced/aggressive × 15 seeds, fallback content):
ABORTED, final hp% = 100 for every run, itemUses = 0, but kills 2–28.
Meanwhile the browser path (same engine) produces real player deaths.
Conclusion: 3d2f5bb5 wired `runGameplayTurnHooks()` into the web session
and replay, but the CLI simulate/bot harness still steps the run without
enemy-behavior hooks. Call-site opt-in has now produced the same bug in
three places.

## OBJECTIVE
Every run path — CLI simulate, web session, replay, gauntlet Gate 2
simulation, tests — executes enemy behavior by default. Forgetting hooks
must become impossible, not just fixed once more.

## TASKS (diagnosis first)
1. Find every call site that steps a run (stepRun / run loop entry):
   simulate CLI, bot harness, Gate 2 simulator, web session, replay, tests.
   List them in the report with whether they currently pass hooks.
2. Invert the API: make the standard gameplay hooks the DEFAULT inside the
   engine run-loop entry (e.g. stepRun applies them unless the caller
   explicitly passes an override/none). Keep determinism: same inputs →
   same trace. Keep an explicit escape hatch for tests that need hook-free
   stepping, used only where a test genuinely requires it.
3. Update call sites accordingly (most should now pass nothing).
4. IMPORTANT — Gate 2 consequence: if Gate 2's simulated playability
   previously ran without enemy damage, default-on hooks may change gate
   verdicts. Run the gauntlet test suite and report any behavior change;
   do NOT retune Gate 2 thresholds in this task — report instead.
5. Goldens/eval banks: regenerate via the repo's existing generator if
   traces change; confirm determinism audit still passes.
6. Verify with a quick batch: 
   `pnpm run simulate -- --batch --policies balanced --seeds 5 --max-turns 8000 --out /tmp/hooks-check.json`
   → expect hp% < 100 on at least some runs (enemies now hit back). Paste
   the table.

## OWNED FILES
- src/engine/run/** (loop entry/API), src/harness/** (bot/sim runner),
  src/cli/simulate.ts, src/gauntlet/** ONLY if its simulator call site
  needs the explicit escape hatch or trivial signature sync (no threshold
  changes), tests/goldens regeneration outputs, app/input/game-session.ts +
  app/components/runindex/replay.ts (to drop now-redundant explicit wiring).
Forbidden: e2e/**, content/, GAME_DESIGN.md, Gate 2 thresholds.

## DONE = paste actual command output with explicit exit codes
- Call-site inventory (file:line, before/after).
- `pnpm run check` → exit 0.
- `pnpm exec vitest run --config tests/determinism-audit/vitest.config.ts` → exit 0.
- `pnpm exec vitest run --config tests/golden/vitest.config.ts` → exit 0.
- The 5-seed batch table showing nonzero damage.
- Gate 2 behavior-change report (factual, no tuning).

## ESTIMATE / TIMEBOX
Estimate 30 min. Timebox 60 min. If default-on hooks break >10 tests in
ways that look like real gameplay-balance shifts (not just stale fixtures),
STOP and report before mass-regenerating.
