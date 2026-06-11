# PHASE-49B — HUD & Message Log

## 1. Objective
The glanceable HUD (depth/turn/HP/statuses/resources with change pulses) and the message log (last ~6 lines, full history one keypress away).

## 2. Context
UX §1 (HUD/log specs), §3 (log discipline: ordered discrete lines), §10 (log = selectable plain text, never lies); 22's formatter is the text source — the web log renders the same strings.

## 3. Dependencies
48. Parallel with 49A.

## 4. Scope IN
- `app/components/hud/`: stat display, status chips, HP bar+number, changed-this-turn pulse driven by event metadata (11's flags).
- `app/components/log/`: rolling window, full-history overlay (keybinding wired in 50; component + toggle prop here), turn-grouped rendering in engine event order, selectable text.

## 5. Scope OUT
- Input handling (50). Context panel (51A/B). Log *content* (22 owns text).

## 6. Owned files
`app/components/hud/**`, `app/components/log/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | HUD + pulses | hud/** | Cursor | 15m / 30m | 49A, task 2 |
| 2 | implement | Log window + history overlay + ordering | log/** | Cursor | 15m / 30m | task 1 |
| 3 | verify | Fixture-event sequences render in exact engine order; pulses fire on change only; history overlay complete | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · component tests with fixture event streams · screenshots.

## 9. Completion criteria
1. Log renders 22's strings verbatim, in order, grouped by turn (test).
2. HUD pulses on changes only (test).
3. Acceptance bar: UX's "log answers what just happened" verifiable by replaying a fixture turn and reading the panel.

## 10. Risks & escalation
Two Cursor tasks in one folder pair — sequence them (1 then 2) or split per component folder strictly; no shared file edits.
