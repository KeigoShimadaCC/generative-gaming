IMPLEMENT TASK — PHASE-40B: metric scoring library (contract: phase-plans/PHASE-40B-METRIC-SCORING.md; read NORTH_STAR §5 metric list, GAME_DESIGN §11 targets).

GATE SCOPE (sibling in src/evals/personas): pnpm run typecheck + pnpm exec eslint src/evals/metrics + pnpm exec vitest run src/evals/metrics. Do NOT commit.
STEP 0: inputs are artifacts — GenerationRecords (harness/artifacts reader) + Gate reports embedded in them. Pure functions: artifacts in, numbers out; no I/O beyond the reader, no LLM calls. Do NOT create novelty.ts/responsiveness.ts (PHASE-42's files). Do NOT modify existing modules.
OWNED FILES: src/evals/metrics/core.ts (+ core.test.ts, fixture builders).

THE WORK:
1. Per-generation scorers from a GenerationRecord: validity (gates 0+1 first-attempt pass), solvability (gate 2 blocking verdict), servedWithoutFallback, repairCount, fallback (bool), latencyMs, tokens (when present), advisory flags (hp-retention recorded), bandAccuracy (gate2 metrics vs §11 config targets where applicable).
2. Aggregators over a record set: rates (validity %, solvability %, served %, fallback %), latency stats (min/p50/avg/max), repair distribution, per-band breakdowns.
3. Typed EvalScores report structure (the runner composes it; comparability fields slot in PHASE-41).
4. Tests: hand-built fixture record sets with HAND-COMPUTED expected scores (comment the arithmetic); purity (same input → same output, no fs writes beyond reading fixtures).
DEFINITION OF DONE: scoped gates green (paste). Report + actual vs 35m. NO commit. Then stop.
