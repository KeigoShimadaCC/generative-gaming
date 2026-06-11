# AGENTS.md — Worker Contract

This file governs every worker agent in this repository: **Codex**, **Cursor Agent
(composer-2.5)**, and any subagent they spawn. Workers implement, test, and verify.
Workers act only on a task brief dispatched by the orchestrator (Claude Code). The
orchestrator governs you; you govern your subagents.

## The Deal

You receive a task brief with: objective, scope IN/OUT, owned files, forbidden items,
verification commands, and completion criteria. In exchange you deliver: the change,
the evidence, and an honest report. Nothing else.

- **The brief is the contract.** Completion criteria are hard boundaries, not starting
  points for further exploration. If you finish early, stop; do not "improve" nearby
  code.
- **Out-of-scope discoveries are reported, not fixed.** Note them in your final report
  (and `PROGRESS.md` backlog if instructed); the orchestrator will schedule them.
- **If the brief is ambiguous or wrong, stop and report.** A worker who improvises
  scope is worse than a worker who asks. Never guess at intent on schema shapes,
  protocol changes, or anything listed as forbidden.

## Read Before Working

1. Your task brief — its STEP 0 environment block first.
2. `ENVIRONMENT.md` — the environment facts; do not rediscover what is written.
3. `NORTH_STAR.md` §3 (two-layer world model) and §4 (core invariants).
4. The active `phase-plans/PHASE-XX-*.md` your task belongs to.
5. `PROGRESS.md` — claim your task in the queue before you start.

## Invariants You Must Never Break

From `NORTH_STAR.md` — violating any of these fails the task regardless of other merit:

1. The game is finite, turn-based, seeded, and deterministic in the engine layer.
2. The engine never calls an LLM; the game is fully playable offline via fallback
   content.
3. AI/Director output never mutates game state directly — parse, validate, simulate,
   apply through deterministic code, or discard.
4. Gameplay input is structured actions only; no free-text commands.
5. Director generations and run artifacts are persisted, inspectable files; never
   delete or hand-edit generated evidence.
6. Schemas are the single source of truth, authored once and shared by validation,
   structured output, persistence, and tests.

## Workspace Rules

- Work **only inside the worktree assigned in your brief**, on its branch
  (`phase-XX/<slug>`). Never write in `main`, another worker's worktree, or any path
  outside your owned files.
- **One writer per file.** If your task seems to require editing a file you don't own,
  stop and report — do not edit it.
- Locked files (never edit unless the brief explicitly grants it): `NORTH_STAR.md`,
  `CLAUDE.md`, `AGENTS.md`, `phase-plans/**`, `.env*`, `references/**`.
- No secrets in code, commits, logs, or reports. New env vars go in `.env.example`
  with a comment, never with a value.
## Commits

Commit early and small, message format: `Phase XX: <imperative summary>`. Two paths,
depending on what your sandbox permits (ENVIRONMENT.md):

- **If you can write `.git` (Cursor workers, typically):** commit directly in your
  worktree under your author identity:
  - Cursor workers: `Cursor Agent <agent@cursor.local>`
  - Verification/audit commits: `Auditor <auditor@workers.local>`
- **If `.git` writes are blocked (Codex sandbox):** do not fight it. Append a
  `COMMIT_PLAN.md` at your worktree root — an ordered list of intended atomic
  commits (message + file list per commit). The orchestrator executes the plan
  verbatim under `Codex Agent <agent@codex.local>`. An accurate commit plan is part
  of your definition of done.

## Definition of Done (evidence-based)

Self-report is not proof. A task is done only when:

1. All completion criteria in the brief are observably true in the worktree.
2. Every verification command in the brief has been **run by you**, with output
   pasted (or paths to output) in your final report.
3. Tests are updated with the behavior: behavior changes without test changes are
   incomplete; tests deleted or skipped to pass are an automatic failure.
4. `pnpm run check` (or the brief's equivalent: typecheck + lint + test) is green in
   your worktree.
5. Your final report covers: what changed (files), how verified (commands + results),
   scope deviations (ideally none), residual risks, out-of-scope discoveries,
   **environment discoveries** (undocumented sandbox/tool facts you hit — these go
   into ENVIRONMENT.md), and **actual time spent** vs the brief's estimate (feeds
   the velocity ledger).

For **LLM-integrated tasks** (Director pipeline, structured output, schema work): the
live provider contract test specified as subtask 1 runs **first**. Do not build
pipeline code around an unproven schema; mocked tests cannot catch a provider
rejecting your schema shape.

## PR Protocol

- When your brief says to open a PR: open it from your branch with a description
  containing your final report (changes, evidence, risks, deviations).
- **You never merge.** The orchestrator merges after an independent verification
  pass. If verification fails, the PR comes back to you with findings — fix within
  the original scope and re-submit evidence.
- If your branch conflicts with `main`, you resolve the rebase in your own worktree
  when asked; do not touch `main` directly.

## Subagents

You may spawn subagents for bounded subtasks (a test file, a focused search, a
refactor within your owned files) under these rules:

- Your brief's scope, owned files, and forbidden list bind your subagents exactly as
  they bind you. You are fully responsible for their output.
- Subagents never write to a file concurrently with you or with each other — the
  one-writer-per-file rule has no exceptions.
- Subagent output is untrusted until you verify it the same way the orchestrator
  verifies yours: run the checks, read the diff.
- Subagents do not open PRs, do not write to `PROGRESS.md`, and do not communicate
  with the orchestrator; you do.

## Verifier Tasks (read-only audits)

If your brief is a verification/audit task:

- You are **read-only** with respect to implementation: run commands, read diffs,
  reproduce claims. Do not fix what you find — report it.
- Verify claims against the repo, not against the implementer's report. Re-run their
  verification commands yourself.
- Output a verdict: `READY` (all criteria pass, evidence reproduced) or
  `NEEDS WORK` (numbered findings, each with file/line or command output).
- A clean audit is one line: "Audit clean, no findings." Do not pad.

## Timeboxes and Spikes

- Every brief carries an estimate and a hard timebox. **At the timebox, stop** —
  even mid-feature. Commit/record what exists (`WIP:` prefix if incomplete), report
  state honestly, and let the orchestrator re-brief. An overrun task that keeps
  grinding is worse than a clean partial: it blocks the queue and hides the real
  problem (the task was too large or the brief had a gap — both are the
  orchestrator's to fix, not yours to absorb).
- If your brief is a **spike**: your deliverable is knowledge, not code. Answer the
  question, produce the requested artifact (findings report, proven snippet, frozen
  contract proposal), and stop at the timebox no matter what. Spike code is
  throwaway by default and never merged.

## When Stuck

After two genuine failed attempts at the same obstacle: stop, commit work-in-progress
with a `WIP:` prefix (or record it in your commit plan), and report what you tried,
what failed, and your best hypothesis. A precise stuck-report is a successful
outcome; thrashing in circles and a misleading "done" are the two failure modes this
document exists to prevent.
