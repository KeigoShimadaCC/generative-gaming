## Task Queue

| ID | Task | Owner (agent) | Worktree / branch | Status | Notes |
|---|---|---|---|---|---|
| 01A-1 | Codex sandbox probe spike | Codex | main (runs/spikes only) | verified | audit clean (Cursor) |
| 01B-1 | Cursor CLI probe spike | Cursor | main (runs/spikes only) | verified | 1 audit finding → amended (claim 4 evidence) |
| 02-1 | codex-run.sh harness + ledger | Codex | main (scripts/ only) | verified | |
| 02-2/3 | cursor-run.sh + agent-report.sh | Cursor | main (scripts/ only) | verified | |
| 03-1 | Repo scaffold (tooling + skeleton) | Codex | main | verified | READY; merged 689616b |
| 04A-1 | CI workflow + README stub | Cursor | main (.github, README) | verified | live Actions run GREEN on main (b54db42) |
| 04C-2 | Injected clock | Cursor | main (src/engine/clock) | ready-for-verify | clean |
| 04B-1 | Config module ([T]/[HARD] transcription) | Codex | main (src/config) | ready-for-verify | 2 doc ambiguities → orchestrator pinned in GAME_DESIGN |
| 04B-2 | Config addendum (xp factor, pack_hunter N) | Cursor | main (src/config) | verified | merged 99d768b |
| 04C-1 | Seeded PRNG + substreams | Codex | main (src/engine/rng) | verified | merged 99d768b |
| 05-1 | Schemas & vocabularies | Codex | main (src/schemas) | in-progress | timebox 90m; highest blast radius |
| 05-1a | Text cap schema addendum | Codex | main (src/config, src/schemas) | ready-for-verify | pnpm run check green; no commit |

Status values: `queued` → `claimed` → `in-progress` → `ready-for-verify` →
`verified` → `merged` (or `blocked` / `returned` with a note).

## Phase Checklist

*(Copied from the active phase plan's completion criteria when a phase starts;
ticked only with evidence linked in the Validation Log.)*

- [ ] —

## Validation Log (append-only)

Format: `YYYY-MM-DD · phase/task · who · what was verified · evidence (command/output path/PR)`

| Date | Task | Agent | Verified | Evidence |
|---|---|---|---|---|
| 2026-06-11 | — | claude (orchestrator) | Doc spine created: NORTH_STAR, CLAUDE, AGENTS, TECH_SPEC, UX, WORLD, GAME_DESIGN, PROGRESS, PHASE-00 | this commit |
| 2026-06-11 | — | claude (orchestrator) | 73 phase plans authored (PHASE-01A…PHASE-61) + PHASE-INDEX; automation scheme hardened (ENVIRONMENT.md, timeboxes, velocity ledger) | this commit |
| 2026-06-11 | 01A | Cursor (audit) | All 6 sandbox claims verified vs session.jsonl; 2 inherited facts REFUTED (.git writes allowed, && works) | runs/spikes/01A-codex-env/ |
| 2026-06-11 | 01B | Codex (audit) | 5/5 claims verified after claim-4 evidence amendment; Cursor can commit directly | runs/spikes/01B-cursor-env/ |
| 2026-06-11 | 02 | Cursor (verify) | READY: 3 scripts syntax-clean, both live smokes green, rollup matches ledger arithmetic, 0 malformed rows. Orchestrator adjudication: NA token fields accepted for cursor text mode (plan §9.1 narrowed) | runs/sessions/, scripts/ledger.tsv |
| 2026-06-11 | 05-1a | Codex | Text caps wired into config bounds and schemas; full gate green | `pnpm run check` → 13 test files, 70 tests passed |

## Worktrees & Branches
(archived 2026-06-11, Wave A close)
