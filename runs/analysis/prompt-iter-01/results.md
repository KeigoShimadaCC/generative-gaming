# Prompt Iteration 01 Results

Date: 2026-06-12
Task: close ambient validity gap for M1 heartbeat fallback

## Artifact Chain

Searched `runs/` for generation records, heartbeat/M1 artifacts, manifests, gate
reports, and raw attempt outputs. No persisted M1 heartbeat generation record
directories were present in this worktree. The only relevant historical raw
outputs were the committed Phase 29 ambient spike files:

- `runs/spikes/29-ambient-director/attempts/host-1-stdout.txt`
- `runs/spikes/29-ambient-director/attempts/host-2-stdout.txt`
- `runs/spikes/29-ambient-director/attempts/host-3-stdout.txt`

Per brief, I ran one fresh real ambient `generateManifest` baseline through the
provider seam before prompt edits. Artifacts:

- `runs/analysis/prompt-iter-01/baseline/attempt-1/raw.txt`
- `runs/analysis/prompt-iter-01/baseline/attempt-1/gate0.json`
- `runs/analysis/prompt-iter-01/baseline/results.json`

## Forensics

Heartbeat summary from the brief: `0/3` served without fallback; all three
attempts failed `G0_SCHEMA`.

Fresh baseline with the current pre-edit prompt:

| Sample | Gate 0 | Gate 1 | Gate 0+1 |
|---|---:|---:|---:|
| Baseline ambient attempt | FAIL `G0_SCHEMA` | not run | 0/1 |

Actual baseline Zod paths grouped by root cause:

| Root cause | Paths and messages |
|---|---|
| Missing behavior payload parameter | `$.roster[3].behaviors[0].fleeLowHp.thresholdPercent`: expected number, got undefined |
| Wrong effect payload spelling | `$.items[2].food.effect.effects[0].nutrition.fullness`: expected number, got undefined; `$.items[2].food.effect.effects[0].nutrition`: unrecognized `amount` |
| Wrong effect enum/payload | `$.items[4].tool.effect.effects[0].reveal.target`: expected `map|items|enemies|traps`; `$.items[4].tool.effect.effects[0].reveal`: unrecognized `radiusTiles` |
| Incomplete identify payload | `$.items[5].note.effect.effects[0].identify.mode`: expected `carried_item|category`; `carriedItemId` and `category`: expected string, got undefined |
| Trap shape | `$.traps[0].hidden`: expected true, got false |
| Invalid status payload | `$.traps[1].effectBundle.effects[0].applyStatus.status`: invalid `sleep`; `duration`: expected number, got undefined; unrecognized `turns` |

Historical Phase 29 fixture errors remained the old envelope/shape class:
missing `protocolVersion`, missing `metadata`, omitted `placementHint`, missing
behavior params (`allyCount`, `wakeRadiusTiles`, `radiusTiles`,
`cooldownTurns`), missing `use.charges`, and invented `note.text`.

## Hardening

Round 1 prompt change:

- Added a validity-first recipe: exact 4 safe item categories
  (`weapon`, `armor`, `food`, `coin`), `traps:[]`, `npcs:[]`, `quest:null`.
- Added explicit behavior/effect payload cookbook for the observed failures:
  `fleeLowHp.thresholdPercent`, `nutrition.fullness`, `reveal.target`,
  `identify.mode/carriedItemId/category`, `applyStatus.status/duration`,
  `hidden:true`.
- Removed the full all-category item example and trap example from the normal
  field-shape manifest.

Round 1 measurement:

| Attempt | Band/depth | Gate 0 | Gate 1 | Result |
|---:|---|---:|---:|---|
| 1 | shallows/3 | PASS | FAIL `G1_ROSTER_BUDGET` cost 22 > 20 | fail |
| 2 | shallows/4 | PASS | FAIL `G1_ROSTER_BUDGET` cost 27 > 20 | fail |
| 3 | middle/6 | PASS | FAIL `G1_ROSTER_BUDGET` cost 51 > 45 | fail |
| 4 | middle/8 | PASS | FAIL `G1_ROSTER_BUDGET` cost 51 > 45 | fail |
| 5 | lowest/10 | PASS | FAIL `G1_ROSTER_BUDGET` cost 85 > 70 | fail |

Round 1 rate: `5/5` Gate 0, `0/5` Gate 0+1. This required the second and final
hardening round allowed by the brief.

Round 2 prompt change:

- Further reduced the live validity recipe to exactly 2 roster entries.
- Required `approach_melee` only, `abilities:[]`, and exact minimum band stats
  instead of arbitrary in-range stats.
- Kept the strict 4-item safe subset and empty trap/NPC/quest recipe.

Round 2 measurement:

| Attempt | Band/depth | Gate 0 | Gate 1 | Roster cost | Result |
|---:|---|---:|---:|---:|---|
| 1 | shallows/3 | PASS | PASS | 4 / 20 | pass |
| 2 | shallows/4 | PASS | PASS | 4 / 20 | pass |
| 3 | middle/6 | PASS | PASS | 10 / 45 | pass |
| 4 | middle/8 | PASS | PASS | 10 / 45 | pass |
| 5 | lowest/10 | PASS | PASS | 18 / 70 | pass |

Round 2 rate: `5/5` Gate 0, `5/5` Gate 0+1. Target `>=4/5` met.

Raw artifacts:

- `runs/analysis/prompt-iter-01/round1/results.json`
- `runs/analysis/prompt-iter-01/round2/results.json`
- `runs/analysis/prompt-iter-01/round2/attempt-*/raw.txt`
- `runs/analysis/prompt-iter-01/round2/attempt-*/gate0.json`
- `runs/analysis/prompt-iter-01/round2/attempt-*/gate1.json`

## Verification

Commands run:

- `pnpm exec vitest run src/director/prompt -u` -> 3 files, 12 tests passed;
  prompt snapshots updated deliberately.
- `pnpm exec eslint src/director/prompt` -> passed.
- `pnpm exec vitest run src/director/prompt` -> 3 files, 12 tests passed.
- `pnpm run check` -> typecheck passed, lint passed, 67 test files passed;
  473 tests passed, 1 skipped.

## Residual Risk

The prompt is now intentionally conservative for live validity: two low-cost
approach-melee enemies, four safe items, no traps/NPCs/quest. This closes the
Gate 0/1 ambient validity gap but reduces content richness and does not measure
Gate 2 playability.

Actual time: ~70m vs 40m estimate. Overrun drivers: missing heartbeat artifacts,
one fresh baseline live call, two live five-attempt rounds, and scratch build
work needed for the measurement harness.
