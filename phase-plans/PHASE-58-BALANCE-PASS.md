# PHASE-58 — Balance Pass (Eval-Driven Tuning)

## 1. Objective
Tune the [T] numbers — combat pace, hunger pressure, economy, budgets, thresholds — against bot data and human feel, config-only.

## 2. Context
GAME_DESIGN (every [T] is built for this moment); 56's felt-experience findings; 25B's batch tooling; 41's evals.

## 3. Dependencies
56. Parallel with 57.

## 4. Scope IN
- Data gathering: large bot batches (3 policies × 25 seeds × bands) → survival curves, turn economies, item-usage rates; comparison against GAME_DESIGN §11 intent and 56's human notes.
- Up to 3 tuning iterations: config changes only (src/config) → batch re-run → delta analysis; human plays one run per iteration (feel check).
- Final config + a balance report (`runs/milestones/balance-01/`) documenting every changed value and its evidence.

## 5. Scope OUT
- Formula/vocabulary/schema changes (doc-governed — out). Golden re-baselining (57 owns; coordinate at close since config changes alter outcomes — sequence: 58 finishes, then 57's goldens regenerate. Orchestrator schedules accordingly).

## 6. Owned files
`src/config/**` (tuning), `runs/milestones/balance-01/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Batch data gathering + analysis memo | balance-01/** | Codex | 15m / 30m | 57 task 2 |
| 2 | implement | Iterations 1–3 (config + batch + delta + human feel check each) | src/config/**, balance-01/** | Codex | 30m / 60m | — |
| 3 | verify | Audit: every changed value evidenced in the report; eval suite still green; no [HARD] value touched | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run simulate -- --batch` · `pnpm run evals` · config diff vs report audit.

## 9. Completion criteria
1. Band thresholds (GAME_DESIGN §11) hit on the final config's batch data.
2. Human feel-check sign-off per iteration (validation log).
3. Zero [HARD] values changed; zero non-config files touched (audit).
4. Acceptance bar: the game is fun-shaped by evidence, and every number's reason is written down.

## 10. Risks & escalation
Balance is taste-adjacent — the human's feel verdict outranks the curves when they conflict; record both, tune toward feel, stop at 3 iterations.
