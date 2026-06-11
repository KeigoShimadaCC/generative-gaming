# PHASE-56 — M2 Integration & Milestone Smoke

## 1. Objective
Prove NORTH_STAR milestone M2: in the browser, across a full run, the dungeon measurably reads the player — memory, narration, diary, artifacts all live.

## 2. Context
NORTH_STAR §10-M2 (persona-distinct content, band holds, diary narrates correctly, run-to-run memory); Waves F+G complete; 47's eval numbers.

## 3. Dependencies
All of Waves F and G (44–55).

## 4. Scope IN
- `tests/integration/m2.test.ts`: mocked browser-loop assertions (memory block present in run-2 prompts; diary faithful; transition budgets).
- Live milestone session: two consecutive live runs by a human in the browser — second run must open with recognition; UX latency numbers captured from 52's instrumentation; eval suite (47's baseline) green.
- Milestone report under `runs/milestones/m2/`.

## 5. Scope OUT
- New features. Tuning (47 done; 58 next). M3 polish items.

## 6. Owned files
`tests/integration/m2*`, `runs/milestones/m2/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Integration assertions + report assembly | tests/integration/m2*, milestones | Codex | 20m / 40m | — |
| 2 | verify | Independent re-run: integration suite, eval baseline check, latency numbers vs UX §10 | — (read-only) | Cursor | 15m / 20m | — |
| 3 | integrate | Orchestrator: merge; human plays the two-run live session; acceptance; rotate | — | orchestrator + human | 30m / 45m | — |

## 8. Verification commands
`pnpm run check` · m2 suite · `pnpm run evals` vs baseline · human two-run session.

## 9. Completion criteria
1. Integration suite green; eval baseline green; latency within UX §10.
2. The human's second live run demonstrably references the first (screenshot/diary evidence in the report).
3. Human accepts M2 (validation log).
4. Acceptance bar: NORTH_STAR M2 sentence true with evidence links — "it reads you" is now the product, not the plan.

## 10. Risks & escalation
If the live session *feels* unresponsive despite green metrics, that's the most important possible finding — record it verbatim for 58/59; do not argue with the human's felt experience.
