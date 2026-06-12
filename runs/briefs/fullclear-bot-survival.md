# BRIEF: full-clear bot — survival tactics (retreat, heal, disengage) to reach WIN

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- No Chromium/Playwright in your sandbox; orchestrator runs the campaign.
- HEAD is b3f35639; tree is clean. All prior campaign fixes are merged.

## BRANCH ASSIGNMENT (orchestrator authority)
Work directly on the `main` working tree. NO git commits, NO branches.

## EVIDENCE (campaign run 7, seed fullclear-1 — diagnostics in
test-results/fullclear-diagnostics/*left-playing-screen*)
- Bot reached depth 5 — combat, transitions, and fallback all work now.
- It died: last actions were five consecutive `attack-adjacent-enemy:29,4
  key=y` at d5 t165–169, ending in `terminalStatus: "LOSS"` (summary
  screen). The bot traded hits to death against a middle-band enemy.
- Existing policy has an hpRatio <= 0.45 retreat branch, which evidently
  did not save it (check why: never triggered? retreat path blocked? HP
  dropped too fast through multiple adjacent enemies?).

## OBJECTIVE
The bot survives to depth 12 and WINs (takes from the Hoard) on the
fallback/mock content path. Combat competence: fight only when necessary,
retreat early, heal when possible, never tank avoidable damage.

## TASKS
1. Read the LOSS diagnostics + the engine's combat/item rules (read-only)
   to ground decisions: what healing items exist in the fallback pack, how
   inventory use works from the keyboard (i opens inventory; establish the
   select/confirm key contract from app/ code, not guesswork).
2. Improve the policy in e2e/browser-bot.ts:
   - Raise the retreat threshold (e.g. disengage at <= 0.6 when the
     adjacent enemy count >= 2, <= 0.5 otherwise) and verify the retreat
     branch actually fires (it may be dead code — diagnose).
   - Heal: if a healing item is in inventory and HP is low, use it (via the
     inventory key contract you established).
   - Disengage: the goal is the stairs, not clearing floors — when not
     cornered, prefer routing to stairs over fighting; fight only blockers.
   - Avoid: do not path adjacent to enemies when an equally short safe
     route exists.
3. If the bot still cannot plausibly survive middle-band rooms with optimal
   play (e.g. unavoidable corridor enemy that out-damages it), say so in
   the report with numbers (enemy damage vs player HP/heals available) —
   that is a BALANCE finding for the orchestrator, not yours to fix.
   Do NOT touch engine balance numbers.
4. Handle the LOSS terminal state in the spec/bot cleanly: on LOSS, dump
   diagnostics with reason "run lost" including the floor/turn, so failed
   campaigns stay debuggable.

## OWNED FILES
- e2e/browser-bot.ts, e2e/full-clear.spec.ts
Forbidden: src/engine, content/, app/ (read-only for contracts).

## DONE = paste actual command output with explicit exit codes
- `pnpm run typecheck` → exit 0; `pnpm run lint` → exit 0
- Report: why the old retreat branch failed, the inventory key contract,
  policy changes made, and any balance finding per task 3.

## ESTIMATE / TIMEBOX
Estimate 20 min. Timebox 40 min.
