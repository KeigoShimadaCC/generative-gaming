# PHASE-47 — Responsiveness Tuning Round (Eval-Driven)

## 1. Objective
Close the loop once, properly: measure responsiveness/novelty on live evals, improve the prompt/summarizer against the numbers, prove the improvement, re-baseline.

## 2. Context
NORTH_STAR §10-M2 (persona-distinct content, measured); 42's metrics; 41's comparison helper; the whole point of "a prompt change is an eval run".

## 3. Dependencies
42, 44, 45, 46.

## 4. Scope IN
- Baseline live eval run (current prompts, all personas, config N).
- Up to 3 tuning iterations: hypothesis (from per-persona metric weaknesses) → prompt/summarizer change in owned files → mocked sanity → live eval → comparison report. Each iteration is one worker round-trip with its own evidence.
- Final: improved baseline committed (43's procedure), iteration history written to `runs/evals/tuning-01/`.

## 5. Scope OUT
- Metric definition changes (42 is fixed during tuning — moving targets invalidate the round). Engine/gate changes. More than 3 iterations (further rounds = new phase, human decides).

## 6. Owned files
`src/director/prompt/**` (tuning edits), `runs/evals/tuning-01/**`, `tests/eval-baselines/**` (final re-baseline only).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Baseline live run + weakness analysis memo | runs/evals/tuning-01/** | Codex | 15m / 30m | — |
| 2 | implement | Iterations 1–3 (each: change + mocked sanity + live + compare) | prompt/**, tuning-01/** | Codex | 30m / 60m | — |
| 3 | verify | Audit the comparison chain: each claimed improvement is in the reports; no metric regressed beyond threshold; baselines updated per procedure | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run evals -- --mode live` (keyed, cost-guarded) · comparison reports · `pnpm run check`.

## 9. Completion criteria
1. Responsiveness hit-rate improved vs baseline with no solvability/validity regression (comparison report).
2. Iteration history complete and honest (including failed hypotheses).
3. New baseline committed deliberately.
4. Acceptance bar: M2's measured-distinctness bar met or the gap precisely quantified for the human.

## 10. Risks & escalation
Tuning can thrash — the 3-iteration cap is hard. If iteration 1 *regresses*, stop and report rather than burning the remaining two on recovery.
