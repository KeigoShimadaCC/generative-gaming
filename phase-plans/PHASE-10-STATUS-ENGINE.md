# PHASE-10 — Status Effects Engine

## 1. Objective
All 10 statuses with exact tick semantics, stacking rules, and the 4-concurrent cap — filling the end-of-turn tick hook.

## 2. Context
GAME_DESIGN §6 (the closed list, durations, stacking); §3 (tick order); schemas from 05.

## 3. Dependencies
07B (tick hooks). Parallel with 09.

## 4. Scope IN
- `src/engine/systems/status.ts`: apply/refresh (no magnitude stacking), expiry, haste/slow cancellation, max-4 oldest-falls-off, per-status tick effects (poison floor at 1 HP, burn can kill, regen, etc.), action-gating statuses (stun skip, slow/haste scheduling, confusion redirect, blind FOV radius override).
- Log events per application, tick, expiry.

## 5. Scope OUT
- No sources of statuses (items/abilities arrive via 13A/14). No new statuses ever (closed list).

## 6. Owned files
`src/engine/systems/status.ts` (+ test file).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Apply/refresh/expiry/cap + per-status semantics + tests per status | status.ts | Codex | 25m / 50m | 09 |
| 2 | verify | Table-driven audit: one test per GAME_DESIGN §6 row, semantics match doc text | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · per-status test table in verifier report.

## 9. Completion criteria
1. All 10 statuses implemented with doc-exact semantics; nothing else (grep for stray status ids).
2. Stacking/cancel/cap rules test-proven.
3. Poison cannot reduce HP below 1; burn can kill (explicit tests — these are fairness rules).
4. Acceptance bar: items and abilities can apply any status with zero status-specific code outside this file.

## 10. Risks & escalation
Slow/haste turn-scheduling interacts with 07B's loop — coordinate via the frozen hook interface; if it can't express every-other-turn, stop and report.
