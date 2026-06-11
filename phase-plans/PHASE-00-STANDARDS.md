# PHASE-00 — Phase Plan Standards & Global Invariants

This file defines what a phase plan **is** in this repository. Every
`phase-plans/PHASE-XX-*.md` follows this format and inherits these global rules.
The orchestrator authors phase plans against this standard; workers treat the
active phase plan as their implementation contract (AGENTS.md). A phase plan that
deviates from this format is invalid — fix the plan, don't improvise around it.

---

## 1. Naming, Numbering, Sizing

- Filename: `PHASE-XX-SHORT-SLUG.md` (e.g., `PHASE-02-ENGINE-CORE.md`).
- Numbers are execution order. Parallel sibling phases share a number with a
  letter suffix: `PHASE-04A-...`, `PHASE-04B-...` — siblings must have disjoint
  owned-file sets and no dependency on each other.
- **Sizing rule:** a phase is one mergeable, demonstrable increment — 2–6 tasks.
  A task is **≤ ~30 minutes of estimated worker wall-clock** (velocity-ledger
  units: medium feature ≈ 15–20 min, focused fix ≈ 3–9 min). If a task's estimate
  exceeds 30 min, split the task; if a phase needs more than ~8 tasks or two
  sentences to state its objective, split the phase.
- **Vagueness test (apply to every task before dispatch):** can the worker
  *assemble* this from the brief's context payload alone — no contract design, no
  schema invention, no "figure out how X works"? If not, the task is not ready:
  it needs a spike first, a contract freeze, or a smaller cut. Unknowns are never
  priced as work.
- **Task types:** `spike` (timeboxed ≤15 min, output = knowledge/frozen contract,
  code is throwaway), `implement`, `verify` (read-only audit), `integrate`
  (merge + behavioral smoke). Every task in the breakdown declares its type.
- Phases are bite-sized on purpose: small phases keep agent context small, audits
  cheap, timeboxes meaningful, and rollbacks trivial.

## 2. Required Sections (every phase plan, this order)

1. **Objective** — one sentence. What exists after this phase that didn't before.
2. **Context** — links to the governing doc sections (NORTH_STAR / TECH_SPEC /
   UX / WORLD / GAME_DESIGN §s) this phase implements. No restating content —
   link, don't copy.
3. **Dependencies** — phases that must be merged first; external prerequisites
   (e.g., API key available).
4. **Scope IN** — explicit list of what this phase delivers.
5. **Scope OUT** — explicit list of adjacent things this phase does NOT touch,
   especially the tempting ones. Completion criteria are hard boundaries, not
   starting points (AGENTS.md). When in doubt, OUT.
6. **Owned files** — exact paths/globs this phase may create or modify. Must be
   disjoint from any concurrently running phase. Everything else is read-only.
7. **Task breakdown** — the individual worker briefs: per task, its type
   (spike / implement / verify / integrate), objective, owned-file subset,
   suggested agent (Codex for deep/large, Cursor composer-2.5 for
   small/parallel/verification), **estimate + timebox**, and ordering/parallelism
   notes. Phases with parallel tasks must follow the **freeze → fan out →
   integrate** shape: a serial contract-freezing task first (schemas, types,
   file ownership), then file-disjoint parallel assembly, then one serial
   integration task that merges and runs the behavioral smoke. Never parallelize
   exploratory or coupled work — design is serial, only assembly fans out.
   Remember Codex sessions are serialized globally (CLAUDE.md): parallel tracks
   are Cursor tracks.
8. **Verification commands** — the exact commands whose green output proves the
   phase: always `pnpm run check`, plus phase-specific simulations, golden-seed
   replays, or `@live` contract tests.
9. **Completion criteria** — numbered, observable facts checkable against the
   repo. These get copied into PROGRESS.md's checklist verbatim and ticked only
   with evidence. Must include a **behavioral smoke** (actually running the
   artifact: a CLI playthrough, a simulated run, a real request) — green gates
   alone have shipped real defects before — and a **pre-registered acceptance
   bar**: the demo-visible outcome that makes this phase "good," written before
   work starts so quality gaps are designed out, not discovered in review.
10. **Risks & escalation** — known hazards, the rollback story (worktree deletion
    must always suffice), and what triggers a stop-and-report to the human.

## 3. Global Invariants (inherited by every phase, restated nowhere)

- **The doc spine governs.** NORTH_STAR §4 invariants, TECH_SPEC layer boundaries
  and dependency directions, GAME_DESIGN [HARD] bounds and closed vocabularies,
  WORLD hard canon, UX latency budgets. A phase plan may narrow these, never
  loosen them. Loosening requires a human-approved edit to the governing doc
  *before* the phase plan is written.
- **One writer per file** across all concurrent work — enforced at planning time
  via §2.6 disjointness, re-checked at dispatch.
- **Worktree discipline:** every task runs on `phase-XX/<slug>` in its own
  worktree; merge order is worker → independent verifier → orchestrator merges
  (CLAUDE.md). Never merge before verification.
- **LLM-integrated phases: live provider contract test is subtask 1.** Before any
  pipeline code is built around a schema, one real API call proves the provider
  accepts it. No exceptions — this is the most expensive lesson in the reference
  material.
- **Tests move with behavior.** Every task that changes behavior updates tests in
  the same task. Deleting/skipping tests to pass = automatic phase failure.
- **Evidence-based completion:** phase done = criteria verified against the repo
  and logged in PROGRESS.md, never worker self-report.
- **Scope discoveries → PROGRESS.md backlog.** No drive-by fixes, no roadmap
  promotion mid-phase.
- **Config over constants:** all [T] values from GAME_DESIGN live in the single
  tunable config module; no magic numbers in implementation files.
- **Determinism guard:** no `Math.random`, `Date.now`, or wall-clock in engine or
  gauntlet-simulation code paths; seeded RNG and injected clocks only
  (TECH_SPEC §9). Every phase touching these paths includes a determinism test.
- **STEP 0 everywhere:** every brief opens with the current ENVIRONMENT.md facts;
  every worker report's environment discoveries are folded back into
  ENVIRONMENT.md before the next dispatch. Rediscovering a written fact is a
  process defect.
- **Time is tracked:** every task carries estimate + timebox; actuals land in
  PROGRESS.md's velocity ledger at phase close; the next phase is estimated from
  the ledger, not from gut.

## 4. Phase Lifecycle

1. **Author** — orchestrator drafts the plan per §2; checks file-ownership
   disjointness against the queue.
2. **Approve** — human reads and approves the plan (CLAUDE.md human-in-the-loop
   #1). No execution before approval.
3. **Execute** — orchestrator dispatches task briefs; PROGRESS.md tracks state.
4. **Verify** — independent verifier per task; phase-level verification commands
   run green on the integration branch.
5. **Close** — completion criteria checked against the repo (including the
   behavioral smoke); velocity ledger updated with estimate-vs-actual per task;
   new environment facts folded into ENVIRONMENT.md; human accepts; PROGRESS.md
   rotates (its §Phase Rotation); worktrees removed.

A phase that stalls (two failed round-trips on the same task, or a contradiction
discovered in the governing docs) stops and escalates to the human with a written
summary — a precise stuck-report is a valid phase outcome (AGENTS.md §When Stuck).

## 5. The Phase Sequence

The full authored roadmap lives in `PHASE-INDEX.md`: 73 phases across waves A–H
(foundations → engine → harness/M0 → Director/M1 → evals → Director quality ∥
UI/M2 → hardening/M3), with per-phase dependencies, parallel groups, and estimates.
Each plan executes only after human approval (§4). The orchestrator keeps the
index's dependency and parallel columns authoritative and re-sequences within
waves as the velocity ledger dictates.

## 6. Template (copy for every new phase plan)

```markdown
# PHASE-XX — <Title>

## 1. Objective
## 2. Context
## 3. Dependencies
## 4. Scope IN
## 5. Scope OUT
## 6. Owned files
## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
## 8. Verification commands
## 9. Completion criteria
## 10. Risks & escalation
```
