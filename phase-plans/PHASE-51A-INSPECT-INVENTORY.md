# PHASE-51A — Inspect Cards & Inventory Panel

## 1. Objective
Total inspectability in the UI: the x-cursor entity cards (known vs unknown), hover cards, and the inventory panel with item actions.

## 2. Context
UX §4 (the whole section: cards, identify-by-use display, witnessed enemy facts), §2 (flat menus); 14's identification state; engine's witnessed-facts tracking.

## 3. Dependencies
50. Parallel with 51B (disjoint folders).

## 4. Scope IN
- `app/components/panels/inspect/`: x-mode cursor on the grid, entity cards (glyph, name, descriptor, known stats, "unidentified: effect unknown" lines, accumulated witnessed facts for enemies), hover-card parity.
- `app/components/panels/inventory/`: 16-slot view, stack badges, item cards on selection, contextual actions (quaff/read/throw/equip/drop — flat list, disabled-with-reason per UX §2.2), equipment slots display.
- Context-panel mode switching (one mode visible — the panel frame itself).

## 5. Scope OUT
- Dialogue/quest panels (51B). Identification logic (engine owns; UI displays).

## 6. Owned files
`app/components/panels/inspect/**`, `app/components/panels/inventory/**`, `app/components/panels/frame.tsx`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Panel frame + mode switching | frame.tsx | Cursor | 10m / 20m | 51B waits on this file only |
| 2 | implement | Inspect mode + cards + hover | inspect/** | Codex | 20m / 40m | 51B |
| 3 | implement | Inventory + actions + equipment | inventory/** | Cursor | 15m / 30m | task 2 |
| 4 | verify | Card truthfulness audit: unknown item shows exactly what's unknown; witnessed facts appear only after witnessing (fixture sequence); disabled actions show reasons | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · fixture card tests · screenshots.

## 9. Completion criteria
1. "Surprised by content, never by rules": every fixture entity's card shows all engine-known, player-witnessed info in ≤2 keypresses (audit).
2. Unknown/known item display matches identification state exactly (tests).
3. All item actions work and explain their disabled states (tests).
4. Acceptance bar: the UX §4 contract is demonstrably true in the browser.

## 10. Risks & escalation
Card *content* leaking unwitnessed stats is the integrity bug — fixture sequence test is mandatory.
