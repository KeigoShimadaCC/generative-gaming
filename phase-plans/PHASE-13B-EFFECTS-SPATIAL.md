# PHASE-13B — Effect Interpreter II: Spatial & Meta Verbs

## 1. Objective
The interpreter for the 8 spatial/meta verbs: teleport_self, teleport_target, blink, knockback, reveal, summon, transform, dig.

## 2. Context
GAME_DESIGN §7 (verb rows: summon from floor roster only, transform ≤ equal budget cost, dig 1–5 line); 07A map utilities.

## 3. Dependencies
10, 12; registry interface from 13A (frozen early). Parallel with 13A.

## 4. Scope IN
- `src/engine/effects/spatial.ts`: executors for the 8 verbs; targeting geometry helpers (bolt line, burst radius, floor) shared onward to 14; walkable-cell selection via seeded RNG substream; knockback collision damage; dig respecting map bounds and never breaching the outer wall.
- Summon pulls only from the current floor's roster; transform swaps within budget cost (cost function arrives in 16 — until then, use the schema-declared cost field with a TODO-linked test).

## 5. Scope OUT
- Core verbs (13A). Trap wiring (18). Enemy ability cooldowns (15B).

## 6. Owned files
`src/engine/effects/spatial.ts`, `src/engine/effects/geometry.ts` (+ tests).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Geometry helpers (bolt/burst/floor) + tests | geometry.ts | Cursor | 15m / 30m | 13A |
| 2 | implement | 8 verb executors + tests per verb | spatial.ts | Codex | 25m / 50m | after 1 |
| 3 | verify | Audit: dig wall-breach impossible; summon roster-only; teleport lands on walkable cells across 1k seeded executions | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · 1k-execution placement property test.

## 9. Completion criteria
1. All 8 verbs doc-exact (test per verb).
2. Teleport/blink/summon always land on legal cells; dig never breaches outer walls (property tests).
3. Geometry helpers exported and consumed by tests as 14 will consume them.
4. Acceptance bar: every targeting shape in GAME_DESIGN §7 is computable from geometry.ts alone.

## 10. Risks & escalation
Transform-before-cost-function ordering: if the schema cost field proves insufficient, report — do not invent a cost formula (16 owns it).
