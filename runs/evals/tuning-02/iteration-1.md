# Tuning 02 Iteration 1

## Hypothesis

The usable baseline showed the prompt was preserving validity by over-constraining
content: exactly 2 approach-melee enemies, exactly 4 items, `traps:[]`,
`npcs:[]`, and `quest:null`. That blocked the revised detectors for hoarder,
pacifist, completionist, and chaos.

Iteration 1 added trace-keyed responsiveness targets to `src/director/prompt/blocks.ts`
while keeping low-cost stats and default-safe schema guidance.

## Verification

| Step | Command | Result |
|---|---|---|
| Prompt sanity | `pnpm exec vitest run src/director/prompt/blocks.test.ts src/director/prompt/assemble.test.ts -u` | pass; 2 snapshots updated |
| Mock sanity | `pnpm run evals -- --mode mock --n 1 --eval-id tuning-02-iteration-1-mock` | complete; 15 records; validity 66.67%; solvability 66.67%; fallback 33.33% |
| Ambient eval | `pnpm run evals -- --mode ambient --n 1 --eval-id tuning-02-iteration-1` with temporary writable `CODEX_HOME` | complete; 15 records; validity 93.33%; solvability 93.33%; fallback 6.67% |

## Delta Versus Usable Baseline

Baseline: `runs/evals/tuning-02-baseline-envfix/report.json`
Candidate: `runs/evals/tuning-02-iteration-1/report.json`

| Metric | Baseline | Iteration 1 | Delta |
|---|---:|---:|---:|
| Validity | 100% | 93.33% | -6.67 pp |
| Solvability | 86.67% | 93.33% | +6.67 pp |
| Served without fallback | 86.67% | 93.33% | +6.67 pp |
| Fallback | 13.33% | 6.67% | -6.67 pp |
| Same-persona responsiveness | 5.13% | 54.76% | +49.63 pp |
| Cross-persona responsiveness | 7.05% | 17.86% | +10.81 pp |
| Responsiveness samples | 13 | 14 | +1 |

Target check: same-persona >= 50% and cross-persona <= half same-persona.
Iteration 1 passes the target: 54.76% same, 17.86% cross, half same is 27.38%.

Regression check: validity regressed by one cell. The failed cell was
`lowest:speedrunner`; the model incorrectly blended completionist NPC/quest
content into a speedrunner floor and emitted invalid NPC/quest shapes
(`choices[].text` instead of `choices[].label`, missing `closesDialogue`, missing
quest reward `valueMultiplier`, and extra `description`/`giverNpcId` fields).

## Cell Deltas

| Cell | Baseline Same | Iteration Same | Baseline Cross | Iteration Cross | Served |
|---|---:|---:|---:|---:|---:|
| shallows:hoarder | 0% | 100% | 6.25% | 6.25% | 100% |
| middle:hoarder | 0% | 100% | 6.25% | 6.25% | 100% |
| lowest:hoarder | 0% | 100% | 6.25% | 6.25% | 100% |
| shallows:pacifist | 0% | 66.67% | 8.33% | 8.33% | 100% |
| middle:pacifist | 0% | 100% | 8.33% | 8.33% | 100% |
| lowest:pacifist | 0% | 100% | 8.33% | 0% | 100% |
| shallows:speedrunner | 33.33% | 100% | 6.25% | 6.25% | 100% |
| middle:speedrunner | 33.33% | 100% | 6.25% | 6.25% | 100% |
| lowest:speedrunner | fallback | fallback | fallback | fallback | 0% |
| shallows:completionist | 0% | 0% | 6.25% | 31.25% | 100% |
| middle:completionist | 0% | 0% | 6.25% | 31.25% | 100% |
| lowest:completionist | 0% | 0% | 6.25% | 31.25% | 100% |
| shallows:chaos | 0% | 0% | 8.33% | 25% | 100% |
| middle:chaos | fallback | 0% | fallback | 50% | 100% |
| lowest:chaos | 0% | 0% | 8.33% | 33.33% | 100% |

## Stop Decision

Stopped after iteration 1. The responsiveness target was met, but the iteration
also regressed validity, so the cap was not used for further attempts.
