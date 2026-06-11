# PHASE-25A — CLI: Human Terminal Play

## 1. Objective
A human can play a full run in the terminal — the permanent reference client.

## 2. Context
TECH_SPEC §2 (headless CLI before UI, reference client forever); UX §2 (keys; terminal adaptation acceptable).

## 3. Dependencies
22, 23A. Parallel with 25B.

## 4. Scope IN
- `src/cli/play.ts`: raw-mode keyboard input mapped to structured actions (arrows/WASD, g/i/q/x/./>/?, Enter/Esc), render-per-turn via 22, inventory/inspect as numbered text menus, trace recording on by default, run summary at end.
- `pnpm run play` script.

## 5. Scope OUT
- Simulate/batch (25B). Colors/mouse. Web UI anything.

## 6. Owned files
`src/cli/play.ts` (+ minimal input util).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Input loop + menus + wiring + script | cli/play.ts | Codex | 25m / 50m | 25B |
| 2 | verify | Scripted-stdin session: 50 keystrokes drive a fixture run, output matches expected beats, trace written | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · scripted-stdin smoke (`pnpm run play` fed a keystroke file).

## 9. Completion criteria
1. Full fixture run playable by keystrokes start → terminal state (scripted smoke).
2. Every UX-listed verb reachable from the keyboard (checklist in verifier report).
3. Trace recorded and replayable (cross-check with 23B).
4. Acceptance bar: the orchestrator's M0 behavioral smoke can be performed by a human in this CLI.

## 10. Risks & escalation
Raw-mode terminal quirks (macOS) → keep input handling minimal; fancy TUI is out of scope.
