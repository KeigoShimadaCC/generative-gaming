IMPLEMENT TASK — PHASE-41: eval runner CLI & reports (contract: phase-plans/PHASE-41-EVAL-RUNNER.md).

GATE SCOPE: alone — full pnpm run check. Tests MOCK the provider always. Do NOT commit.
STEP 0: compose what exists — personas (bank + policies), generateFloor (the pipeline), metrics scorers, artifacts reader, prompt assembly (summarize bank traces → prompts). Do NOT modify existing modules.
OWNED FILES: src/evals/runner/** (+ tests), package.json 'evals' script line only.

THE WORK:
1. run.ts: matrix execution — personas × bands × N generations per cell (config defaults small): for each cell, take the persona's bank trace → summarize → assemble prompt → generateFloor (mock|ambient per --mode) → artifacts to runs/evals/<eval-id>/; SEQUENTIAL always in ambient mode (one codex at a time — system invariant).
2. COST/TIME GUARD: in ambient mode a hard cap on total calls per run (config, default 15) — abort cleanly over cap with partial report marked partial.
3. report.ts: compose EvalScores per cell + overall via the metrics lib → runs/evals/<eval-id>/report.json + readable report.md (include config snapshot, provider mode, model id, bank version, git rev for comparability); compare(reportA, reportB) → delta table (rates + latency deltas, regressions flagged).
4. CLI: pnpm run evals -- --mode mock|ambient [--cells shallows:hoarder,...] [--n 2]; exit nonzero on execution errors (not on low scores — scores are data).
5. Tests (mock): a 2-persona × 1-band × n=2 run end-to-end produces complete report.json with correct aggregate math (hand-checked fixture); cap guard trips (mock counts); compare() delta correctness on two fixture reports.
DEFINITION OF DONE: pnpm run check green (paste); a mocked `pnpm run evals -- --mode mock --n 1` smoke output pasted. Report + actual vs 35m. NO commit. Then stop.
