# PHASE-27 — SQLite Persistence

## 1. Objective
Profiles, run index, and run-memory events survive restarts — the durable half of the data model.

## 2. Context
TECH_SPEC §5 (SQLite for live structured state; thin repository, raw SQL, no ORM); WORLD §7 (cross-run memory is diegetic); 20/21's memory events.

## 3. Dependencies
23A. Parallel with 26.

## 4. Scope IN
- `src/harness/persistence/`: connection + migration (versioned schema file), repositories: profile (one local player), run index (id, stamp, outcome, summary, trace path), memory events (run-scoped + profile-scoped: deaths, deeds, refusals, completions), read API shaped for prompt assembly (44 consumes).
- Test isolation: in-memory/temp DB for tests — **never** the dev DB (a reference-project hotfix was exactly this bug).

## 5. Scope OUT
- Director memory *content* (44). UI run index (53). Auth/accounts (none, ever — MVP).

## 6. Owned files
`src/harness/persistence/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Connection + migrations + repositories + tests (temp DB) | persistence/** | Codex | 25m / 50m | 26 |
| 2 | verify | Restart simulation: write, close, reopen, read-back identical; `pnpm test` provably never touches the dev DB path | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · restart round-trip test · dev-DB-untouched assertion.

## 9. Completion criteria
1. Round-trip across simulated restart (test).
2. Memory events queryable by profile and recency (test).
3. Tests run on isolated DBs (mechanically asserted).
4. Acceptance bar: 44 can build "what the dungeon remembers" from the read API alone.

## 10. Risks & escalation
Migration discipline from day one (versioned, forward-only); schema doubts → report, the read-API shape is contract surface for Wave F.
