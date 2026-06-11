# PHASE-11 — Player Systems: XP, Leveling, Fullness, Regen

## 1. Objective
The player's growth-and-survival loop: XP→levels, hunger drain, starvation, natural regen.

## 2. Context
GAME_DESIGN §4 (all values from config); §3 (tick order: hunger then regen).

## 3. Dependencies
09 (XP events), 10 (tick conventions). Parallel with 12.

## 4. Scope IN
- `src/engine/systems/player.ts`: XP accumulation → level-up (HP/ATK/DEF growth per config, cap 12), fullness drain per config interval, starvation damage at 0, overfeed cap 200, natural regen gated on fullness > 0.
- Level-up and starvation log events; HUD-changed flags for UX pulse (event metadata only).

## 5. Scope OUT
- No food items (14). No death handling (09 owns HP-zero → terminal via 07B). No meta-progression (hard exclusion).

## 6. Owned files
`src/engine/systems/player.ts` (+ test file).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | XP/level + fullness/starvation + regen + tests | player.ts | Codex | 20m / 40m | 12 |
| 2 | verify | Simulation re-run: idle player starves and dies at the turn count config predicts (closed-form check) | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · starvation closed-form simulation test.

## 9. Completion criteria
1. Level curve, growth, caps match config (tests).
2. Starvation timeline matches closed-form prediction from config values (test).
3. Regen halts at fullness 0 (test).
4. Acceptance bar: GAME_DESIGN §4's "walking is healing, hunger makes it expensive" rhythm is mechanically real and demonstrable in a logged simulation.

## 10. Risks & escalation
Off-by-one in tick intervals is the classic bug here — closed-form test is mandatory, not optional.
