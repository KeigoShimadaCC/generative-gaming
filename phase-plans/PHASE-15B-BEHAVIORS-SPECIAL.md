# PHASE-15B — Behavior Interpreter II: Special-Class

## 1. Objective
The 6 special-class behaviors: pack_hunter, ambusher, thief, caster, bodyguard, mimic — plus the ability/cooldown machinery.

## 2. Context
GAME_DESIGN §9.2 (semantics), §9 (abilities = effect bundles + cooldown 3–6); 13A/B interpreter executes the ability payloads.

## 3. Dependencies
08, 09; perception helpers from 15A (frozen early). Parallel with 15A.

## 4. Scope IN
- `src/engine/behaviors/special.ts`: the 6 evaluators; ability slots (0–2) with cooldown tracking; thief steal-and-flee + drop-on-death (joins 09's loot hook); mimic disguise/reveal lifecycle; bodyguard interception of attacks targeting its ward; pack activation thresholds; ambusher dormancy.

## 5. Scope OUT
- Movement-class behaviors (15A). Enemy assembly/cost (16). NPC protection rules (19 — bodyguard wards are entities generally, wiring to NPCs later).

## 6. Owned files
`src/engine/behaviors/special.ts` (+ tests).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Ability/cooldown machinery + caster + tests | special.ts | Codex | 15m / 30m | 15A task 2 |
| 2 | implement | thief, mimic, ambusher, pack_hunter, bodyguard + tests per behavior | special.ts (same session) | Codex | 25m / 50m | — |
| 3 | verify | Scenario fixtures per behavior (mimic reveals on interaction; thief drops loot on death; bodyguard eats the hit) | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · per-behavior scenario tests.

## 9. Completion criteria
1. Each §9.2 row demonstrably true on a fixture (test per behavior).
2. Cooldowns respect bounds and tick deterministically (test).
3. Stolen items are never destroyed — conservation holds through steal/flee/kill (test).
4. Acceptance bar: the doc's composition examples (§9.2 — "infuriating pickpocket", "turret") run as fixtures and behave as written.

## 10. Risks & escalation
Bodyguard interception order vs 07B's actor ordering — if ambiguous, fixture it and report; don't invent precedence.
