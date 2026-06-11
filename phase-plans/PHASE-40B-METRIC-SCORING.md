# PHASE-40B — Metric Scoring Library

## 1. Objective
The pure scoring functions for the core eval metrics: validity, solvability, difficulty-band accuracy, latency, cost — computed from artifacts, no API calls.

## 2. Context
NORTH_STAR §5 (offline suite metric list); GAME_DESIGN §11 (band targets); 37's artifact reader; 34's gate metrics.

## 3. Dependencies
34. Parallel with 40A.

## 4. Scope IN
- `src/evals/metrics/`: per-generation scorers — validity (gates 0–1 outcome), solvability (gate 2 outcome + metrics), band accuracy (ensemble results vs §11 targets), repair/fallback rates, latency, token cost; aggregation across a generation set (rates, medians, distributions); typed report structure.
- Fixture-based tests: hand-built artifact sets with known expected scores.

## 5. Scope OUT
- Novelty/responsiveness (42 — they need their own design care). The runner (41). Threshold enforcement (43).

## 6. Owned files
`src/evals/metrics/**` (except novelty/responsiveness files reserved for 42).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Per-generation scorers + aggregation + report type + tests | metrics/core.ts | Codex | 25m / 50m | 40A |
| 2 | verify | Known-score fixture audit: every scorer reproduces hand-computed values exactly | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · known-score fixture tests.

## 9. Completion criteria
1. Every NORTH_STAR §5 core metric has a scorer with hand-verified fixture tests.
2. Scorers are pure (artifacts in, numbers out — no I/O beyond the reader) (grep check).
3. Acceptance bar: 41 composes these without writing any scoring logic of its own.

## 10. Risks & escalation
Metric definitions are quasi-contractual (CI gates depend on them) — definition ambiguity → report for a doc decision, don't pick silently.
