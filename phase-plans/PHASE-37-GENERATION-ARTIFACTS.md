# PHASE-37 — Generation Artifact Persistence

## 1. Objective
Every Director generation becomes a permanent, inspectable artifact: manifests in, gates passed, repairs attempted, fallbacks used, usage stats — the audit trail behind the magic.

## 2. Context
NORTH_STAR §4.6 (artifacts invariant), §6.7 (artifact viewer demo beat); TECH_SPEC §5 (flat files, stamping, append-only); 36's attempt chains; 31's usage capture.

## 3. Dependencies
23A (run-id/layout conventions), 30. Parallel with 36.

## 4. Scope IN
- `src/harness/artifacts/`: writer for generation records under `runs/<run-id>/floors/<n>/` — attempt chain (each manifest JSON + gate report), final outcome (served manifest or fallback id), usage (tokens, latency, model id), stamps; an index file per run for cheap listing.
- Reader API shaped for the artifact viewer (54B) and evals (41): list runs, list floors, load chain.

## 5. Scope OUT
- The viewer UI (54B). Eval scoring (40B). Trace recording (23A owns gameplay).

## 6. Owned files
`src/harness/artifacts/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Writer + layout + stamps + index + tests | artifacts/write.ts | Codex | 15m / 30m | 36 |
| 2 | implement | Reader API + tests | artifacts/read.ts | Cursor | 10m / 20m | task 1 |
| 3 | verify | Round-trip: a mocked 36 chain written then read back identical; stamps complete per TECH_SPEC §5 list | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · round-trip test · stamp-completeness assertion.

## 9. Completion criteria
1. A full attempt chain round-trips losslessly (test).
2. Every artifact carries the complete TECH_SPEC §5 stamp set (test).
3. Reader lists/loads without scanning file contents (index works) (test).
4. Acceptance bar: the demo's "machinery behind the magic" view has its data layer; nothing about a generation is unrecoverable.

## 10. Risks & escalation
Artifacts are append-only evidence — the writer must refuse overwrites of existing records (test it).
