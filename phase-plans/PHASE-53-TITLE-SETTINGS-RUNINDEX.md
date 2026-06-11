# PHASE-53 — Title Screen, Settings, Run Index

## 1. Objective
The frame around the game: minimal title (continue / new run / run index / settings), one-screen settings, and the browsable run history.

## 2. Context
UX §8 (title minimal, settings list, death-to-new-run <10s); 27's run index; WORLD §2 (the Last Lantern frames this space — light styling only).

## 3. Dependencies
48. Parallel with 52.

## 4. Scope IN
- `app/components/title/`: title screen + new-run flow (seed display, one keypress to descend), continue (active run resume from store/persistence).
- `app/components/settings/`: glyph size, color theme, message speed, auto-travel toggles, hint-kill switch, keybinding *view* (no rebinding MVP).
- `app/components/runindex/`: run list from 27 (outcome, depth, date), per-run: open diary (54A's component slot — stub link now), open replay (trace playback through the same grid — read-only stepping).

## 5. Scope OUT
- Diary content (54A). Artifact viewer (54B). Accounts/cloud anything.

## 6. Owned files
`app/components/title/**`, `app/components/settings/**`, `app/components/runindex/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Title + new/continue flow | title/** | Cursor | 15m / 30m | 52 |
| 2 | implement | Settings (wired to real toggles) | settings/** | Cursor | 10m / 20m | task 1 |
| 3 | implement | Run index + replay stepping | runindex/** | Codex | 20m / 40m | tasks 1–2 |
| 4 | verify | Death-to-moving-on-floor-1 timed <10s; settings persist; a finished run replays turn-by-turn in the grid | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · timed death-to-new-run measurement · replay-in-grid smoke.

## 9. Completion criteria
1. The <10s death-to-new-run number measured and met.
2. Settings apply live and persist across reload (tests).
3. Past runs replayable in the real grid UI (smoke).
4. Acceptance bar: UX §8 holds end-to-end; the meta loop (die → diary → again) has its frame.

## 10. Risks & escalation
Replay-in-grid reuses 23B + 49A — read-only adapter; if it wants engine changes, report instead.
