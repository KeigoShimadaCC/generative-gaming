# PHASE-28 — M0 Integration & Milestone Smoke

## 1. Objective
Prove NORTH_STAR milestone M0: a complete, finite, seeded, fully-offline game playable headless and by hand — then get human acceptance.

## 2. Context
NORTH_STAR §10 (M0); all Wave B/C phases; PHASE-00 (milestone gates end with behavioral smoke + human acceptance).

## 3. Dependencies
All of Waves B and C (06–27).

## 4. Scope IN
- `tests/integration/m0.test.ts`: full-run integration suite — bot full runs on fallback pack across seeds; determinism (same seed twice → identical traces); offline assertion (no network modules imported in the gameplay path — mechanical check); golden seeds refreshed and committed.
- Fix-forward round-trips for anything the suite exposes (returned to owning-phase workers).
- Orchestrated behavioral smoke: a human-driven CLI run (the human plays 3+ floors) — scheduled with the user.

## 5. Scope OUT
- Any new feature. Any Director work. Balance tuning beyond "completable".

## 6. Owned files
`tests/integration/**`, `tests/golden/**` (refresh only).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Integration suite + offline assertion + golden refresh | tests/integration/** | Codex | 20m / 40m | — |
| 2 | verify | Independent full re-run of suite + 3×10 bot batch + one scripted CLI session | — (read-only) | Cursor | 15m / 20m | — |
| 3 | integrate | Orchestrator: merge, run smoke with human, milestone report, PROGRESS rotation | — | orchestrator | 15m / 30m | — |

## 8. Verification commands
`pnpm run check` · integration suite · `pnpm run simulate -- --batch` · human CLI session.

## 9. Completion criteria
1. Integration suite green; determinism test green; offline assertion green.
2. 30/30 bot runs terminate cleanly on the fallback pack.
3. Human plays the CLI and accepts M0 (recorded in PROGRESS.md validation log).
4. Acceptance bar: NORTH_STAR M0 sentence is true, with evidence links.

## 10. Risks & escalation
This phase ships zero features — its temptation is drive-by fixing. Everything found goes back to owning-phase workers as round-trips; integration worker touches only tests/.
