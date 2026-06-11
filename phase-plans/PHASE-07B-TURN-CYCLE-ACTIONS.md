# PHASE-07B — Turn Cycle, Structured Actions, Terminal States

## 1. Objective
The stable game contract: `start / getAvailableActions / step / isTerminal`, the strict turn order, and explicit terminal states.

## 2. Context
NORTH_STAR §4.1–4.2 (finite, structured actions); GAME_DESIGN §3 (turn cycle, tick order); TECH_SPEC §2 (engine contract consumed by UI, CLI, bots alike).

## 3. Dependencies
06. Parallel with 07A.

## 4. Scope IN
- `src/engine/turn/`: action type definitions (move/attack/use/pickup/talk/wait/descend/inspect — payloads typed from schemas), action legality checking, available-actions enumeration.
- Turn loop: player action → actors in stable id order → end-of-turn ticks in GAME_DESIGN §3's fixed order (DoT → durations → hunger → regen). Tick hooks are no-op stubs that later phases (10, 11) fill — hook interface frozen here.
- Terminal states WIN/LOSS/ABORTED + run hard-cap enforcement (config).
- Invalid actions return typed errors, never throw, never advance the turn.

## 5. Scope OUT
- No combat/status/hunger logic (stubs only). No specific action *effects* beyond wait/abort (others land with their systems).

## 6. Owned files
`src/engine/turn/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Action types + legality + enumeration + tests | src/engine/turn/actions.ts | Codex | 15m / 30m | 07A |
| 2 | implement | Turn loop + tick hook interface + terminal states + tests | src/engine/turn/loop.ts | Codex (same session) | 20m / 40m | — |
| 3 | verify | Contract test: invalid action no-ops; hard cap terminates; actor order stable | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · contract test suite output.

## 9. Completion criteria
1. The five-method engine contract exists, typed, with tests for each method.
2. Invalid actions: typed error, zero state change (test).
3. Hard cap forces a terminal state (test); all three terminal states reachable in tests.
4. Acceptance bar: bots (PHASE-24) and the UI (PHASE-50) can be written against this interface without reading engine internals.

## 10. Risks & escalation
The tick-hook interface is load-bearing for phases 10/11 — if it feels wrong mid-build, stop and report rather than reshaping it unilaterally.
