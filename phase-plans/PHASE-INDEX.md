# PHASE-INDEX — Roadmap, Dependencies, Parallel Groups

The execution map for all phase plans. Each row is a real plan file in this folder.
Letter-suffixed siblings (e.g., 07A/07B) are file-disjoint and may run in parallel —
but remember: **only one Codex session at a time** (CLAUDE.md); parallel tracks are
Cursor tracks or a Codex+Cursor pair. Waves run in order; within a wave, the
Depends-on column governs.

Estimates are worker wall-clock from the velocity ledger baseline; the orchestrator
re-estimates at dispatch as the ledger fills.

## Wave A — Foundations

| Phase | Title | Depends on | Parallel with | Est |
|---|---|---|---|---|
| 01A | Spike: Codex CLI environment verification | — | 01B | 15m |
| 01B | Spike: Cursor CLI environment verification | — | 01A | 15m |
| 02 | Orchestration harness scripts | 01A, 01B | — | 30m |
| 03 | Repo scaffold (pnpm, TS, lint, vitest, check) | 02 | — | 30m |
| 04A | CI pipeline (PR gates, mocked only) | 03 | 04B, 04C | 20m |
| 04B | Tunable config module ([T] values) | 03 | 04A, 04C | 20m |
| 04C | Seeded RNG + injected clock | 03 | 04A, 04B | 20m |
| 05 | Schemas & content vocabularies | 04B, 04C | — | 45m |

## Wave B — Engine Core (M0)

| Phase | Title | Depends on | Parallel with | Est |
|---|---|---|---|---|
| 06 | Engine state model & serialization | 05 | — | 40m |
| 07A | Map model, terrain, FOV | 06 | 07B | 45m |
| 07B | Turn cycle, structured actions, terminal states | 06 | 07A | 45m |
| 08 | Movement & collision | 07A, 07B | — | 25m |
| 09 | Combat resolution | 08 | 10 | 25m |
| 10 | Status effects engine | 07B | 09 | 35m |
| 11 | Player systems (XP, fullness, regen) | 09, 10 | 12 | 30m |
| 12 | Inventory & equipment | 06 | 11 | 30m |
| 13A | Effect interpreter I (core verbs) | 10, 12 | 13B | 40m |
| 13B | Effect interpreter II (spatial/meta verbs) | 10, 12 | 13A | 40m |
| 14 | Item system (triggers, targeting, identification) | 13A, 13B | — | 45m |
| 15A | Behaviors I (movement-class) | 08, 09 | 15B | 40m |
| 15B | Behaviors II (special-class) | 08, 09 | 15A | 40m |
| 16 | Enemy assembly & cost function | 15A, 15B | — | 30m |
| 17 | Floor generation (rooms, corridors, solvability) | 07A | 13–16 | 50m |
| 18 | Traps & floor features | 14, 17 | 19 | 25m |
| 19 | NPC mechanics (dialogue, barter) | 06 | 18 | 35m |
| 20 | Quest system (6 objective types) | 19 | — | 40m |
| 21 | Run loop, caps, win/loss, the Hoard | 17, 20 | 22 | 35m |
| 22 | ASCII renderer & log events | 07A | 21 | 30m |

## Wave C — Harness & Offline Game (M0)

| Phase | Title | Depends on | Parallel with | Est |
|---|---|---|---|---|
| 23A | Trace recording (NDJSON, stamping) | 21 | 23B | 30m |
| 23B | Trace replay | 21 | 23A | 30m |
| 24 | Bot players (cautious/balanced/aggressive) | 23A | — | 45m |
| 25A | CLI: human terminal play | 22, 23A | 25B | 30m |
| 25B | CLI: simulate / batch / replay | 23B, 24 | 25A | 30m |
| 26 | Fallback content pack (Old Stock) | 14, 16, 20 | 23–25 | 45m |
| 27 | SQLite persistence (profiles, run memory) | 23A | 26 | 35m |
| 28 | M0 integration & milestone smoke | all Wave C | — | 30m |

## Wave D — Director Pipeline (M1)

| Phase | Title | Depends on | Parallel with | Est |
|---|---|---|---|---|
| 29 | Spike: live provider contract test | 05, key available | — | 15m |
| 30 | Floor manifest schema | 29 | — | 40m |
| 31 | Provider seam, model config, mocks | 30 | 32 | 35m |
| 32 | Prompt assembly (canon, trace summary) | 30 | 31 | 40m |
| 33 | Gates 0–1: structure & legality | 30 | 34 | 35m |
| 34 | Gate 2: simulated playability | 24, 30 | 33 | 45m |
| 35 | Manifest → floor application | 17, 30 | 33, 34 | 35m |
| 36 | Repair loop & fallback degradation | 33, 34, 35 | 37 | 30m |
| 37 | Generation artifact persistence | 23A, 30 | 36 | 25m |
| 38 | Background prefetch & server route | 31–37 | — | 40m |
| 39 | M1 integration & milestone smoke | 38, 28 | — | 30m |

## Wave E — Evals (M1)

| Phase | Title | Depends on | Parallel with | Est |
|---|---|---|---|---|
| 40A | Persona trace bank | 24 | 40B | 35m |
| 40B | Metric scoring library | 34 | 40A | 35m |
| 41 | Eval runner CLI & reports | 40A, 40B | — | 35m |
| 42 | Novelty & responsiveness metrics | 41 | — | 40m |
| 43 | Eval CI wiring, thresholds, regression gates | 41, 42 | — | 25m |

## Wave F — Director Quality (M2) — parallel with Wave G

| Phase | Title | Depends on | Parallel with | Est |
|---|---|---|---|---|
| 44 | Run & cross-run memory | 27, 32 | Wave G | 40m |
| 45 | Narration beats & Gate 3 heuristics | 32, 36 | Wave G | 40m |
| 46 | LLM-judge gate & signature moment | 45 | Wave G | 40m |
| 47 | Responsiveness tuning round (eval-driven) | 42, 44–46 | — | 45m |

## Wave G — UI (M2) — parallel with Wave F

| Phase | Title | Depends on | Parallel with | Est |
|---|---|---|---|---|
| 48 | Next.js scaffold & API transport | 28 | Wave F | 35m |
| 49A | Grid renderer & fog | 48 | 49B | 40m |
| 49B | HUD & message log | 48 | 49A | 30m |
| 50 | Keyboard input & action dispatch | 49A | — | 35m |
| 51A | Inspect cards & inventory panel | 50 | 51B | 35m |
| 51B | Dialogue & quest log UI | 50 | 51A | 35m |
| 52 | Floor transition & generation handoff UX | 38, 50 | 53 | 30m |
| 53 | Title screen, settings, run index | 48 | 52 | 30m |
| 54A | Dungeon diary view | 45, 53 | 54B | 30m |
| 54B | Artifact viewer | 37, 53 | 54A | 30m |
| 55 | Playwright e2e happy path | 52, 51A | — | 25m |
| 56 | M2 integration & milestone smoke | Waves F+G | — | 30m |

## Wave H — Hardening & Release (M3)

| Phase | Title | Depends on | Parallel with | Est |
|---|---|---|---|---|
| 57 | Golden seeds & determinism audit | 56 | 58 | 30m |
| 58 | Balance pass (eval-driven tuning) | 56 | 57 | 40m |
| 59 | Demo through-line hardening | 57, 58 | — | 40m |
| 60 | README, ADRs, docs polish | 56 | 59 | 35m |
| 61 | M3 final acceptance | 59, 60 | — | 20m |

**Total: 73 phases.** Milestone gates (28, 39, 56, 61) end with human acceptance
(CLAUDE.md human-in-the-loop #4) and a full behavioral smoke. The orchestrator may
re-sequence within a wave as the velocity ledger and discoveries dictate; crossing
wave boundaries early requires the dependency column to be satisfied, nothing else.
