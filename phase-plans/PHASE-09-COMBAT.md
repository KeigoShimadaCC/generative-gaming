# PHASE-09 — Combat Resolution

## 1. Objective
The one damage formula, melee and bolt attacks, death handling, and XP yield — fully log-evented.

## 2. Context
GAME_DESIGN §5 (formula, 95% hit, no crits), §9.1 (XP yield); UX §3 (one log line per resolution).

## 3. Dependencies
08. Parallel with 10.

## 4. Scope IN
- `src/engine/systems/combat.ts`: `max(1, ATK−DEF) × 0.85–1.15 seeded`, hit roll, derived ATK/DEF aggregation (base + equipment + buffs — reads stat hooks, doesn't own them), bolt attacks via 07A line-of-sight, death → entity removal + XP event, kill-credit rules.
- Log events for every resolution (attacker, defender, damage, result).

## 5. Scope OUT
- No status application (10 owns; weapon procs arrive in 14). No player leveling consumption of XP (11). No enemy AI (15A/B).

## 6. Owned files
`src/engine/systems/combat.ts` (+ test file).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Formula + melee/bolt + death/XP + log events + tests | combat.ts | Codex | 20m / 40m | 10 |
| 2 | verify | Statistical test re-run: damage distribution within variance band over 10k seeded rolls; min damage 1 | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · variance-band statistical test.

## 9. Completion criteria
1. Formula matches GAME_DESIGN §5 exactly (spot tests + distribution test).
2. Every resolution emits exactly one log event (test).
3. Death removes entity, yields XP event, drops carried loot (thief case ready) (tests).
4. Acceptance bar: changing a combat number means changing config, nothing here.

## 10. Risks & escalation
Variance must come from a named RNG substream (`combat`) — cross-system sequence pollution is the bug class to fear; verifier checks stream usage.
