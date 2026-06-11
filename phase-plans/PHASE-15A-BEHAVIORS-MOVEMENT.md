# PHASE-15A — Behavior Interpreter I: Movement-Class

## 1. Objective
The 6 movement-class behaviors: approach_melee, keep_range, flee_low_hp, territorial, guard, patrol.

## 2. Context
GAME_DESIGN §9.2 (semantics table); 07A pathfinding; 08 movement system.

## 3. Dependencies
08, 09. Parallel with 15B (disjoint files).

## 4. Scope IN
- `src/engine/behaviors/movement.ts`: one evaluator per behavior; behavior composition (1–3 per enemy, priority resolution: first behavior whose condition fires acts — order is the enemy's schema order); shared perception helpers (player visible? distance? HP fraction?) in `behaviors/perception.ts` (frozen early for 15B).
- Deterministic decisions via the `ai` RNG substream.

## 5. Scope OUT
- Special-class behaviors (15B). Abilities/cooldowns (15B). Enemy stats/cost (16).

## 6. Owned files
`src/engine/behaviors/movement.ts`, `src/engine/behaviors/perception.ts` (+ tests).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Perception helpers (frozen first 15 min, published) + tests | perception.ts | Codex | 10m / 20m | — |
| 2 | implement | 6 evaluators + composition/priority + tests per behavior | movement.ts | Codex (same session) | 25m / 50m | 15B after task 1 |
| 3 | verify | Scenario fixtures: each behavior produces its §9.2 sentence on a hand-built map (e.g., flee_low_hp turns at threshold) | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · per-behavior scenario test outputs.

## 9. Completion criteria
1. Each behavior's one-line semantics from GAME_DESIGN §9.2 demonstrably true on a fixture (test per row).
2. Composition priority = schema order (test).
3. Two identical seeds → identical enemy decisions across 500 turns (determinism test).
4. Acceptance bar: 16 can assemble an enemy from any 1–3 of these and predict its behavior from the doc alone.

## 10. Risks & escalation
Perception helper shape is the 15A/15B coupling point — freeze and publish first, same protocol as 13A's registry.
