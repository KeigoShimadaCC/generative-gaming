# PROGRESS.md — Live Coordination

The single live coordination file for this repository. The orchestrator (CLAUDE.md)
owns it; workers update only the rows and log entries their brief tells them to.
This file records *state*, never *design* — design lives in the doc spine
(NORTH_STAR, TECH_SPEC, UX, WORLD, GAME_DESIGN) and `phase-plans/`.

---

## Active Phase

**Phase:** M3 final acceptance - human checklist
**Phase plan:** phase-plans/PHASE-61-M3-ACCEPTANCE.md
**Started:** 2026-06-12
**Status:** mechanical close-out complete; Waves A-H mechanically closed; CI green link, player sessions, and final human verdict pending
**Active human item:** runs/milestones/HUMAN-CHECKLIST.md

## Task Queue

No worker tasks queued. The remaining active work is the human checklist:
runs/milestones/HUMAN-CHECKLIST.md.

Status values: `queued` → `claimed` → `in-progress` → `ready-for-verify` →
`verified` → `merged` (or `blocked` / `returned` with a note).

## Phase Checklist

*(Copied from the active phase plan's completion criteria when a phase starts;
ticked only with evidence linked in the Validation Log.)*

- [x] M3 observation sheet prepared: `runs/milestones/m3/observation-sheet.md`
- [x] M3 report draft prepared with mechanical evidence slots: `runs/milestones/m3/report-draft.md`
- [x] Human checklist delivered: `runs/milestones/HUMAN-CHECKLIST.md`
- [x] Final mechanical gate sweep green: command results below
- [ ] 3+ M3 real-player sessions collected
- [ ] Human final acceptance recorded

## Validation Log (append-only)

Format: `YYYY-MM-DD · phase/task · who · what was verified · evidence (command/output path/PR)`

| Date | Task | Agent | Verified | Evidence |
|---|---|---|---|---|
| 2026-06-12 | 51AB-1 | Codex | Context panels complete: inspect truthfulness, 16-slot inventory/equipment/actions, dialogue replies/barter pause, quest checklist/markers/HUD chip, panel focus routing, one visible frame | `pnpm exec vitest run --config app/components/panels/vitest.config.ts --reporter verbose` → exit 0, 1 file / 5 tests passed; required names: "keeps inspect card truthfulness: unknown item shows exactly the unknown and witnessed facts appear only after witnessing", "walks a fixture conversation by keyboard through barter while paused"; `pnpm exec vitest run --config app/components/hud/vitest.config.ts --reporter verbose` → exit 0, 1 file / 2 tests passed; `pnpm exec vitest run --config app/input/vitest.config.ts --reporter verbose` → exit 0, 2 files / 6 tests passed; `pnpm exec vitest run --config app/components/grid/vitest.config.ts --reporter verbose` → exit 0, 1 file / 4 tests passed; clean `.next` then redirected `pnpm run check` → exit 0, 78 files / 529 passed / 2 skipped |
| 2026-06-12 | 52/53-1 | Codex | Floor transition UX + title/settings/run index complete: ready/in-flight/none transition matrix, identical generated/fallback presentation, interruptible ready theater, arrival ritual timing, title/terminal flow, persisted settings, local run index, replay stepping through real grid, web session trace recording | `pnpm exec vitest run --config app/components/transition/vitest.config.ts --reporter verbose` → 1 file / 5 passed; `pnpm exec vitest run --config app/components/settings/vitest.config.ts --reporter verbose` → 1 file / 4 passed; `pnpm exec vitest run --config app/components/title/vitest.config.ts --reporter verbose` → 1 file / 3 passed; `pnpm exec vitest run --config app/components/runindex/vitest.config.ts --reporter verbose` → 1 file / 2 passed; `pnpm exec vitest run --config app/input/vitest.config.ts --reporter verbose` → 2 files / 7 passed; redirected `pnpm run check > /tmp/phase5253-check.log 2>&1` → exit 0, 78 files / 529 passed / 2 skipped; `PORT=3001 pnpm run dev` + `curl -I http://localhost:3001/` → 200 OK; in-app browser navigation tool unavailable |
| 2026-06-12 | 54AB-1 | Codex | Dungeon diary + artifact viewer complete: composer purity/faithfulness, fixture diary content, Tab-layer/final diary UI, reader-backed artifact tree/doc/search/copy/fallback view, read-only audit | `pnpm exec vitest run src/harness/diary.test.ts --reporter verbose` → 1 file / 3 passed; explicit app configs (`grid`, `hud`, `log`, `panels`, `transition`, `settings`, `title`, `runindex`, `input`, `diary`, `artifacts`) → all exit 0, 39 app tests passed total; `rg -n "writeGenerationRecord|writeFile|writeNewFile|makeDir|rename\\(|nodeArtifactFsAdapter|fs\\.write|localStorage\\.setItem|removeItem" app/components/artifacts` → no matches; clean `.next` then redirected `pnpm run check > /tmp/phase54-check.log 2>&1` → exit 0, 79 files / 532 passed / 2 skipped |
| 2026-06-12 | 56-M2 | Codex | M2 mechanical evidence complete: persisted two-run memory in prompt, diary faithfulness, responsiveness baseline assertion, transition instrumentation, read-only artifact API bridge, milestone report | `pnpm exec vitest run --config app/components/artifacts/vitest.config.ts --reporter verbose` → 1 file / 3 passed; `pnpm exec vitest run --config tests/integration/vitest.config.ts tests/integration/m2.test.ts --reporter verbose` → 1 file / 4 passed; `pnpm run typecheck` → exit 0; `pnpm run lint` → exit 0; `pnpm run check` → exit 0, 79 files / 532 passed / 2 skipped; report: `runs/milestones/m2/report.md` |
| 2026-06-12 | 57/58-I | Codex | Combined golden determinism + balance pass complete for verify: 45-run fallback batch diagnosed non-config blocker, final config unchanged, goldens regenerated, deterministic audit added | `npm_config_cache=/private/tmp/gg-npm-cache pnpm run simulate -- --batch --policies cautious,balanced,aggressive --seeds 15 --max-turns 8000 --out runs/milestones/balance-01/baseline-quick.json` → exit 0; `npm_config_cache=/private/tmp/gg-npm-cache npx --yes tsx runs/milestones/balance-01/batch-analysis.ts --label=baseline` → 45 ABORT / 0 WIN / 0 LOSS, 0 player damage, 44,603 enemy actor turns, 0 enemy behavior events; `pnpm exec vitest run --config tests/golden/vitest.config.ts --reporter verbose` → 1 file / 9 passed; `npm_config_cache=/private/tmp/gg-npm-cache pnpm exec vitest run --config tests/determinism-audit/vitest.config.ts --reporter verbose` → 1 file / 3 passed; `pnpm run check` → exit 0, 79 files / 532 passed / 2 skipped |
| 2026-06-12 | 61-M3-close | Codex | M3 close-out artifacts complete; local mechanical gate sweep green; CI green link still pending because latest HEAD CI is red | `runs/milestones/m3/observation-sheet.md`; `runs/milestones/m3/report-draft.md`; `runs/milestones/HUMAN-CHECKLIST.md`; `pnpm run check` -> typecheck pass, lint pass, Vitest 79 files / 532 passed / 2 skipped; golden replay -> 1 file / 9 passed; determinism audit -> 1 file / 3 passed; mocked eval baseline -> complete, 15 records, threshold check passed (112 metrics, 0 regressions); latest CI checked: `https://github.com/KeigoShimadaCC/generative-gaming/actions/runs/27422222478` -> failure |

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
| 52/53-1 | implement | Codex | 60m | — | ~80m | over estimate: combined serial lane touched four new UI surfaces plus session trace/persistence/transition orchestration and full explicit app suites |
| 54AB-1 | implement | Codex | 60m | — | ~15m | clean combined pass; existing artifact source is reader-only, browser run has no artifact API yet |
| Wave F (44-47) | mixed | Codex | 2h45m plan | — | ~86m recorded | memory, narration, judge, tuning; includes retries/fix-forward and Wave F verify |
| Wave G (48-56) | mixed | Codex | 6h25m plan | — | ~3h15m recorded | UI serial lane plus e2e/M2; includes failed Cursor attempt, event-union repair, abort fix |
| Wave H (57-61) | mixed | Codex | 2h45m plan | — | ~49m observed | 57/58 hardening + 59/60 polish recorded at ~29m; Phase 61 close-out approximately ~20m vs 30m estimate |

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
| 2026-06-12 | worker | Bot/replay simulation path emits enemy `actor_turn` events but no enemy behavior events because `stepRun` is called without the existing behavior actor hook; PHASE-58 config tuning cannot calibrate HP retention until this is wired | PHASE-58 follow-up |
| 2026-06-12 | worker | Final-floor bot policies only move toward the Hoard after it is visible/remembered; depth-12 batches ABORT without WIN despite `take_hoard` being prioritized when available | PHASE-58 follow-up |
| 2026-06-12 | close-out | Bot WIN-drive gap: bots reach depth 12 but do not reliably pursue/trigger the Hoard WIN path | post-MVP balance/bot pass |
| 2026-06-12 | close-out | Balance calibration: HP retention and enemy behavior pressure remain under-instrumented until the simulation path runs behavior hooks | post-MVP balance pass |
| 2026-06-12 | close-out | Completionist detector: review whether presence checks are too weak and need stronger quest/NPC engagement evidence | post-MVP eval tuning |
| 2026-06-12 | close-out | Test-event union leak: previous UI/check work exposed event-union narrowing fragility; keep a hygiene task for test/event barrel boundaries | post-MVP type hygiene |

## Phase Rotation Procedure

When a phase completes (all checklist items ticked with evidence, human accepted):

1. Archive this file's phase sections to `docs/progress-archive/PHASE-XX.md`.
2. Reset: Active Phase, Task Queue, Phase Checklist; keep Validation Log's last 5
   entries; carry Backlog forward untouched.
3. Update Active Phase to the next phase plan; copy its completion criteria into
   the checklist.
4. Orchestrator commits the rotation as a single commit: `Phase XX: close & rotate`.
