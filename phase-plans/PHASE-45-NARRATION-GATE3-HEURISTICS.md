# PHASE-45 — Narration Beats & Gate 3 Heuristics

## 1. Objective
The Deep's voice reaches the player — floor intros and triggered observations — and the cheap quality gate that keeps generated text on-canon.

## 2. Context
WORLD §6 (voice rules: second person, fairy-tale-with-teeth, banned list), §3.7 (sparing); GAME_DESIGN §12 (1 intro + ≤3 observation beats/floor); NORTH_STAR §5 Gate 3 (heuristics first); UX §3 (log integration).

## 3. Dependencies
32, 36. Parallel with Wave G.

## 4. Scope IN
- `src/director/narration/`: narration beat schema usage (already in 30) wired to engine triggers (floor entry, beat conditions: first sight of X, player action patterns) — beats fire through the log as Deep-voice lines, capped per floor.
- `src/gauntlet/gate3/heuristics.ts`: deterministic text checks on all generated strings — banned-vocabulary list (modern/anachronism/fourth-wall regex set from WORLD §6), length caps, second-person check for narration, name-format rules (§5 item naming), near-dup vs recent floors (reuse 42's novelty signal); failures feed 36's repair with reason codes like any gate.
- Banned-list as a maintained data file with tests.

## 5. Scope OUT
- LLM-judge (46). Diary prose (54A renders; 44 summarizes). Voice *quality* beyond fence-checks (46/human).

## 6. Owned files
`src/director/narration/**`, `src/gauntlet/gate3/heuristics.ts`, `content/banned-vocab.json`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Beat triggers + log wiring + caps + tests | narration/** | Codex | 20m / 40m | Wave G |
| 2 | implement | Heuristic gate + banned list + repair integration + tests | gate3/heuristics.ts, banned-vocab.json | Codex (same session) | 15m / 30m | — |
| 3 | verify | Fence audit: a corpus of violating strings (modern words, UI references, third person) all caught; on-canon fixture strings pass; beats fire at most per-cap | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · violation-corpus test · beat-cap test.

## 9. Completion criteria
1. Violation corpus 100% caught with correct reason codes; on-canon corpus 0% false positives (tests; corpora committed).
2. Beats fire at conditions, capped, in Deep voice position in the log (tests).
3. Gate 3 heuristics participate in the repair chain like gates 0–2 (integration test).
4. Acceptance bar: WORLD §6's "banned everywhere, no exceptions" is enforced by machine, not hope.

## 10. Risks & escalation
False-positive fence hits on legitimate fantasy words are the annoyance class — corpus-test both directions; contested words → human (taste).
