# PHASE-21 — Run Loop, Caps, Win/Loss, the Hoard

## 1. Objective
A complete run exists: 12 floors of descent, soft-cap boredom pressure, the Hoard on the final floor, and all three endings.

## 2. Context
GAME_DESIGN §2 (run structure, caps); WORLD §1 (win = take one thing back), §8 (depth bands); NORTH_STAR §4.1.

## 3. Dependencies
17, 20. Parallel with 22.

## 4. Scope IN
- `src/engine/run/`: floor progression (descend action → next floor from provided params/content), band derivation from depth, per-floor soft cap → escalating reinforcement spawns (from current roster, budget-bounded), run hard cap (07B enforces; this phase wires the config), floor-12 Hoard: a take-one-thing interaction → WIN.
- Run summary data structure (depth, turns, kills, discoveries — feeds diary later).
- Content injection interface: the run loop *receives* floor content (fallback pack or Director) — it never selects content itself.

## 5. Scope OUT
- Content selection (26/38). Diary rendering (54A). Cross-run memory (27/44).

## 6. Owned files
`src/engine/run/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Progression + bands + caps + reinforcements + tests | run/loop.ts | Codex | 20m / 40m | 22 |
| 2 | implement | Hoard interaction + endings + run summary + tests | run/endings.ts | Codex (same session) | 10m / 20m | — |
| 3 | verify | Scripted full-run fixtures reach WIN, LOSS, ABORTED; soft cap spawns within budget; hard cap terminates | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · three-endings fixture suite.

## 9. Completion criteria
1. A scripted agent can descend 12 floors and WIN (test).
2. Soft-cap reinforcements appear on schedule, within budget (test).
3. All terminal states reachable and correctly summarized (tests).
4. Acceptance bar: with placeholder content, the game is structurally complete end-to-end — M0's spine.

## 10. Risks & escalation
The content-injection interface shape matters to 26 and 38 — freeze it early in the session and record it in PROGRESS.md.
