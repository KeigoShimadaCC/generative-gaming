# BRIEF: arrival-phase wedge — one-shot finishArrival timer can strand the run with input locked

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- No Chromium/Playwright in your sandbox; orchestrator runs the browser campaign.
- Working tree has uncommitted bot + engine combat fixes. Keep; build on top.

## BRANCH ASSIGNMENT (orchestrator authority)
Work directly on the `main` working tree. NO git commits, NO branches.

## EVIDENCE (campaign run 5, seed fullclear-1 — diagnostics in
test-results/fullclear-diagnostics/*wedged*)
- Game entered depth 3 (`t104 entered d3 shallows (4/20)`), shell stuck at
  `transitionPhase: "arrival"`, `inputLocked: true`, for >90s with zero key
  presses from the bot. Run permanently unplayable.

## ROOT CAUSE (orchestrator code reading — verify, then fix)
app/store/game-store.ts:
- Descend completion (~line 363) arms ONE setTimeout for
  `playableAtMs`; at fire it calls `finishArrival` only if
  `shouldResumePlay(current, nowMs())`.
- `finishArrival` (~line 375) returns silently if
  `transition.servedSource === null`.
- If the condition is false at the single timer fire (e.g. servedSource not
  yet set), NOTHING ever calls finishArrival again → permanent wedge with
  input locked. A real player can hit this whenever floor serving resolves
  after `playableAtMs`.

## OBJECTIVE
Arrival always completes: once the arrival ritual's `playableAtMs` has
passed AND `servedSource` is set, play resumes — regardless of the order or
timing in which those become true.

## TASKS
1. Replace the one-shot timer with a robust completion path. Acceptable
   shapes (pick what fits the store's existing idiom):
   - re-arm a short retry timer when the fire-time condition is unmet, or
   - also attempt `finishArrival` at the point where `servedSource` is set
     on the transition, keeping the playableAtMs timer for the other order.
   No polling loops tighter than 100ms; no behavior change when the happy
   path already works (don't shorten the arrival ritual).
2. Find where `servedSource` transitions from null→set and make sure that
   path triggers the completion check (this is likely the missing half).
3. Unit test in the store's existing test setup: simulate servedSource
   resolving AFTER playableAtMs and assert the transition clears and input
   unlocks; plus the happy-path order still works.

## OWNED FILES
- app/store/game-store.ts
- the store's existing test file(s) (create alongside if none)
Everything else read-only.

## DONE = paste actual command output with explicit exit codes
- New unit tests passing (paste vitest output) → exit 0
- `pnpm run check` → exit 0
- Report: where servedSource is set, and which completion shape you chose.

## ESTIMATE / TIMEBOX
Estimate 15 min. Timebox 30 min.
