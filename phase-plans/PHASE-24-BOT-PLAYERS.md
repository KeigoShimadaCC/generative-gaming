# PHASE-24 — Bot Players

## 1. Objective
Three scripted policies — cautious, balanced, aggressive — that play whole runs through the structured action interface; the muscle behind Gate 2 and the eval suite.

## 2. Context
GAME_DESIGN §11 (ensemble composition, thresholds they'll be judged by); NORTH_STAR §5 (Gate 2); TECH_SPEC §2 (same interface as humans).

## 3. Dependencies
23A.

## 4. Scope IN
- `src/harness/bots/`: a policy interface (`state → action` using only available actions + rendered/inspectable info — no engine internals), three deterministic-given-seed policies with distinct, documented heuristics (cautious: retreat thresholds, item use early; aggressive: closes distance, spends little; balanced: between), full-run driver (policy × seed × content → trace).
- Batch runner: N policies × M seeds → traces + outcome table.

## 5. Scope OUT
- LLM bots (post-MVP). Difficulty thresholds (Gate 2 / evals own judgment). Persona trace bank (40A).

## 6. Owned files
`src/harness/bots/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Policy interface + full-run driver + tests | bots/driver.ts | Codex | 15m / 30m | — |
| 2 | implement | Three policies, heuristics documented in-file + behavioral-difference test | bots/policies/** | Codex (same session) | 25m / 50m | — |
| 3 | verify | 3 policies × 10 seeds on fixture content: all runs terminate, traces valid, policies measurably differ (kills/turns/items distributions) | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · 30-run batch with outcome table in verifier report.

## 9. Completion criteria
1. All 30 batch runs reach a terminal state (no hangs) with valid traces.
2. The three policies are statistically distinguishable on at least two metrics (test).
3. Policies use only the public action interface (verifier grep: no engine-internal imports).
4. Acceptance bar: Gate 2 (34) and evals (40+) can import the ensemble as-is.

## 10. Risks & escalation
Bots stuck in loops = the hang class — per-policy anti-stall (never repeat a no-progress action k times). A bot that can't finish fixture floors means fixture or engine issues: report, don't tune thresholds.
