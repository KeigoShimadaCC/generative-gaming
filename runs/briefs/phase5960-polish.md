INTEGRATION TASK — PHASE-59 (mechanical half) + PHASE-60 combined: demo prep + docs polish (contracts: phase-plans/PHASE-59-DEMO-HARDENING.md — rehearsals are HUMAN, you do the script/sweep/boundary — and PHASE-60-DOCS-POLISH.md; NORTH_STAR §6 is the demo through-line).

GATE SCOPE: alone — full pnpm run check + the e2e is host-run by the orchestrator after. Do NOT commit.
OWNED FILES: docs/demo-script.md, app/ error-boundary file (+wiring line), README.md, docs/adr/** (6 files), LICENSE, .env.example accuracy pass, hygiene edits (dead code/console noise — list each file you touch in the report; doc-spine .md files are LOCKED).

THE WORK (59 mechanical):
1. docs/demo-script.md: NORTH_STAR §6's seven beats, beat-by-beat: exact commands/keys, expected on-screen outcome, recovery note per beat; plus the ambient-director variant (the real demo) and the mock fallback variant.
2. Edge-state sweep: first-ever run (no DB), no-codex-auth boot (ambient unavailable → mock/fallback messaging), mid-run reload, empty/missing runs/ dir for the artifact pane — each lands presentably (fix presentation-level gaps in owned UI files only; engine gaps → backlog note).
3. One top-level React error boundary (the only error infra, per plan).
THE WORK (60):
4. README.md: the NORTH_STAR thesis in 60 seconds; the ambient-Director story ($0 inference via codex CLI behind a gauntlet — this is the headline); architecture overview (two layers + gauntlet, ASCII diagram); setup: clone → pnpm install → pnpm run play (offline) → codex login → pnpm run dev (ambient); eval suite + CI gates; doc-spine map; honest cuts + known gaps (bot WIN-drive, balance pending calibration, completionist detector).
5. docs/adr/: 6 ADRs (~100 words: context/decision/consequence): schema-as-physics; vocabulary-composition; plain-TS-for-agent-operability; ambient-CLI-inference; prefetch-fallback-latency; evals-as-merge-gates.
6. LICENSE MIT; .env.example matches reality (ambient needs NO keys — say so); hygiene sweep.
DONE: pnpm run check green w/ exit; a fresh-clone README walkthrough simulated as far as the sandbox allows (note what you couldn't verify). Report + actual vs 70m. NO commit. Then stop.

BRANCH ASSIGNMENT (orchestrator authority): for this serial-lane task your assigned workspace IS the main branch working tree — the AGENTS.md worktree rule is explicitly waived by this brief (the orchestrator owns all commits; you still make NO commits). Proceed.
