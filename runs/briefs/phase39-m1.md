INTEGRATION TASK — PHASE-39: M1 evidence (contract: phase-plans/PHASE-39-M1-INTEGRATION.md AMENDED: ambient path, no API key; the human accepted autonomous evidence-gathering — human reviews the report after).

GATE SCOPE: alone — full pnpm run check. Do NOT commit.
OWNED FILES: tests/integration/m1.test.ts (+ the integration vitest config if needed), src/cli/simulate.ts (--director mock|ambient flag ONLY), runs/milestones/m1/**.

THE WORK:
1. m1.test.ts (mocked, CI-permanent): full-loop — play a floor (bot) → trace → summarize → assemble → MOCK provider → gates → materialize → next floor played by bot. Assert the loop closes.
2. simulate.ts: --director flag wiring DirectorFloorProvider (ambient|mock) instead of fallback-only.
3. LIVE MEASURED SESSION (sequential, ONE codex at a time — the watchdogged harness rule): 10 live generateFloor calls across bands/depths (shallows×4, middle×4, lowest×2) with varied fixture traces; record per-call: outcome (generated|repaired|fallback), attempts, latency, gate failures. Write runs/milestones/m1/report.md: the table, rates vs the ≥8/10 served-without-fallback bar, latency stats, artifact paths.
4. RESPONSIVENESS SPOT-PROOF: 2 of the 10 use CONTRASTING traces (aggressive-fixture vs cautious-fixture); diff their served manifests (roster/items/narration) into a human-readable section: does content correlate with the trace? Honest verdict either way.
5. Report ends: 'M1 VERDICT (mechanical): MET|NOT MET per NORTH_STAR §10-M1' + 'HUMAN REVIEW PENDING'.
DEFINITION OF DONE: pnpm run check green (paste); report.md complete. Report + actual vs 45m. NO commit. Then stop.
