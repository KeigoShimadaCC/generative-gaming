# PROGRESS.md — Live Coordination

The single live coordination file for this repository. The orchestrator (CLAUDE.md)
owns it; workers update only the rows and log entries their brief tells them to.
This file records *state*, never *design* — design lives in the doc spine
(NORTH_STAR, TECH_SPEC, UX, WORLD, GAME_DESIGN) and `phase-plans/`.

---

## Active Phase

**Phase:** Wave A — PHASE-01A + PHASE-01B (parallel environment spikes)
**Phase plan:** phase-plans/PHASE-01A-SPIKE-CODEX-ENV.md, PHASE-01B-SPIKE-CURSOR-ENV.md
**Started:** 2026-06-11
**Status:** executing (human approved Wave A)

## Task Queue

| ID | Task | Owner (agent) | Worktree / branch | Status | Notes |
|---|---|---|---|---|---|
| 01A-1 | Codex sandbox probe spike | Codex | main (runs/spikes only) | verified | audit clean (Cursor) |
| 01B-1 | Cursor CLI probe spike | Cursor | main (runs/spikes only) | verified | 1 audit finding → amended (claim 4 evidence) |
| 02-1 | codex-run.sh harness + ledger | Codex | main (scripts/ only) | in-progress | timebox 30m |

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

## Future Backlog (out-of-scope discoveries land here, not in code)

| Logged | By | Item | Suggested phase |
|---|---|---|---|
| 2026-06-11 | orchestrator | Boss-fight system for floor 12 (GAME_DESIGN §13) | post-MVP |
| 2026-06-11 | orchestrator | Free-form NPC conversation behind gauntlet (NORTH_STAR §11) | post-MVP |
| 2026-06-11 | orchestrator | Effect/behavior vocabulary expansion round (GAME_DESIGN §7) | post-M3 |

## Phase Rotation Procedure

When a phase completes (all checklist items ticked with evidence, human accepted):

1. Archive this file's phase sections to `docs/progress-archive/PHASE-XX.md`.
2. Reset: Active Phase, Task Queue, Phase Checklist; keep Validation Log's last 5
   entries; carry Backlog forward untouched.
3. Update Active Phase to the next phase plan; copy its completion criteria into
   the checklist.
4. Orchestrator commits the rotation as a single commit: `Phase XX: close & rotate`.
