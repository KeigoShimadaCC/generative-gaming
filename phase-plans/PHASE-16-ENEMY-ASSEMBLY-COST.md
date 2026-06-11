# PHASE-16 — Enemy Assembly & Cost Function

## 1. Objective
Enemies assemble from schema data (stats + behaviors + abilities), and the deterministic cost function prices any enemy for budget enforcement.

## 2. Context
GAME_DESIGN §9.1 (band stat budgets, spawn budgets, "fairness as arithmetic"); NORTH_STAR §3 (budget enforcement outside the model).

## 3. Dependencies
15A, 15B.

## 4. Scope IN
- `src/engine/enemies/`: assembly from schema definition → live entity; the cost function (stats + behavior costs + ability costs → points, pinned constants in config); band-budget validation helpers (consumed by Gate 1 and floor gen); XP yield from cost.
- Cost-function characterization tests: a table of reference enemies with expected costs (the table becomes the regression anchor).

## 5. Scope OUT
- Floor placement (17). Old Stock content (26). Gate enforcement (33).

## 6. Owned files
`src/engine/enemies/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Assembly + cost function + reference table tests | enemies/** | Codex | 20m / 40m | — |
| 2 | verify | Cost monotonicity audit: more stats/behaviors/abilities never costs less; band budgets reject over-cost rosters | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · monotonicity property test · reference-table snapshot.

## 9. Completion criteria
1. Reference enemies cost exactly their table values (regression anchor in place).
2. Cost is monotonic in every input (property test).
3. 13B's transform TODO resolved against the real cost function.
4. Acceptance bar: Gate 1 can answer "is this roster affordable?" with one function call.

## 10. Risks & escalation
Cost constants are balance-critical [T] values — put them in config, expect 58 (balance pass) to move them; design for that.
