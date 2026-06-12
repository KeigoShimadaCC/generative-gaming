# Balance 01 Report

Date: 2026-06-12

Scope: PHASE-58 data-only balance pass on fallback full-run bot batches, before
PHASE-57 golden regeneration. Final config is unchanged because the batch exposed
a non-config simulation blocker.

## Commands

- `npm_config_cache=/private/tmp/gg-npm-cache pnpm run simulate -- --batch --policies cautious,balanced,aggressive --seeds 15 --max-turns 8000 --out runs/milestones/balance-01/baseline-quick.json`
- `npm_config_cache=/private/tmp/gg-npm-cache npx --yes tsx runs/milestones/balance-01/batch-analysis.ts --label=baseline`

The first command uses the canonical simulator CLI. The npm cache override avoids
the already documented root-owned `~/.npm` EPERM issue.

## Iteration Summary

| iteration | config change | reason | WIN | ABORT | LOSS | balanced WIN% | Shallows HP retention median | shallow deaths f1-2 | result |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| baseline | none | Measure M0 target on full-run fallback batch | 0/45 | 45/45 | 0/45 | 0 | 100 | 0 | misses WIN and HP targets |
| 1 | skipped | Enemy actor turns have no behavior effects; config cannot make unwired enemies attack | - | - | - | - | - | - | unchanged best |
| 2 | skipped | Same blocker; tuning regen/spawn/enemy stats would not affect zero incoming damage | - | - | - | - | - | - | unchanged best |
| 3 | skipped | Same blocker; bot Hoard search gap is policy/harness behavior, not a tuning value | - | - | - | - | - | - | unchanged best |

Targets:

- Balanced-bot WIN rate: target >=20%, observed 0%.
- Shallows HP retention: target 55-90, observed 100.
- No Shallows bot deaths on floors 1-2: target 0, observed 0.

## Baseline By Policy

| policy | runs | WIN | ABORT | LOSS | max-turn hits | median hp% | avg turns | avg kills | avg item uses | player damage | enemy actor turns | enemy behavior events |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| cautious | 15 | 0 | 15 | 0 | 0 | 100 | 524.3 | 9.3 | 0 | 0 | 16572 | 0 |
| balanced | 15 | 0 | 15 | 0 | 0 | 100 | 592.6 | 16 | 0.8 | 0 | 15378 | 0 |
| aggressive | 15 | 0 | 15 | 0 | 0 | 100 | 558.1 | 20.1 | 0 | 0 | 12653 | 0 |

## Survival Curve

| depth | reached | terminal here | avg turns on depth | player damage on Shallows depths |
|---:|---:|---:|---:|---:|
| 1 | 45 | 0 | 37.3 | 0 |
| 2 | 45 | 4 | 53.3 | 0 |
| 3 | 41 | 1 | 44.3 | 0 |
| 4 | 40 | 0 | 53.7 | 0 |
| 5 | 40 | 2 | 58.1 | 0 |
| 6 | 38 | 1 | 55.1 | 0 |
| 7 | 37 | 1 | 57.4 | 0 |
| 8 | 36 | 1 | 64.3 | 0 |
| 9 | 35 | 9 | 76.5 | 0 |
| 10 | 26 | 2 | 73 | 0 |
| 11 | 24 | 3 | 80.7 | 0 |
| 12 | 21 | 21 | 84.9 | 0 |

Depth-12 reach by policy: cautious 9/15, balanced 9/15, aggressive 3/15. All
depth-12 runs ABORTED; none hit the 8000-turn cap.

## Diagnosis

The 100% HP retention is not caused by enemy stat weakness, natural regen, or
consumable healing. The baseline produced 44,603 `actor_turn` events for enemies,
but 0 `enemy_moved`, 0 `enemy_waited`, 0 `enemy_ability_used`, and 0 enemy
`attack_hit` events against the player. In current bot/replay wiring, enemy actor
turns are emitted but no behavior actor hook is passed to `stepRun`, so enemies do
not act in these simulations.

No config-only change can make HP retention enter the 55-90 band while enemy
behavior effects are absent. Raising spawn budgets, changing enemy cost weights,
or slowing regen would still produce zero incoming damage in this harness path.

The no-WIN result has two causes:

- Non-config blocker: the same idle-enemy harness lets bots kill or avoid threats
  without pressure, invalidating balance conclusions.
- Bot-drive gap: the policies take the Hoard if visible, but only path toward the
  Hoard after it is known through fog/feature memory. Final-floor runs commonly
  reach depth 12, fail to discover the Hoard before the policy floor budget, and
  ABORT.

## End State

Final config: unchanged.

Honest target status: not met. This pass stops before config tuning because the
observed blocker is outside `src/config/**`. Tuning values now would bake in
numbers against a simulation path where enemies never act.

Backlog for the orchestrator:

- Wire the bot/replay simulation path to the existing deterministic enemy behavior
  actor hook, then rerun PHASE-58 batches before tuning.
- Improve final-floor bot Hoard drive: explore/search for unknown Hoard locations
  on depth 12 instead of only moving toward already visible/remembered Hoard
  features.
