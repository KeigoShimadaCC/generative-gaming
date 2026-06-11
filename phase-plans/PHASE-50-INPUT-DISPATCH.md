# PHASE-50 — Keyboard Input & Action Dispatch

## 1. Objective
The keyboard owns the game: UX §2's full keymap driving structured actions through the store, with the auto-travel convention and inline confirms.

## 2. Context
UX §2 (keymap, rules 1–4: one-frame response, explained illegality, inline confirms, flat menus), §3 (auto-repeat with notable-stops); 07B's action interface.

## 3. Dependencies
49A.

## 4. Scope IN
- `app/input/`: key handler (arrows/WASD/vi, g i q x . > ? Tab Enter Esc), action construction + dispatch to engine via store, illegal-action log feedback (typed errors → log lines), inline y/n confirm flow for dangerous turns, auto-travel (hold/again = repeat move, stop on notable: enemy sighted, item underfoot, HP threshold — config), keymap overlay (?).
- Mouse: click-to-move/inspect (secondary, minimal).

## 5. Scope OUT
- Panel-mode inputs beyond opening them (51A/B own in-panel navigation). Rebinding (settings, 53).

## 6. Owned files
`app/input/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Keymap + dispatch + illegal feedback + confirms | input/keys.ts | Codex | 20m / 40m | — |
| 2 | implement | Auto-travel + notable-stops + keymap overlay + click handling | input/travel.ts, overlay | Codex (same session) | 15m / 30m | — |
| 3 | verify | Scripted key-event suite: every UX §2 key produces its action; travel stops on each notable; confirm intercepts dangerous moves | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · key-event simulation suite · manual 20-turn play smoke in dev.

## 9. Completion criteria
1. Every UX §2 binding works (test per key).
2. Travel stops on all notable conditions (tests).
3. Input-to-render within frame budget (49A's harness reused).
4. Acceptance bar: a roguelike player is fluent in sixty seconds — human plays a floor at close (taste checkpoint).

## 10. Risks & escalation
Focus management (panel open vs grid) is the classic web-game bug — single input-owner pattern; verifier tests keys while a panel is open.
