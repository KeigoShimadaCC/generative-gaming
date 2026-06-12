INTEGRATION TASK — PHASE-56: M2 evidence (contract: phase-plans/PHASE-56-M2-INTEGRATION.md; NORTH_STAR §10-M2 wording is the bar; human session deferred to the morning checklist per standing authorization).

GATE SCOPE: alone — full pnpm run check + app suites + e2e ARE NOT yours to run (no browser in-sandbox; orchestrator runs e2e). Do NOT commit.
OWNED FILES: tests/integration/m2.test.ts, app/api bridge for the artifact viewer (the 54B server bridge gap — wire the reader behind a thin route so the Tab artifacts pane works in-browser), runs/milestones/m2/**.

THE WORK:
1. The 54B bridge: an API route exposing the artifacts reader (list/load, read-only) + point the artifacts pane at it; component test with a fixture run dir.
2. m2.test.ts (mocked): (a) two-run memory: run 1 death → run 2 prompt contains it via the real memory module + persistence (temp DB); (b) diary faithfulness on a fixture run; (c) responsiveness: the tuned prompt + mock manifests through the eval scorers ≥ the 47 baseline numbers (assert against the committed baseline, not magic numbers); (d) transition budgets: the instrumentation fields exist in store after fixture descend.
3. runs/milestones/m2/report.md: M2's NORTH_STAR sentence quoted, per-clause evidence (the 47 live tuning numbers, m2 test names, e2e 5/5 host runs noted, artifact-viewer bridge), and the deferred-human section: the two-run live session script (exact commands for the human: pnpm run dev, play run 1 to death, start run 2, look for the recognition line; then Tab → artifacts), 'M2 VERDICT (mechanical): MET|NOT MET' + 'HUMAN SESSION PENDING'.
DONE: pnpm run check green w/ exit (paste); report complete. Report + actual vs 45m. NO commit. Then stop.
