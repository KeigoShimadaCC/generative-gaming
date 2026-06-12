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
| 21-1 | Run loop, caps, Hoard, endings | Codex | main (src/engine/run) | ready-for-verify | provider contract frozen in `src/engine/run/loop.ts`; full gate green; deterministic scan clean; no commit |
| 23A-1 | Trace recording | Codex | main (src/harness/trace) | ready-for-verify | scoped gates green; deterministic scan clean; no commit |
| 23R-1 | Trace/replay format reconciliation | Codex | main (src/harness/{trace,replay}, tests/golden) | ready-for-verify | canonical recorder/replayer round-trip green 3x; full gate green; no commit |
| 31-1 | Provider seam mock + ambient adapters | Codex | main (src/director/provider) | ready-for-verify | typed seam, ambient subprocess adapter, fixture mock, config selection; scoped gates green; deterministic scan clean; no commit |
| 31/32-RT | Round-trip verifier fixes: ambient test seam, judge taxonomy, prompt hardening | Codex | main (src/schemas, src/director/{provider,prompt}) | ready-for-verify | full gate green; no commit per brief |
| 34-1 | Gate 2 simulated playability | Codex | main (src/gauntlet/gate2) | ready-for-verify | scoped gates green; local materializer TODO-PHASE-35; no commit per brief |
| 36-1 | Repair loop & fallback degradation | Codex | main (src/gauntlet/repair) | ready-for-verify | full gate green; repair prompt snapshot covered; no commit per brief |
| 42-1 | Novelty & responsiveness thesis metrics | Codex | main (src/evals/metrics, src/evals/runner/report.ts) | ready-for-verify | fallback-pack novelty baseline, responsiveness detectors, report wiring; scoped gates green; no commit per brief |
| 45-1 | Narration beats & Gate 3 heuristics | Codex | main (narration/gate3) | ready-for-verify | full gate green; violation/on-canon corpora and beat triggers covered; no commit per brief |
| 46-1 | Ambient judge gate + signature moment | Codex | main (gate3/prompt/config/tests) | ready-for-verify | full gate green; ambient live judge test env-gated/skipped by default; no commit per brief |
| 47-TUNE | Responsiveness detector revision + ambient tuning round | Codex | main (ambient path) | ready-for-verify | Stage 0 frozen; iteration 1 hit target but validity regressed 1 cell, stopped per brief; summary in `runs/evals/tuning-02/summary.md`; full gate green; no commit |
| 48-1 | Next.js scaffold & API transport | Codex | main (app/config) | blocked | scaffold/routes/dev smokes pass; full gate blocked by out-of-scope `src/**` event-union type errors; no commit |
| 49A-1 | Grid renderer & fog | Codex | main (app/components/grid, game route wiring) | blocked | implementation complete; explicit grid tests/perf, lint, root tests green; full check blocked by existing out-of-scope `src/**` event-union type errors; no commit |
| 49B-1 | HUD & message log | Codex | main (app/components/{hud,log}, game route wiring) | ready-for-verify | HUD/log components wired; explicit component tests and full gate green; dev route 200; no commit |
| 50-1 | Keyboard input & action dispatch | Codex | main (app/input, keymap overlay, game route wiring) | ready-for-verify | single input owner, keymap table/overlay, client session dispatch, confirm MVP, auto-travel stops; explicit input suite + full gate green; no commit per brief |
| 26-1 | Fallback content pack (Old Stock) | Cursor | main (content/, loader) | in-progress | |
| 21/26-I | Wire fallback pack to run loop + unified events | Codex | main (integration) | ready-for-verify | fallback provider wired; full-run smoke over real fallback content; full gate green; no commit |
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
| 2026-06-12 | 21-1 | Codex | Run loop complete: provider contract, floor descent, Hoard WIN, soft-cap reinforcements, endings, summaries, malformed-provider errors | `pnpm exec vitest run src/engine/run` → 1 file, 7 tests passed; `pnpm run check` → 47 test files, 356 tests passed; `rg 'Math.random\|Date.now' src/engine/run/` → no matches |
| 2026-06-12 | 21/26-I | Codex | Fallback provider wired to run loop; run events merged into global log union; full-run real fallback smoke and LOSS path green | `pnpm exec vitest run src/harness/fallback-provider.test.ts src/engine/render/log.test.ts src/engine/run/loop.test.ts` → 3 files, 12 tests passed; `pnpm run check` → 48 test files, 359 tests passed |
| 2026-06-12 | 23A-1 | Codex | Trace recorder complete: stamped NDJSON header, per-turn action/events/stateHash lines, injected fs writer, deterministic hash, purity proof, full fallback WIN smoke | `pnpm run typecheck` → pass; `pnpm exec eslint src/harness/trace` → pass; `pnpm exec vitest run src/harness/trace` → 1 file, 4 tests passed; `rg 'Math.random\|Date.now' src/harness/trace` → no matches |
| 2026-06-12 | 23R-1 | Codex | Trace/replay format reconciliation: replay parses canonical recorder header/contentRef/runId/modelId; shared hash; post-step turn convention; golden trace re-minted; real two-floor recorder→replayer integration green 3x | `pnpm exec vitest run src/harness/replay/replay.test.ts -t "real recorder records a two-floor fixture run and real replayer verifies it identical"` → 1 file, 1 passed, 5 skipped (ran 3x); `pnpm exec vitest run src/harness/replay/replay.test.ts` → 1 file, 6 tests passed; `pnpm run check` → 50 files, 369 tests passed |
| 2026-06-12 | 31-1 | Codex | Provider seam mock + ambient adapters complete: typed taxonomy, parse/validate mapping, timeout kill, judge verdict, config selection | `pnpm run typecheck` → pass; `pnpm exec eslint src/director/provider` → pass; `pnpm exec vitest run src/director/provider` → 1 file, 12 passed, 1 skipped; `rg 'Math.random\|Date.now' src/director/` → no matches |
| 2026-06-12 | 31/32-RT | Codex | Round-trip verifier fixes: duplicate ambient schema subprocess test removed, ambient judge failures covered, prompt example hardened for item/trap schemas | `pnpm exec vitest run src/director/provider src/director/prompt` → 4 files, 28 passed, 1 skipped; `pnpm run check` → 60 files, 424 passed, 1 skipped |
| 2026-06-12 | 34-1 | Codex | Gate 2 simulated playability complete: single-floor bot ensemble, G2 report/judge, unwinnable and zero-threat rejects, fallback pass, deterministic verdict, injected wall-clock | `pnpm run typecheck` → pass; `pnpm exec eslint src/gauntlet/gate2` → pass; `pnpm exec vitest run src/gauntlet/gate2` → 1 file, 5 tests passed |
| 2026-06-12 | 36-1 | Codex | Repair loop complete: gate 0→1→2 sequencing, reason-coded repair prompts, cap-2 retries, immediate timeout fallback, Old Stock degradation, full generation chain artifacts | `pnpm exec vitest run src/gauntlet/repair.test.ts` → 1 file, 5 tests passed; `pnpm run typecheck` → pass; `pnpm run lint` → pass; `pnpm run check` → 65 files, 466 passed, 1 skipped |
| 2026-06-12 | 42-1 | Codex | Novelty and responsiveness thesis metrics complete: near-dup/fresh fixtures, same-persona/cross-persona detectors, report thesis summary + detector proposal | `pnpm run typecheck` → pass; `pnpm exec eslint src/evals/metrics` → pass; `pnpm exec vitest run src/evals/metrics` → 3 files, 11 tests passed |
| 2026-06-12 | 45-1 | Codex | Narration beat evaluator, Deep log event, Gate 3 heuristics, banned vocab, and repair hook complete | `pnpm exec vitest run src/director/narration src/gauntlet/gate3 src/gauntlet/repair.test.ts` → 3 files, 15 tests passed; `pnpm run check` → 76 files, 517 passed, 1 skipped |
| 2026-06-12 | 46-1 | Codex | Ambient judge gate default-off/advisory, mock calibration corpus, and once-per-run signature prompt complete | `pnpm run typecheck` → pass; `pnpm run lint` → pass; `pnpm exec vitest run src/director/prompt/assemble.test.ts src/director/prompt/signature.test.ts -u` → 2 files, 7 passed, 2 snapshots updated; `pnpm exec vitest run src/gauntlet/gate3` → 2 files, 10 passed, 1 skipped; `pnpm run check` → 78 files, 526 passed, 2 skipped |
| 2026-06-12 | 47-TUNE | Codex | Detector revision + ambient tuning round complete; iteration 1 met responsiveness target (same 54.76%, cross 17.86%) but regressed validity 100%→93.33%, so tuning stopped; mock baseline regenerated | `pnpm run check` → typecheck pass, lint pass, Vitest 78 files / 529 passed / 2 skipped; evidence: `runs/evals/tuning-02/summary.md`, `runs/evals/tuning-02/iteration-1.md`, `runs/evals/tuning-02-baseline-envfix/report.json`, `runs/evals/tuning-02-iteration-1/report.json`, `tests/eval-baselines/mock-baseline.json` |
| 2026-06-12 | 49A-1 | Codex | Grid renderer/fog implementation complete; explicit component/perf suite green; lint and root tests green; dev route smoke returns 200; full check blocked before lint/tests by out-of-scope event-union type errors | `pnpm exec vitest run --config app/components/grid/vitest.config.ts --reporter verbose` → 1 file / 4 tests passed, largest-band static render 7.97ms/update (796.6ms/100); `pnpm run lint` → pass; `pnpm test` → 78 files / 529 passed / 2 skipped; `PORT=3001 pnpm run dev` + `curl -I http://localhost:3001/` → 200 OK; `pnpm run check` → fails in `src/director/prompt/summarize.ts`, `src/engine/run/endings.ts`, `src/engine/systems/traps.ts` event-union errors |
| 2026-06-12 | 48-1 | Codex | Next scaffold/routes implemented; dev server and three transport route smokes pass; full gate blocked before lint/tests by out-of-scope `src/**` type errors | `pnpm run dev` → `GET /` 200, start-generation 200, poll-status 200, get-floor 200; post-dev `pnpm run typecheck` cleaned `.next` then failed in `src/director/prompt/summarize.ts`, `src/engine/run/endings.ts`, `src/engine/systems/traps.ts`; `pnpm run lint` → pass; `pnpm test` → 78 files / 529 passed / 2 skipped; final `pnpm run check` → same typecheck blocker |
| 2026-06-12 | 49B-1 | Codex | HUD and message log implementation complete: HUD renders depth/turn/HP/fullness/level XP/status shape chips with metadata-driven pulses; log renders engine formatter strings verbatim in order, last-6 window, turn groups, full-history overlay | clean `.next` then `pnpm run check` → exit 0, 78 files / 529 passed / 2 skipped; `pnpm exec vitest run --config app/components/hud/vitest.config.ts --reporter verbose` → exit 0, 1 file / 2 tests passed; `pnpm exec vitest run --config app/components/log/vitest.config.ts --reporter verbose` → exit 0, 1 file / 3 tests passed; `PORT=3001 pnpm run dev` + `curl http://localhost:3001/` → 200; in-app browser unavailable (`iab`) so no screenshot captured |
| 2026-06-12 | 50-1 | Codex | Keyboard input/dispatch complete: shared keymap table drives handler and overlay; client-side run session mirrors engine state through store; illegal reasons append to log; descend-with-adjacent-enemy confirm MVP; auto-travel stops covered | `pnpm exec vitest run --config app/input/vitest.config.ts --reporter verbose` → exit 0, 2 files / 6 tests passed, key-table 51 key/context pairs across 22 bindings, overlay 21 rows; clean `.next` then `pnpm run check` → exit 0, 78 files / 529 passed / 2 skipped |

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
| Wave B (06–22) | mixed | both | ~10h plan | — | ~3.5h real | 2 contract STOPs, 2 stalls, 3 schema addenda; assembly 0.2–0.5× est |
| Wave C (23–28) | mixed | both | ~4h plan | — | ~1.5h real | spec-parallel reconciliation 7 findings; 24 timebox salvage |
| Wave D (29–38) | mixed | both | ~5h plan | — | ~2.7h real | ambient pivot; watchdog mechanized; stall cause found (concurrency) |
| 45-1 | implement | Codex | 40m | 40m | ~15m | clean; full suite generated run artifacts as existing tests do |
| 46-1 | implement | Codex | 40m | 40m | ~37m | async judge hook required because provider seam judge is promise-based; full gate green |
| 49A-1 | implement | Codex | 40m | 50m | ~15m | grid implementation clean; full gate blocked by pre-existing out-of-scope event-union type errors |
| 50-1 | implement | Codex | 35m | — | ~55m | over estimate: public app/engine boundary required a web-safe runtime side-effect shim and browser fallback content normalization before gates were clean |

## Future Backlog (out-of-scope discoveries land here, not in code)

| Logged | By | Item | Suggested phase |
|---|---|---|---|
| 2026-06-11 | orchestrator | Boss-fight system for floor 12 (GAME_DESIGN §13) | post-MVP |
| 2026-06-11 | orchestrator | Free-form NPC conversation behind gauntlet (NORTH_STAR §11) | post-MVP |
| 2026-06-11 | orchestrator | Effect/behavior vocabulary expansion round (GAME_DESIGN §7) | post-M3 |
| 2026-06-11 | orchestrator | CI red-path demo (intentional failure blocks PR) deferred from 04A | with PHASE-43 |
| 2026-06-11 | verifier | Prefer @types/node over growing state/node-fs.d.ts shim | when Node APIs grow |
| 2026-06-12 | orchestrator | M0 finding: bots never WIN (15/15 ABORTED at maxTurns, 100% hp retention) — balance too soft + bot descent drive weak; feeds Gate-2 thresholds + PHASE-58 | PHASE-34 / PHASE-58 |
| 2026-06-12 | worker | Root vitest config doesn't discover tests/integration/** (explicit config workaround in place) — consider root include | PHASE-57 hygiene |
| 2026-06-12 | orchestrator | In-script stall watchdogs unreliable in live use (fired only in own smoke); cron-loop is the dependable net — debug both scripts | PHASE-57 hygiene |
| 2026-06-12 | orchestrator | Cursor lane degraded ~17:00 JST (3 silent hangs, host auth fine) — re-test before Wave G; if persistent, Wave G goes Codex-serial | before PHASE-48 |
| 2026-06-12 | worker | Root Vitest `include` excludes `app/**/*.test.ts`; 49A uses a grid-local Vitest config for explicit component tests | PHASE-57 hygiene |

## Phase Rotation Procedure

When a phase completes (all checklist items ticked with evidence, human accepted):

1. Archive this file's phase sections to `docs/progress-archive/PHASE-XX.md`.
2. Reset: Active Phase, Task Queue, Phase Checklist; keep Validation Log's last 5
   entries; carry Backlog forward untouched.
3. Update Active Phase to the next phase plan; copy its completion criteria into
   the checklist.
4. Orchestrator commits the rotation as a single commit: `Phase XX: close & rotate`.
