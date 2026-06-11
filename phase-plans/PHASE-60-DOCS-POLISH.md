# PHASE-60 — README, ADRs, Docs Polish

## 1. Objective
The repo reads as open-sourceable: thesis-led README, ADRs for the load-bearing decisions, accurate setup, honest scope notes.

## 2. Context
Reference precedent (the 30-minute polish block was "the phase that determines whether the repo reads as open-sourceable"); NORTH_STAR (thesis source); doc spine as ADR raw material.

## 3. Dependencies
56. Parallel with 59.

## 4. Scope IN
- `README.md`: the north-star thesis in 60 seconds, demo GIF placeholder + through-line, architecture overview (two layers + gauntlet diagram in ASCII), setup (clone → install → play offline; key → AI mode), eval suite explanation, doc-spine map, honest cuts/trade-offs.
- `docs/adr/`: ~6 ADRs (~100 words each): schema-as-physics; vocabulary-composition-over-content; plain-TS-over-engines (agent operability); prefetch-and-fallback latency design; evals-as-merge-gates; orchestrator/worker development model.
- Hygiene sweep: dead code, stray TODOs, console noise, `.env.example` accuracy, LICENSE (MIT unless human says otherwise — confirm at dispatch).

## 5. Scope OUT
- Doc-spine rewrites (they're the source, not the target). Marketing site. Changelog automation.

## 6. Owned files
`README.md`, `docs/adr/**`, `LICENSE`, hygiene edits (sweep list approved by orchestrator before edits).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | README | README.md | Codex | 15m / 30m | 59 |
| 2 | implement | ADRs + LICENSE | docs/adr/**, LICENSE | Cursor | 15m / 30m | task 1 |
| 3 | implement | Hygiene sweep (approved list) | per list | Cursor | 10m / 20m | tasks 1–2 |
| 4 | verify | Fresh-eyes pass: follow README setup verbatim on a clean clone; flag any inaccuracy | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
Clean-clone README walkthrough (offline play reached) · `pnpm run check`.

## 9. Completion criteria
1. A stranger reaches offline play following README alone (verifier did).
2. ADRs cover the six decisions, ~100 words each, context/decision/consequence.
3. Hygiene list fully executed; check green.
4. Acceptance bar: the repo itself is a deliverable — NORTH_STAR's "repo is the deliverable" reference lineage honored.

## 10. Risks & escalation
README thesis wording is taste — human reviews before merge (it's the project's public face).
