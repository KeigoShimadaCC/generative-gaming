# PHASE-22 — ASCII Renderer & Log Events

## 1. Objective
`render(state) → string`: the headless text view of any game state, plus the canonical log-event-to-text formatting layer.

## 2. Context
TECH_SPEC §2 (CLI is the reference client); UX §1 (grid/HUD/log structure), §10 ("the log never lies"); NORTH_STAR §4 (text-first).

## 3. Dependencies
07A. Parallel with 21.

## 4. Scope IN
- `src/engine/render/`: ASCII grid (glyph per entity, fog three-state via shading chars), text HUD line (HP, depth, turn, fullness, statuses), message formatting for every log event type emitted by phases 08–21 (one terse line each, complete coverage).
- Golden render snapshots for fixture states.

## 5. Scope OUT
- Web UI (Wave G). Color (terminal codes optional, off by default). Interactive input (25A).

## 6. Owned files
`src/engine/render/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Grid + HUD render + snapshots | render/grid.ts | Codex | 15m / 30m | 21 |
| 2 | implement | Log formatter with exhaustive event coverage (type-level exhaustiveness check) | render/log.ts | Cursor | 15m / 30m | task 1 |
| 3 | verify | Exhaustiveness proof (compiler-enforced switch); snapshot stability across two runs | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · snapshot tests · exhaustiveness compile check.

## 9. Completion criteria
1. Every log event type has a formatter (compile-time exhaustive — adding an event without text fails the build).
2. Same state → identical render string (test).
3. Acceptance bar: a human reading only render output can reconstruct what happened — verifier plays 20 scripted turns and confirms the narrative is followable.

## 10. Risks & escalation
"The log never lies and never omits" is a UX invariant — the compile-time exhaustiveness check is the mechanism; don't weaken it to ship.
