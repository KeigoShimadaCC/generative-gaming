# PROGRESS.md — Live Coordination

The single live coordination file for this repository. The orchestrator (CLAUDE.md)
owns it; workers update only the rows and log entries their brief tells them to.
This file records *state*, never *design* — design lives in the doc spine
(NORTH_STAR, TECH_SPEC, UX, WORLD, GAME_DESIGN) and `phase-plans/`.

---

## Active Phase

**Phase:** Wave B — engine core (PHASE-06 first; see PHASE-INDEX.md)
**Phase plan:** phase-plans/PHASE-06-ENGINE-STATE.md
**Started:** 2026-06-11
**Status:** executing (Wave A closed: 01A, 01B, 02, 03, 04A, 04B, 04C, 05 all verified & merged)

## Task Queue

| ID | Task | Owner (agent) | Worktree / branch | Status | Notes |
|---|---|---|---|---|---|
| 06-1 | Engine state model & serialization | Codex | main (src/engine/state) | verified | merged 9d5e3ac |
| 07A/B | Map+FOV+path / turn contract | Codex+Cursor | main (src/engine) | verified | merged 0862e5c; 1 coverage round-trip |
| 07B-a | Turn contract amendment: action-resolver registry | Codex | main (src/engine/turn) | in-progress | orchestrator-authorized after correct 08 STOP; external 5-method contract unchanged |
| 08-1 | Movement & collision | Codex | main (src/engine/systems) | ready-for-verify | resolver/tests green; no commit per brief |
| 09/10-c | Combat/status/turn consolidation seams | Codex | main (src/config, src/engine/turn, src/engine/systems) | in-progress | config magnitudes, tick registry, death unification; no commit per brief |

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
| 2026-06-11 | 08-1 | Codex | Movement resolver registered; ASCII bump/door/stairs tests and 1k seeded occupancy property green | `pnpm run check` → 21 test files, 124 tests passed; `rg 'Math.random\|Date.now' src/engine/systems/` → no matches |

## Worktrees & Branches

| Worktree path | Branch | Owner | Purpose | State |
|---|---|---|---|---|
| — | main | orchestrator | integration | clean |

## Velocity Ledger (estimate vs actual, per task — append at phase close)

Estimates for new tasks come from this table, not from gut. Reference baseline
until our own rows exist: medium feature ≈ 15–20 min, focused fix ≈ 3–9 min,
spike ≤ 15 min (hard).

| Phase·Task | Type | Agent | Estimate | Timebox | Actual | Notes (overrun cause / unknown hit) |
|---|---|---|---|---|---|---|
| 01B·1 | spike | Cursor | 10m | 15m | ~6m | clean one-shot |
| 01A·1 | spike | Codex | 10m | 15m | ~7m (+15m stall) | run 1 no-event stall: codex exec without `< /dev/null`; fix recorded in ENVIRONMENT.md; retry one-shot |
| 02·1 | implement | Codex | 15m | 30m | ~30m | overrun cause: diagnosing nested-codex CODEX_HOME issue (new unknown, now in ENVIRONMENT.md) |
| 03·1 | implement | Codex | 30m | 60m | 4.4m session | harness-measured; codex far faster than reference baseline on assembly |
| 04A·1 | implement | Cursor | 20m | 30m | ~8m + CI run | live Actions green = verification |
| 04B·1 | implement | Codex | 20m | 40m | 5.8m session | 2 doc ambiguities surfaced (good catch, not overrun) |
| 04C·1+2 | implement | Codex+Cursor | 20m | 30m | ~6m combined | clean |
| 05·1 | implement | Codex | 45m | 90m | 13m session | 67 tests; 1 doc ambiguity (text caps) |
| 05·1a | implement | Codex | 10m | 20m | ~5m | caps wired from config |

## Future Backlog (out-of-scope discoveries land here, not in code)

| Logged | By | Item | Suggested phase |
|---|---|---|---|
| 2026-06-11 | orchestrator | Boss-fight system for floor 12 (GAME_DESIGN §13) | post-MVP |
| 2026-06-11 | orchestrator | Free-form NPC conversation behind gauntlet (NORTH_STAR §11) | post-MVP |
| 2026-06-11 | orchestrator | Effect/behavior vocabulary expansion round (GAME_DESIGN §7) | post-M3 |
| 2026-06-11 | orchestrator | CI red-path demo (intentional failure blocks PR) deferred from 04A | with PHASE-43 |
| 2026-06-11 | verifier | Prefer @types/node over growing state/node-fs.d.ts shim | when Node APIs grow |

## Phase Rotation Procedure

When a phase completes (all checklist items ticked with evidence, human accepted):

1. Archive this file's phase sections to `docs/progress-archive/PHASE-XX.md`.
2. Reset: Active Phase, Task Queue, Phase Checklist; keep Validation Log's last 5
   entries; carry Backlog forward untouched.
3. Update Active Phase to the next phase plan; copy its completion criteria into
   the checklist.
4. Orchestrator commits the rotation as a single commit: `Phase XX: close & rotate`.
