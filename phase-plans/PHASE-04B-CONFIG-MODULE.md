# PHASE-04B — Tunable Config Module

## 1. Objective
Every [T] value from GAME_DESIGN lives in one typed config module; no magic numbers can exist outside it.

## 2. Context
GAME_DESIGN (all [T] tables: §2 run structure, §4 player, §5 combat, §8 economy, §9 budgets, §11 thresholds); PHASE-00 invariant "config over constants".

## 3. Dependencies
03. Parallel with 04A, 04C.

## 4. Scope IN
- `src/config/`: typed, frozen config object grouped by GAME_DESIGN section, each value commented with its doc reference (e.g., `// GAME_DESIGN §4`).
- [HARD] values in a separate, clearly-marked `bounds` export (changing one = protocol bump — comment says so).
- Unit test asserting structural completeness (every §-group present) and a few spot values against GAME_DESIGN.

## 5. Scope OUT
- No consumers (engine phases import later). No env-var overrides. No runtime mutation API.

## 6. Owned files
`src/config/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Transcribe GAME_DESIGN [T]/[HARD] tables into typed config + bounds | src/config/** | Codex | 20m / 40m | 04A, 04C |
| 2 | verify | Line-by-line diff of config values vs GAME_DESIGN tables | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · verifier's value-by-value comparison table in its report.

## 9. Completion criteria
1. Every [T] and [HARD] value in GAME_DESIGN §§2–12 present, correctly grouped, doc-referenced.
2. Zero discrepancies in the verifier's comparison table.
3. Acceptance bar: an engine phase can cite `config.<group>.<name>` for any number it needs; a grep for that number's literal elsewhere returns nothing.

## 10. Risks & escalation
A GAME_DESIGN ambiguity discovered (missing unit, contradictory bound) → stop and report; the orchestrator fixes the doc first (docs govern).
