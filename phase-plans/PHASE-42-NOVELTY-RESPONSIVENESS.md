# PHASE-42 — Novelty & Responsiveness Metrics

## 1. Objective
The two metrics that measure the *point* of the project: is generated content fresh (novelty), and does it actually respond to how this player plays (responsiveness)?

## 2. Context
NORTH_STAR §5 (both named), §10-M2 ("persona-distinct content" is the milestone wording); 40A signatures; 32's summarizer facts.

## 3. Dependencies
41.

## 4. Scope IN
- `src/evals/metrics/novelty.ts`: distance of a manifest from (a) the fallback pack and (b) the same run's previous manifests — name-similarity, stat-vector distance, behavior/effect composition overlap; a near-duplicate flag with config threshold.
- `src/evals/metrics/responsiveness.ts`: correlation between trace summary facts and manifest deltas (hoarder trace → inventory-pressure content? pacifist → the Director acknowledges avoidance?) — implemented as named, testable signal detectors per persona signature, scored as hit-rate across the matrix; cross-persona control (content generated for persona A must score *lower* against persona B's detectors).
- Wire both into 41's report.

## 5. Scope OUT
- LLM-judge versions of these (46 may add judge-assisted scoring; these heuristics stay as the cheap floor). Tone/coherence (45).

## 6. Owned files
`src/evals/metrics/novelty.ts`, `src/evals/metrics/responsiveness.ts` (+ tests).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Novelty scorer + near-dup flag + fixture tests (engineered dup/fresh pairs) | novelty.ts | Codex | 15m / 30m | — |
| 2 | implement | Responsiveness detectors + cross-persona control + fixture tests | responsiveness.ts | Codex (same session) | 25m / 50m | — |
| 3 | verify | Engineered-fixture audit: known-dup flagged, known-fresh passes; responsive fixture scores high for its persona and low cross-persona | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · engineered-fixture suites · `pnpm run evals -- --mode mock` showing both metrics in the report.

## 9. Completion criteria
1. Novelty separates engineered dup/fresh fixtures (tests).
2. Responsiveness hit-rate high same-persona, low cross-persona on fixtures (tests).
3. Both appear in eval reports with documented definitions.
4. Acceptance bar: M2's "measurably distinct content per persona" has its measurement; prompt tuning (47) has its target function.

## 10. Risks & escalation
Responsiveness detectors encode design judgment (what *should* the Director do for a hoarder?) — detector list is reviewed by the human at phase close; uncertainty → propose, don't assume.
