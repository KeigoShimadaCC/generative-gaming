# PHASE-33 — Gates 0–1: Structure & Legality

## 1. Objective
The deterministic first line of defense: schema validation (Gate 0) and referential integrity + hard bounds (Gate 1), with machine-readable gate reports.

## 2. Context
NORTH_STAR §5 (gate definitions); GAME_DESIGN §9.1 (budget arithmetic via 16's cost function), §8 (value bands), §10 (entity caps); 30's manifest.

## 3. Dependencies
30. Parallel with 34 (disjoint folders).

## 4. Scope IN
- `src/gauntlet/gates01/`: Gate 0 (parse + Zod, error capture); Gate 1 checks: every referenced entity exists (quest targets, NPC inventories, callback refs), spawn budget affordable (16), item values in band, entity caps (0–2 NPCs, 0–4 traps, roster size), text length caps, protocol version match, signature flag legality (one per run, Middle band only).
- Gate report format: structured pass/fail-with-reasons per check — the artifact 37 persists and the repair loop (36) consumes.

## 5. Scope OUT
- Simulation (34). Quality judgment (45/46). Repair (36).

## 6. Owned files
`src/gauntlet/gates01/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Gate 0 + report format + tests | gates01/gate0.ts, report.ts | Cursor | 10m / 20m | 34 |
| 2 | implement | Gate 1 full check suite + tests per check | gates01/gate1.ts | Codex | 25m / 50m | — |
| 3 | verify | Adversarial manifest set (12+ violation kinds, one per check) each rejected with the *correct* reason code | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · adversarial rejection suite (reason-code asserted).

## 9. Completion criteria
1. Every Gate 1 check has a dedicated adversarial fixture caught with the right reason (test per check).
2. Valid band fixtures (30's) pass both gates clean.
3. Gate report machine-readable and human-readable (snapshot).
4. Acceptance bar: nothing structurally or arithmetically illegal can reach Gate 2; repair (36) gets actionable reasons, not booleans.

## 10. Risks & escalation
Reason codes are contract surface for 36's repair prompts — name them well, freeze early, record in PROGRESS.md.
