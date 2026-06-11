# PHASE-12 — Inventory & Equipment

## 1. Objective
Slots, stacking, pickup/drop, and the equip layer that feeds derived ATK/DEF.

## 2. Context
GAME_DESIGN §4 (16 slots, stack-to-5, 1 weapon/1 armor/2 charms), §8 (categories).

## 3. Dependencies
06. Parallel with 11.

## 4. Scope IN
- `src/engine/systems/inventory.ts`: slot management, stacking rules, pickup (g)/drop, full-inventory handling (typed error), ground-item placement.
- Equipment: equip/unequip, stat contribution interface (consumed by 09's derived stats), charm passive hook registration (effects wired in 13A/14).
- Log events for pickup/drop/equip.

## 5. Scope OUT
- No item *effects* (13A/B), no identification (14), no curses (14), no barter (19).

## 6. Owned files
`src/engine/systems/inventory.ts` (+ test file).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Slots/stacking/pickup/drop + tests | inventory.ts | Codex | 15m / 30m | 11 |
| 2 | implement | Equip layer + stat contribution + tests | inventory.ts (same session) | Codex | 10m / 20m | — |
| 3 | verify | Invariant re-run: item conservation (nothing duplicates/vanishes) across 1k random seeded inventory ops | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · item-conservation property test.

## 9. Completion criteria
1. Slot/stack/equip rules match config (tests).
2. Item conservation property holds (test).
3. Equip changes derived stats visibly in combat tests (integration spot-check).
4. Acceptance bar: 14 can attach effects/identification to items without touching slot logic.

## 10. Risks & escalation
Stacking identity (when are two items "identical"?) — use schema-level definition equality; ambiguity → report.
