# AUTOMATION_FINDINGS.md — Living Notes on Orchestrating Coding Agents

What we have learned running this project hands-off: one orchestrator (Claude
Fable 5) dispatching Codex and Cursor (composer-2.5) workers through a scripted
harness. Every finding here is grounded in a real session, commit, or failure in
this repo — evidence pointers in parentheses refer to `scripts/ledger.tsv`
labels, `docs/ORCHESTRATION_LOG.md` entries, or commits.

This is a **living document**: the orchestrator appends findings as they are
earned, dated. ENVIRONMENT.md holds the raw machine facts; this file holds the
*judgment* — what works, what bites, and the patterns worth reusing in the next
project. Sections are themed, not chronological.

---

## 1. The Harness (one chokepoint, or chaos)

- **Funnel every session through a run-script.** Uniform sandbox flags, JSONL
  session logs, wall-clock timing, token extraction, one ledger row per session.
  The ledger answered "how long have we been doing this / what did it cost" in
  one command; without it those questions are archaeology. (phase02, ledger.tsv)
- **`codex exec` must have stdin redirected (`< /dev/null`).** Without it the
  session prints "Reading additional input from stdin..." and hangs forever with
  a 2-event JSONL. Cost us a 15-minute timebox on day one. (stall #1)
- **Prefer `@brieffile` over long inline prompts for Codex.** Both of our
  no-event stalls happened on inline-prompt dispatches; neither recurred via
  brief files. Inline prompts also accumulate shell-quoting hazards. Brief files
  are additionally reviewable, diffable, and reusable. (stalls #1–2)
- **Watch the event stream, not the process.** A stalled Codex session looks
  identical to a thinking one from the outside; the JSONL byte count is the
  tell. Standard guard now: alert if the session file is static below ~500
  bytes for 5 minutes. Long healthy sessions stream constantly (PHASE-05: 782s,
  4.2M tokens, never silent for long).
- **Token usage lives in `turn.completed`:** `usage.{input_tokens,
  cached_input_tokens, output_tokens, reasoning_output_tokens}`. Not visible
  from inside the session (a worker probing its own log can't see it — 01A
  tried); the harness extracts it from outside.
- **Nested Codex needs a writable `CODEX_HOME`.** Workers that launch `codex`
  themselves (our harness smoke test did) hit a read-only `~/.codex` wall; the
  harness works around it with a temp home + auth copy. Discovered only because
  a worker's definition-of-done required a live self-smoke. (phase02-task1)
- **Name collisions are real:** on this machine `agent` is the grok CLI, not
  Cursor (`cursor-agent`). Verify binaries before the first dispatch; never
  trust a reference doc's command names. (preflight, 01B)
- **Transient provider failures (HTTP 502) happen.** Same protocol as stalls:
  check for partial output, relaunch identical once. Cursor's 502 left zero
  partial state, making the relaunch trivially safe. (phase13b-geometry)

## 2. Writing Briefs (this is 80% of the game)

The reference projects said it; this run proved it harder: **a gap-free brief
one-shots; a gappy brief pays an exploration tax or improvises.**

The structure that has one-shotted ~90% of tasks here:

```
1. Title — task type + phase contract pointer ("read it first")
2. STEP 0 — environment facts relevant to THIS task (from ENVIRONMENT.md)
3. OWNED FILES — exact paths, plus what is explicitly NOT owned
4. THE WORK — numbered, concrete, with doc §-references for every rule
5. DEFINITION OF DONE — exact commands to run, outputs to PASTE (not claim)
6. "Report + AMBIGUITIES + actual time. NO commit. Then stop."
```

- **Negative space is as load-bearing as positive instructions.** "Do NOT
  create path.ts — another worker owns it", "do NOT modify src/engine/turn",
  "the status SYSTEM is PHASE-10, do not implement ticking". Zero ownership
  collisions across 14 parallel-or-adjacent tasks, entirely attributable to
  explicit not-yours lists. Workers respect fences they can see.
- **Invite AMBIGUITIES explicitly and praise refusal.** "If GAME_DESIGN is
  ambiguous, STOP on that value, list it, proceed with the rest." Workers used
  it exactly as intended — three real doc gaps surfaced (XP curve, pack_hunter
  N, text caps) and **zero invented numbers** shipped. This single sentence is
  the best quality mechanism we have.
- **Write STOP conditions for architectural surprises.** PHASE-08's brief said
  "if the turn module's extension points cannot express what you need, STOP and
  report, do not modify it." The worker stopped in **one minute** with a precise
  diagnosis instead of deforming a frozen contract over 45. The fix (an
  authorized additive registry) then took one clean task. STOPs are successes;
  price them as such.
- **Paste the map.** §-numbered doc references ("per GAME_DESIGN §6 exactly —
  the table IS the spec") get genuinely read and followed; vague pointers
  ("follow the design doc") would not have produced table-driven tests per row.
- **Definition of done = pasted command output.** Workers' reports reliably
  include real gate output when demanded per-command. "Confirm it works" gets
  you claims; "run X and paste the output" gets you evidence.
- **Demand the actual-vs-estimate time in every report.** Free velocity data;
  workers report it honestly, including overruns with causes.

## 3. Parallelism (worth it, with two specific traps)

- **The working pattern: pairs.** One Codex (depth) + one Cursor (breadth)
  on file-disjoint tasks, one *combined* verification when both land, one merge
  commit. Verification per pair, not per task, halves audit overhead with no
  observed quality loss.
- **Trap 1 — shared-worktree gate pollution.** Disjoint file ownership prevents
  edit conflicts but NOT test-gate collisions: PHASE-11's final `pnpm run
  check` failed on PHASE-12's half-written sibling files. Fix: parallel briefs
  gate only their owned paths (`typecheck` + `pnpm test -- <owned dir>`); the
  full gate runs once at combined verification. (11/12)
- **Trap 2 — interface coupling between siblings.** Solved by the
  **freeze-first protocol**: the sibling that owns the shared interface
  (effects registry, perception helpers) builds and freezes it in the first ~15
  minutes and announces it; the other sibling consumes it read-only. Worked
  twice without drift (13A/13B; planned for 15A/15B).
- **Serialize Codex, parallelize Cursor.** The ambient-auth concurrency risk
  (inherited, deliberately untested) has cost nothing to respect: Codex
  sessions are fast enough that the Cursor lane, verifications, and brief
  pre-staging absorb the serialization.
- **Pre-stage the next briefs while workers run.** Orchestrator idle time goes
  to writing the next pair's brief files; dispatch is then instant on merge.
  This, plus pair-verification, is most of why the hot cadence reached ~12–15
  min per verified phase.
- **Expect integration seams from parallel system pairs and budget a
  consolidation task.** 09 ∥ 10 each made locally-correct choices that diverged
  globally (two death paths; magnitudes pinned in two places). The seams were
  caught by reading both reports side by side, adjudicated, and closed in one
  integration task. Plan for one consolidation per parallel *systems* pair;
  pure-data pairs (map/turn) didn't need one.

## 4. Verification (independent, bidirectional, cheap)

- **Independent verifiers catch real defects, even in good work.** Hit list so
  far: an evidence gap (01B's self-reported model identity), a coverage gap
  (path() no-mutation untested), and they confirmed a subtle seam clean (XP
  spend-vs-total semantics) that would have been expensive to discover at
  integration. Zero false-positive round-trips so far.
- **Coverage audits must be bidirectional.** "Every doc row has a schema" AND
  "no schema exists outside the doc rows" — the second direction is what keeps
  a closed vocabulary actually closed. (phase05-verify)
- **Table coverage ≠ authorability. Verify schemas against use cases, not just
  vocabularies.** PHASE-05 passed a bidirectional table audit yet could not
  express an on-hit-proc weapon (trigger existed; no equipment field could
  carry the bundle) or a cursed item (prose rule, never a table row). Both
  surfaced only when PHASE-14's "thesis test" demanded authoring concrete
  items. Schema verification briefs should include 3–5 "author this entity as
  pure data" probes spanning the *composition* space — and design-doc rules
  that live in prose rather than tables WILL be missed by table-driven audits;
  audit the prose too. (phase14 STOPs #1–2)
- **Give verifiers a verdict protocol:** "End with exactly one line: 'READY'
  or 'NEEDS WORK:' + numbered findings." Parses reliably; numbered findings
  convert directly into round-trip briefs.
- **Verifier informational notes ≠ findings.** Advisories (the @types/node
  shim, the NA-token note) go to the backlog, not into fix loops. The verdict
  line stays binary; judgment stays with the orchestrator.
- **The orchestrator spot-runs the merge gate itself.** One cheap `pnpm run
  check` before committing catches workspace drift the verifier's snapshot
  missed. Trust the verifier for depth, re-run the gate for the moment of merge.

## 5. Contracts & Architecture Under Automation

- **Frozen interfaces + additive-only amendments.** When a frozen module needs
  to grow (it will — our turn contract needed two new extension points), the
  amendment brief demands: *existing tests pass unmodified, or STOP.* Unmodified
  green tests are machine-checkable proof of additivity. Used twice, clean both
  times. (07B-a, registerTickHook)
- **Single source of truth is a maintenance loop, not a state.** The cycle that
  worked: worker flags ambiguity → orchestrator pins the number in the design
  doc → an addendum task wires doc → config → schemas. Numbers flow one way
  (doc → config → code); workers never pin design values in code, and briefs
  say "no literal that exists in config."
- **Make invariants greppable.** `rg 'Math.random|Date.now' src/` as a
  per-phase gate turned "determinism discipline" from a hope into a one-line
  check that has run ~10 times. Choose invariants that grep.

## 6. Failure Handling (the taxonomy so far)

| Failure | Signature | Recovery | Times |
|---|---|---|---|
| Codex stdin stall | 2-event JSONL, silence | kill → relaunch with `< /dev/null` | 1 |
| Codex no-event stall, cause unknown | same | kill → relaunch via `@brieffile` | 1 |
| Cursor HTTP 502 | error in output, no files written | relaunch identical | 1 |
| Worker blocked by sibling WIP | gate fails on unowned files | gate-scoping rule (see §3) | 1 |
| Orchestrator dispatch typo | instant exit, error msg | fix invocation, relaunch | 1 |

The protocol — *detect via event stream → kill → relaunch identical once →
re-brief smaller on second failure* — has recovered everything; "re-brief
smaller" has never yet been needed. Total time lost to all failures: ~25 min
across a multi-hour run.

## 7. Planning Granularity & Estimates

- **73 small phases beat 12 big ones.** A phase = one mergeable increment with
  2–6 tasks ≤30 min each. The 10-section plan format makes brief-writing nearly
  mechanical: briefs are mostly transcription of plan + ENVIRONMENT facts, which
  is why they can be pre-staged in minutes.
- **Plan file-ownership at index time, not dispatch time.** The PHASE-INDEX's
  letter-suffixed siblings with disjoint owned-file sets meant ownership
  collisions were impossible by construction; dispatch only re-checks.
- **Reference velocity baselines were 3–5× too conservative for Codex
  assembly.** Scaffold: 4.4 min vs 30 est; schemas: 13 min vs 45. The velocity
  ledger recalibrated by phase 4. Keep timeboxes at ~2× anyway — they're free
  until they fire, and when they fire they're the stall detector.
- **The clock is the orchestrator, still.** Worker compute is rarely the
  bottleneck; verification dispatch latency, merge hygiene, and brief-writing
  are. Pre-staging and pair-batching attack exactly this.

## 8. Writing AGENTS.md / Worker Instructions That Actually Bind

- **Capability-conditional rules survive environment churn.** Our commit rule
  was written as "IF your sandbox blocks .git → commit plan; ELSE commit
  directly." When the spike *refuted* the blocked-git assumption, the rule
  needed zero rewriting. Prefer conditionals over assertions about tools.
- **Workers genuinely follow written norms** — observed: no-commit discipline
  (100%), owned-file fences (100%), PROGRESS.md row updates when told,
  AMBIGUITIES sections, honest deviation confessions (one worker self-reported
  that its formatting glob touched a sibling's files). The leverage is real:
  every norm you write down is a norm you mostly get.
- **But norms must be repeated in the brief.** Workers reliably honor the
  brief; they only *sometimes* go read AGENTS.md unprompted. The brief's STEP 0
  and footer restate the load-bearing rules (no commit, stop conditions,
  report format). AGENTS.md is the constitution; the brief is the court order.
- **Demand structured reports** (files / evidence / deviations / risks /
  environment discoveries / actual time) and you get them in that shape, which
  makes the orchestrator's read a 30-second scan instead of a transcript dig.

## 9. Record-Keeping (for a run you can audit later)

Three tiers, all append-only, each answering a different question:
- `scripts/ledger.tsv` — *what ran, when, how long, what it cost* (machine-true)
- `docs/ORCHESTRATION_LOG.md` — *what the orchestrator decided and why* (one
  row per dispatch/merge/adjudication/stall, appended at action time)
- `runs/sessions/*` — *exactly what a worker did* (full transcripts)

Plus PROGRESS.md (live state) and git (merges, with worker co-author
attribution). Lesson learned the embarrassing way: we built the worker tiers on
day one but only added the orchestrator log hours in, and backfilling required
reconstruction. **Start the decision log at minute zero.**

---

## Append Log

| Date | Finding added | Trigger |
|---|---|---|
| 2026-06-11 | Initial document: §1–§9 from the first day's run (Waves A + half of B: 16 phases, 35+ sessions, 5 failures recovered, 3 doc ambiguities adjudicated) | human request |
