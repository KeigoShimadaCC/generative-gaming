# PHASE-41 — Eval Runner CLI & Reports

## 1. Objective
One command runs the eval suite: persona bank → Director (mock or live) → gauntlet → scored report, written as a comparable artifact.

## 2. Context
NORTH_STAR §5 (the suite's shape); TECH_SPEC §8 (eval runner row); 40A bank, 40B scorers, 36 pipeline.

## 3. Dependencies
40A, 40B.

## 4. Scope IN
- `src/evals/runner/`: matrix execution (personas × bands × N generations), mock and live modes, progress/cost guard in live mode (config cap on total tokens — abort over budget), report writer (`runs/evals/<eval-id>/report.json` + readable summary) including config snapshot + model ids for comparability, comparison helper (two reports → delta table).
- `pnpm run evals` script.

## 5. Scope OUT
- CI wiring/thresholds (43). Novelty/responsiveness wiring (42 adds onto this). Prompt tuning.

## 6. Owned files
`src/evals/runner/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Matrix runner + modes + cost guard + tests (mocked) | runner/run.ts | Codex | 20m / 40m | — |
| 2 | implement | Report writer + comparison helper + tests | runner/report.ts | Cursor | 10m / 20m | task 1 |
| 3 | verify | Full mocked eval run end-to-end; cost guard trips on injected overage; two-report comparison correct on fixtures | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · `pnpm run evals -- --mode mock` full pass · comparison fixture test.

## 9. Completion criteria
1. Mocked eval run produces a complete scored report (smoke).
2. Live mode's cost guard provably aborts at the cap (test).
3. Reports carry everything needed for cross-report comparison (config, models, bank version) (test).
4. Acceptance bar: "a model/prompt change is an eval run" (NORTH_STAR §8) is now one command.

## 10. Risks & escalation
Live eval cost scales fast (personas × bands × N × repairs) — the guard is [HARD] behavior; default N small, human raises it deliberately.
