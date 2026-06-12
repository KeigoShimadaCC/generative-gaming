# BRIEF: PHASE-58 real balance calibration — hit the pre-registered band targets

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- No Chromium/Playwright in your sandbox. CLI simulate works in-sandbox.
- Use `npm_config_cache=/private/tmp/gg-npm-cache` for any npx/tsx invocation
  (root-owned npm cache EPERM otherwise).
- Do NOT touch e2e/** (uncommitted bot work pending elsewhere).

## BRANCH ASSIGNMENT (orchestrator authority)
Work directly on the `main` working tree. NO git commits, NO branches.

## CONTEXT — why now
Enemy behavior hooks are default-on in every run path as of this merge.
First honest data: balanced policy × 5 seeds on fallback content = 5/5
LOSS at depths 3–6 with hp 0; browser bot died at depth 5 twice. Gate 2's
ensemble now clears shallows but fails middle/lowest fixtures. The game is
overtuned band-wide.

## AUTHORITY (frozen contract — GAME_DESIGN.md §11, do not edit it)
| Band | Clear rate (ensemble 3 policies × 5 seeds) | Median HP retention | Hard rejects |
|---|---|---|---|
| Shallows | ≥ 95% | 55–90% | any bot death floors 1–2 |
| Middle | ≥ 85% | 30–75% | clear < 60% |
| Lowest | ≥ 70% | 15–60% | clear < 40% |
Also: no zero-threat floors below depth 2; tune within Gate 1 [HARD] tables.

## OBJECTIVE
The fallback pack and band stat tables produce ensemble outcomes inside the
GAME_DESIGN §11 targets, measured by the real simulate batch.

## LEVERS (in preference order — smallest hammer first)
1. Enemy stats per band (damage, HP) in the engine band tables / fallback
   pack entity stats.
2. Player sustain: healing item potency/frequency in the fallback pack,
   starting HP / level-up HP gain.
3. Spawn budgets per band (fewer simultaneous threats).
Do NOT change: Gate 2 thresholds, GAME_DESIGN.md targets, schema bounds
(unless a [HARD] table value itself is the lever — flag it in the report).

## TASKS
1. Baseline: run the full batch and paste the table:
   `pnpm run simulate -- --batch --policies cautious,balanced,aggressive --seeds 15 --max-turns 8000 --out /tmp/balance-baseline.json`
2. Diagnose the dominant kill pressure from traces (which band, 1v1 vs
   swarm, damage-per-engagement vs heals available). Numbers, not vibes.
3. Tune levers iteratively; after each iteration rerun the batch (5 seeds
   while iterating is fine; final evidence must be the full 15-seed batch).
4. Final acceptance (paste all):
   - Full 45-run batch table: WIN appears for ≥1 policy, LOSS/ABORT mix
     consistent with §11 (bots are not players; treat the band clear-rate
     spirit: shallows rarely lethal, middle survivable, lowest hard).
   - Gate 2 fixture ensemble: shallows/middle/lowest fixtures pass their
     band thresholds: `pnpm exec vitest run src/gauntlet`.
   - `pnpm run check` → exit 0 (regenerate goldens/eval banks if traces
     changed, via the existing generators).
   - Determinism audit + golden suite → exit 0.
5. Report: every number changed (before → after), the resulting batch
   distribution, and any target you could NOT hit with the allowed levers
   (escalate, do not improvise new levers).

## OWNED FILES
- content/** (fallback pack), src/engine band/stat config tables,
  tests/golden + eval-bank regenerated outputs, Gate 2 fixture updates if
  stats are embedded in fixtures.
Forbidden: GAME_DESIGN.md, Gate 2 threshold config, e2e/**, src/director.

## DONE = pasted outputs with exit codes per task 4.

## ESTIMATE / TIMEBOX
Estimate 45 min. Timebox 90 min. STOP and report if a §11 target is
unreachable within the levers.
