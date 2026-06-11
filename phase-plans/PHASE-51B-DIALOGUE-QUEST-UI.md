# PHASE-51B — Dialogue & Quest Log UI

## 1. Objective
Talking and questing in the browser: NPC dialogue as a panel mode with numbered replies, and the quest log with grid markers.

## 2. Context
UX §5 (dialogue not-a-cutscene, 2–5 numbered replies, Esc anywhere, paused while talking; quest checklist + on-floor markers, never-silent updates); 19/20 engine mechanics.

## 3. Dependencies
50; frame.tsx from 51A task 1. Parallel with 51A (tasks 2+).

## 4. Scope IN
- `app/components/panels/dialogue/`: NPC card header, dialogue text, numbered reply list (number keys + arrows), barter view (buy/sell lists with prices, coin balance), exit-anywhere.
- `app/components/panels/quest/`: objective checklist with where/what hints, completed section, reward display; grid marker overlay for on-floor objectives (coordinates from quest state); log-line + HUD-chip pulse on quest state changes.

## 5. Scope OUT
- Dialogue content. Inspect/inventory (51A). Quest mechanics (20).

## 6. Owned files
`app/components/panels/dialogue/**`, `app/components/panels/quest/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Dialogue panel + replies + barter | dialogue/** | Codex | 20m / 40m | 51A |
| 2 | implement | Quest log + markers + pulses | quest/** | Cursor | 15m / 30m | task 1 |
| 3 | verify | Fixture conversation walked by number keys end-to-end; barter updates coin/inventory live; quest marker tracks objective; no silent quest transitions (every change has log+chip) | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · fixture conversation/quest tests · screenshots.

## 9. Completion criteria
1. Full dialogue tree walkable with keys only; Esc exits anywhere (tests).
2. Barter reflects engine pricing live (test).
3. Quest changes always announced (test asserts log+chip per transition).
4. Acceptance bar: the UX §5 interaction model works against pure fixture data — Director content will drop in untouched.

## 10. Risks & escalation
World-paused-while-talking must hold (engine turn doesn't advance) — integration-test it; a ticking world during dialogue is a fairness bug.
