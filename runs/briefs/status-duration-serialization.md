# BRIEF: status-duration serialization crash — authoring minimums wrongly applied to decayed runtime state

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- Use `npm_config_cache=/private/tmp/gg-npm-cache` for npx/tsx invocations.
- The tree has UNCOMMITTED bot-policy kit-usage changes in src/harness/bots/**
  — do NOT touch src/harness/bots/** or e2e/**. Your fix must compose with them.

## BRANCH ASSIGNMENT (orchestrator authority)
Work directly on the `main` working tree. NO git commits, NO branches.

## EVIDENCE
Two independent workers hit the same crash once runs last longer:
- `player.statuses[0].duration: burn duration must be at least 2`
  (simulate batch, exit 1)
- `entities.enemy#6.statuses[0].duration: slow duration must be at least 3`
  (src/harness/bots/bots.test.ts 30-run batch)
Repro: `npm_config_cache=/private/tmp/gg-npm-cache pnpm run simulate -- --batch --policies balanced --seeds 15 --max-turns 8000 --out /tmp/x.json` → exit 1 with the burn error.

## ROOT-CAUSE HYPOTHESIS (verify)
A Zod schema with AUTHORING minimums (a Director-manifest vocabulary rule:
"a burn you author must last ≥2") is being reused to validate RUNTIME
state (trace/persistence serialization), where durations legitimately tick
down to 1 and 0 before expiry. Authoring bounds belong to the Director
content boundary; decayed runtime state is engine-owned and must allow the
full decay range.

## OBJECTIVE
Long runs with statuses serialize cleanly: the authoring schema keeps its
minimums; runtime state validation accepts decayed durations (down to 0 or
the expiry convention the engine actually uses).

## TASKS
1. Locate the schema reuse (status duration bounds) and the
   serialization/validation call sites that apply it to runtime state.
2. Split or derive a runtime-state variant (e.g. duration ≥ 0) without
   weakening the Director-facing authoring schema. Smallest correct cut.
3. Regression test: a status ticks from its minimum authoring duration to
   expiry across turns, with trace serialization validated each turn.
4. Confirm the repro batch passes: paste the 15-seed balanced batch table
   (this will also show the pending kit-usage policy improvements — paste
   whatever it shows; do not tune anything).

## OWNED FILES
- src/schemas/** (split/derive only — no loosening of authoring bounds),
  src/engine status/serialization files, src/harness trace/persistence
  validation call sites (NOT src/harness/bots/**), tests alongside.
Forbidden: src/harness/bots/**, e2e/**, content/, GAME_DESIGN.md.

## DONE = paste outputs with exit codes
- `pnpm run check` → exit 0.
- The batch repro now exit 0 + its table.
- Report: where the reuse was, what you split, why authoring bounds are
  intact (cite the unchanged lines).

## ESTIMATE / TIMEBOX
Estimate 20 min. Timebox 40 min.
