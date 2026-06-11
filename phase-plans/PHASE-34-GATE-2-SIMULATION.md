# PHASE-34 — Gate 2: Simulated Playability

## 1. Objective
No floor reaches the player unproven: the bot ensemble plays every candidate floor pre-serve, judged against the band thresholds.

## 2. Context
GAME_DESIGN §11 (ensemble spec: 3 policies × 5 seeds, thresholds, hard rejects incl. zero-threat floors); NORTH_STAR §5; 24's bots; 17's structural guarantees (Gate 2 judges content only).

## 3. Dependencies
24, 30. Parallel with 33.

## 4. Scope IN
- `src/gauntlet/gate2/`: candidate-floor materialization (manifest + floorgen → playable floor in an isolated engine instance), ensemble execution (config-driven policy×seed matrix), metric extraction (clear rate, HP retention median, solvability of quest objectives, threat presence), threshold judgment per band from config, gate report (same format as 33).
- Performance budget: full ensemble within the UX 8s prefetch window's simulation share (config; parallelizable seeds if needed but deterministic results).

## 5. Scope OUT
- Quality judgment (45/46). Threshold *tuning* (58). Repair (36).

## 6. Owned files
`src/gauntlet/gate2/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Materialization + ensemble runner + metrics + tests | gate2/run.ts | Codex | 25m / 50m | 33 |
| 2 | implement | Threshold judgment + report + tests (fixture floors engineered to pass/fail each rule) | gate2/judge.ts | Codex (same session) | 15m / 30m | — |
| 3 | verify | Engineered fixtures: unwinnable floor rejected, zero-threat floor rejected, fair floor passes; wall-clock within budget; determinism (same candidate → same verdict) | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · engineered-fixture suite · timed gate run.

## 9. Completion criteria
1. Each §11 threshold and hard-reject rule has a fixture proving it fires (tests).
2. Verdicts deterministic for identical candidates (test).
3. Ensemble wall-clock within config budget on fixture floors (timed test).
4. Acceptance bar: "the player never sees a broken floor" now has its mechanism; fairness is measured, not asserted.

## 10. Risks & escalation
Simulation cost is the latency risk for the whole prefetch design — if budget can't be met, report with timings; orchestrator decides (fewer seeds vs threshold change = doc edit).
