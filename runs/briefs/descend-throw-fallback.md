# BRIEF: descend-step throw wedges the run — fallback on floor-entry failure + depth-correct e2e transport

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- No Chromium/Playwright in your sandbox; orchestrator runs the browser campaign.
- Working tree has uncommitted fixes (engine combat, arrival retry, bot). Keep them.

## BRANCH ASSIGNMENT (orchestrator authority)
Work directly on the `main` working tree. NO git commits, NO branches.

## EVIDENCE (campaign run 6, seed fullclear-1 — diagnostics in
test-results/fullclear-diagnostics/*floor-transition-wedged*)
- At depth 4 → 5 descend, console pageerror:
  `Error: roster is outside middle spawn budget`
  at `Object.step (app/input/game-session.ts:53)` via
  `enterResolvedFloor (app/store/game-store.ts:234)`.
- The throw escapes, the transition stays in `transitionPhase:"descending"`
  forever. Run unplayable. Deterministic: same seed wedges at the same
  floor every run (this also explains the run-4 freeze at d4 t162).

## ROOT-CAUSE HYPOTHESES (verify both; fix what's real)
A. app/api/director/transport-server.ts serves a fixed
   `validShallowsManifestFixture` (and `passingGate2(validShallowsManifestFixture)`)
   regardless of depth. Depth 5 is the "middle" band; a shallows roster
   exceeds the middle spawn budget, so the engine's floor-entry legality
   check throws.
B. Regardless of (A): an exception thrown while entering a resolved floor
   must NOT wedge the run. NORTH_STAR invariant: failed content falls back
   to the built-in pack invisibly; the game stays playable.

## OBJECTIVE
Descending can never strand the run: floor-entry failure falls back to the
fallback pack floor for that depth (with the failure recorded), and the e2e
web transport serves depth/band-appropriate content so the happy path is
actually exercised on every band.

## TASKS (diagnosis first — confirm A and B with file/line in your report)
1. Fix B in app/store/game-store.ts (and app/input/game-session.ts if the
   seam belongs there): wrap floor-entry resolution; on throw, serve the
   fallback floor for that depth through the existing fallback path, record
   the failure the same way gauntlet rejections are recorded (whatever the
   existing artifact/log seam is — do not invent a new one), unlock input,
   and complete the transition. The player experience: descend just works.
2. Fix A in app/api/director/transport-server.ts: serve a manifest + gate2
   config appropriate to the requested depth's band (shallows/middle/depths
   fixtures exist in test fixtures — locate and use them; if a middle/depths
   manifest fixture does not exist, derive the served content from the
   fallback pack's floor for that depth instead of a fixed shallows fixture).
3. Unit tests: (a) store-level — floor-entry throw leads to fallback floor
   served, transition completed, input unlocked; (b) transport-level — depth
   5 request yields content that passes the middle-band budget check.

## OWNED FILES
- app/store/game-store.ts, app/input/game-session.ts
- app/api/director/transport-server.ts
- their test files (existing or new alongside)
Forbidden: src/engine (the legality check is CORRECT — do not loosen it),
src/gauntlet, src/schemas, content/, docs, CI.

## DONE = paste actual command output with explicit exit codes
- New unit tests passing (paste vitest output) → exit 0
- `pnpm run check` → exit 0
- Report: confirmed root causes with file:line, fallback seam used, fixture
  choice for middle/depths.

## ESTIMATE / TIMEBOX
Estimate 25 min. Timebox 50 min. If the fallback seam doesn't exist in the
web path at all (i.e. nothing to hook into), STOP after diagnosis and report.
