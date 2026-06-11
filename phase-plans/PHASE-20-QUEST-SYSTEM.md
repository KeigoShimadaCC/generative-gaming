# PHASE-20 — Quest System

## 1. Objective
The 6 quest objective types as engine machinery: offer, accept/refuse, track, complete, reward — with refusal remembered.

## 2. Context
GAME_DESIGN §10 (objective list [HARD], one active per band, max 3 per run, completable in-run, reward bounds); WORLD §9 (archetypes are fiction; objectives are mechanics).

## 3. Dependencies
19.

## 4. Scope IN
- `src/engine/quests/`: quest state machine (offered → accepted/refused → active → completed/failed), the 6 objective evaluators (fetch, kill, reach, deliver, escort, constraint — constraint via engine flags like damage-taken-this-floor), reward payout per §8 rules, quest log state for UI, refusal recorded as a run-memory event.
- Escort: ward NPC follows player (reuses approach behavior toward player), reaches stairs = complete.

## 5. Scope OUT
- Quest *content* (26/Director). Cross-run memory storage (27/44) — this phase only emits the events.

## 6. Owned files
`src/engine/quests/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | State machine + offer/accept/refuse + rewards + tests | quests/machine.ts | Codex | 15m / 30m | — |
| 2 | implement | 6 objective evaluators + tests per type | quests/objectives.ts | Codex (same session) | 20m / 40m | — |
| 3 | verify | Per-objective scenario fixtures complete and pay out; refusal emits memory event; >3 quests per run impossible | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · per-objective scenario tests.

## 9. Completion criteria
1. Each objective type completable on a fixture floor (test per type).
2. Caps (one per band active, 3 per run) enforced (tests).
3. Rewards within §8 bounds, paid in things/knowledge/coin only (test).
4. Refusal and completion both emit memory events (test).
5. Acceptance bar: the Director can express every WORLD §9 archetype as data over these six objectives.

## 10. Risks & escalation
Escort pathing through hostile floors can soft-lock — ward must never block the player's tile; fixture this. Edge ambiguity → report.
