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
| 21-1 | Run loop, caps, Hoard, endings | Codex | main (src/engine/run) | in-progress | r2 after stall #4; watched |
| 26-1 | Fallback content pack (Old Stock) | Cursor | main (content/, loader) | in-progress | |
| — | Wave B merged through 16/20 (b1ccd1d): 06–20,22 all verified | — | — | merged | engine complete except run loop |

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
| 2026-06-11 | 09/10-c | Codex | Combat/status/turn consolidation: config magnitudes, tick registry, unified death path | `pnpm run check` → 24 test files, 161 tests passed; `rg -n "STATUS_|hp\\.current\\s*[-+]\\s*[12]|defense\\s*\\+=\\s*3|attack\\s*\\+=\\s*-2|nextHp\\s*=.*[-+]\\s*[12]" src/engine/systems/combat.ts src/engine/systems/status.ts` → no matches |
| 2026-06-11 | 14-1 | Codex | BLOCKED before implementation: cursed gear behavior requires a schema-authored data flag, but `ItemDefinitionSchema` has no curse field and weapon/armor bonuses are positive-only | `rg -n "curse|cursed" src/schemas src/engine` → no matches; `src/schemas/entities/items.ts` lines 44-130 show no curse field |
| 2026-06-12 | 14-1 | Codex | BLOCKED before implementation retry r2: proc trigger vocabulary exists, but weapon/armor item payloads have no schema field for on_hit/on_struck effect bundles; pure-data on-hit weapon thesis test cannot be authored | `rg -n "WeaponItemPayloadSchema\|ArmorItemPayloadSchema\|CharmItemPayloadSchema\|on_hit\|onHit\|on_struck\|onStruck\|proc\|effect" src/schemas/entities/items.ts src/schemas/vocab/triggers.ts src/schemas/fixtures/entities.ts` |
| 2026-06-12 | 14-1 | Codex | Item triggers, identification, charges, curses, and THESIS TEST implemented; local touched-path verification and full tests green; full gate blocked at lint by unrelated untracked behavior files | `pnpm run typecheck` → pass; `pnpm exec eslint src/engine/items src/engine/effects/core.ts src/engine/effects/core.test.ts src/engine/state/types.ts src/engine/state/init.ts src/engine/state/serialize.ts src/engine/turn/actions.ts src/engine/systems/inventory.ts` → pass; `pnpm test` → 33 files, 265 tests passed; `pnpm run check` → fails in `src/engine/behaviors/**`; `rg -n 'Math\.random\|Date\.now' src/engine/items/` → no matches |
| 2026-06-12 | 16-1 | Codex | Enemy assembly/cost implementation complete; scoped gates green; full gate blocked by unrelated untracked quest files | `pnpm exec eslint src/engine/enemies` → pass; `pnpm exec vitest run src/engine/enemies` → 1 file, 6 tests passed; `pnpm exec eslint src/engine/enemies src/engine/effects/spatial.ts src/config/index.ts` → pass; `pnpm exec vitest run src/engine/effects/spatial.test.ts` → 1 file, 17 tests passed; `rg 'Math.random\|Date.now' src/engine/enemies/` → no matches; `pnpm run typecheck` / `pnpm run check` → fail in untracked `src/engine/quests/**` and quest render-log exhaustiveness |

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
