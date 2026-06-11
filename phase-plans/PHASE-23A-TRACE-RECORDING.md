# PHASE-23A — Trace Recording

## 1. Objective
Every run produces an NDJSON trace artifact: actions, events, state hashes per turn, fully stamped — the project's primary evidence format.

## 2. Context
TECH_SPEC §5 (artifact rules, stamping: protocol/engine version, model id, seed, timestamps); NORTH_STAR §4.6.

## 3. Dependencies
21. Parallel with 23B (disjoint files).

## 4. Scope IN
- `src/harness/trace/`: recorder wrapping the engine contract (subscribe to step), NDJSON line per turn (action, events, state hash), header line (full stamp), file layout under `runs/<run-id>/trace.ndjson`, run-id scheme.
- State hashing (stable serialization → hash) for replay verification.

## 5. Scope OUT
- Replay (23B). SQLite (27). Director artifacts (37).

## 6. Owned files
`src/harness/trace/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Recorder + NDJSON format + stamping + hashing + tests | trace/** | Codex | 20m / 40m | 23B |
| 2 | verify | Record a fixture run; every line parses; stamp complete; hash stable across re-serialization | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · fixture-run trace inspection (parse + stamp assertions).

## 9. Completion criteria
1. A recorded fixture run yields a parseable, stamped trace (test).
2. State hash deterministic (test).
3. Recording overhead does not alter game outcomes (same-seed with/without recorder → identical final hash) (test).
4. Acceptance bar: 23B can replay and verify from the trace alone; evals can score from it.

## 10. Risks & escalation
The recorder must be a pure observer — any recorder-induced state divergence is a hard fail; the with/without test is the guard.
