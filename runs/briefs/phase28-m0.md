INTEGRATION TASK — PHASE-28: M0 integration & milestone evidence (contract: phase-plans/PHASE-28-M0-INTEGRATION.md; NORTH_STAR §10 M0 wording is the bar). HUMAN NOTE: the human's CLI acceptance is deferred to morning ratification per overnight authorization — your job is everything mechanical.

GATE SCOPE: alone — full pnpm run check (slow ~100s, expected). Do NOT commit.
OWNED FILES: tests/integration/** (create), tests/golden/** (refresh only via the canonical recorder), runs/milestones/m0/** (report).

THE WORK:
1. tests/integration/m0.test.ts: (a) bot full runs across policies × 5 seeds on the fallback pack — all terminate, traces replay-identical; (b) DETERMINISM: same seed twice → byte-identical traces; (c) OFFLINE ASSERTION: mechanically verify the gameplay path imports no network modules — implement as: grep/AST scan of the transitive import graph from src/cli/play.ts and src/engine/** for node:http/https/fetch/undici (a simple script-based test is fine); (d) the full-run WIN smoke stays green.
2. Golden refresh: re-mint goldens via the canonical recorder at current protocol 1.2.0, replay×2.
3. runs/milestones/m0/report.md: M0's NORTH_STAR sentence quoted, each clause marked with its evidence (test names, table, trace paths); the 15-run outcome table; a 'HUMAN RATIFICATION PENDING: pnpm run play' line at the end.
DEFINITION OF DONE: pnpm run check green (paste final lines); report.md exists with evidence links. Report + actual vs 30m. NO commit. Then stop.
