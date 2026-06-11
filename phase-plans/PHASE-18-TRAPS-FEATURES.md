# PHASE-18 — Traps & Floor Features

## 1. Objective
Hidden step-trigger traps with the no-lethal-from-full-HP guarantee, plus remaining floor features (water tiles, decorative features).

## 2. Context
GAME_DESIGN §10 (0–4 traps, lethality rule [HARD]); §6 (burn cured by water); 14's step-trigger interface; 17's placement API.

## 3. Dependencies
14, 17. Parallel with 19.

## 4. Scope IN
- `src/engine/systems/traps.ts`: trap entity (hidden flag, step trigger → effect bundle via interpreter), reveal mechanics (adjacency roll, reveal-traps verb, triggering), **placement-time lethality check** (max possible damage < full HP at the floor's band — computed, not assumed).
- Water tiles: burn-cure on entry; decorative feature metadata pass-through.

## 5. Scope OUT
- Trap content design (26/Director). New effect verbs (closed list).

## 6. Owned files
`src/engine/systems/traps.ts` (+ tests).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Trap lifecycle + reveal + lethality check + tests | traps.ts | Codex | 20m / 40m | 19 |
| 2 | verify | Lethality audit: adversarial trap definitions (max-damage bundles) all rejected at placement; water cures burn | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · adversarial-trap rejection tests.

## 9. Completion criteria
1. Hidden→revealed→triggered lifecycle correct (tests).
2. No trap definition can pass placement and kill from full band-appropriate HP (adversarial test set).
3. Acceptance bar: the Director can author any trap the schema allows and the engine's fairness rule holds regardless.

## 10. Risks & escalation
Lethality must account for effect *combinations* in a bundle (damage + burn ticks) — if worst-case computation gets hairy, over-reject and report.
