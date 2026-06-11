# PHASE-08 — Movement & Collision

## 1. Objective
Actors move on the grid under one rule set: walkability, occupancy, bump semantics (move-into = attack/talk/swap-never).

## 2. Context
UX §2 (move-into verbs); GAME_DESIGN §3 (8-way movement); 07A walkability.

## 3. Dependencies
07A, 07B.

## 4. Scope IN
- `src/engine/systems/movement.ts`: move resolution (terrain + occupancy), bump routing (enemy → attack intent, NPC → talk intent, returned to the turn loop as derived action), door handling, stairs-step detection event.
- Position invariant: one actor per tile, enforced and tested.

## 5. Scope OUT
- No combat resolution (09 consumes the attack intent). No auto-travel/auto-repeat (UI concern, PHASE-50). No traps (18).

## 6. Owned files
`src/engine/systems/movement.ts` (+ test file).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Move/bump resolution + occupancy invariant + tests | movement.ts | Codex | 20m / 40m | — |
| 2 | verify | Property test re-run: no two actors ever share a tile across 1k random seeded turns | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · 1k-turn occupancy property test.

## 9. Completion criteria
1. Bump-routing returns the right derived intent per target type (tests).
2. Occupancy invariant holds across randomized seeded simulation (property test).
3. Acceptance bar: behaviors (15A/B) can express movement purely via this system.

## 10. Risks & escalation
Diagonal corner-cutting rules: GAME_DESIGN excludes facing/diagonal-blocking — keep diagonals fully allowed; doubts → report.
