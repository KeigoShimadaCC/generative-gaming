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
- **Trap 2b — a prose spec is NOT a frozen interface.** 23A (recorder) and 23B
  (replayer) built to the same TECH_SPEC §5 paragraph independently and did not
  round-trip: 7 reconciliation findings (field shapes, id schemes, off-by-one
  turn semantics, duplicated hash code). Freeze-first only works when the
  frozen thing is machine-checkable — a type, a schema, or a committed example
  file — never a doc section both sides "interpret." Producer/consumer pairs
  must either share a frozen artifact or be serialized. (phase23-reconcile)
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

## 10. Later Findings (Waves C–D)

- **Discipline that fails twice gets mechanized, not re-resolved.** The
  orchestrator skipped its own mandatory stall watch twice under throughput
  pressure (stalls #4–5 sat undetected). Fix: the watchdog moved INTO
  codex-run.sh (grace 60s, static-under-500B for 5m → process-group kill, exit
  124, ledger row). It fired correctly on a real stall within minutes of being
  built. Rules for the orchestrator must live in the tools, not in resolve —
  the same lesson as workers' "the brief is the court order," one level up.
- **The stall mystery had a root cause all along: codex session concurrency.**
  A watchdog-instrumented smoke stalled exactly while a concurrent live ambient
  call ran, and completed in 5s alone. All five no-event stalls fit the
  pattern. Consequence: one codex process at a time is a *system-wide*
  invariant — including the shipped game's runtime ambient calls (enforced by
  a global single-flight semaphore in the prefetch controller).
- **Ambient CLIs are a viable $0 inference backend** behind a provider seam:
  ~30s/manifest via `codex exec`, pure-JSON output at high parse rates once the
  prompt embeds a full example; your own validation gauntlet replaces provider-
  side schema enforcement. Constraints: host-side only (nested codex needs a
  writable CODEX_HOME), strictly serialized, watchdogged.
- **Timebox kills can salvage, not just abort.** PHASE-24's worker was killed
  at 2× timebox — its implementation was complete and green; it had spent the
  overrun re-running a slow test to format its report table. Inspect before
  re-briefing: the kill is a checkpoint, not a verdict.
- **Live measurement beats green tests for LLM-integrated work, again.** The
  M1 evidence run's 10/10 "served" hid a serving defect (gate-failing floors
  shipped as generated) discovered only by reading the artifact chain, and a
  calibration deadlock (playability thresholds tuned for a balance that
  doesn't exist yet — every floor "fails", so the gate either blocks
  everything or gets silently bypassed). Staging answer: config-flagged
  advisory mode for uncalibratable checks, recorded in every report, blocking
  restored when calibration lands. Never silently bypass; never block on a
  meaningless threshold.
- **Tune prompts like code: forensics → hypothesis → measured rounds, capped.**
  The validity gap closed in 2 rounds (0/5 → passing) by cataloging actual Zod
  error paths and hardening exactly those — with an honest recorded trade
  (conservative content) and a capped iteration count to prevent thrash.

## 11. Late-Run Findings (Waves E–H)

- **Single-vendor lanes fail whole.** Cursor hung silently five times in one
  afternoon (0-byte output, process alive, host auth fine before and after) —
  a service-side bad day. The reroute protocol (two hangs on one brief →
  switch executor) kept the project moving at the cost of parallelism;
  verification degraded from cross-CLI to fresh-session-same-CLI, which
  preserved the independence that matters (no authorship stake) but not
  vendor diversity. Plan for lane outage as a normal mode, not an exception.
- **The watchdogs we built didn't fire in live use.** Both in-script watchdogs
  worked in their own smoke tests and then missed real stalls — because real
  stalls also happen MID-session (file >500B, then static), a variant the
  size-threshold logic ignores. The dependable net ended up being the dumbest
  mechanism available: a 1–3 minute cron loop re-invoking the orchestrator,
  plus ScheduleWakeup as belt-and-braces. Lesson: watchdog on *growth*, not
  size; and never trust a guard that has only passed its own smoke.
- **The orchestrator's shell is part of the system, and it had bugs.** Two
  self-inflicted incidents: (1) `pnpm run check | tail -1 && git commit` —
  the pipe made `tail`'s exit code the gate, and a red tree got merged;
  (2) `git add -A` swept 1.9GB of `.pnpm-store/` and browser binaries into a
  commit and the push bounced off GitHub's file-size limit. Fixes that stuck:
  redirect-then-`echo EXIT:$?` (never pipe a gate), and a status-scan before
  staging whenever workers touched dependency tooling. Orchestrator habits
  need mechanizing exactly like worker norms — this is §10's lesson applied
  to one's own shell.
- **Cadence pressure erodes the merge gate; structure erodes back.** Under
  serial throughput the orchestrator merged PHASE-48 on the worker's claimed
  green without its own gate run — HEAD went red for an hour (latent
  declaration-merging errors surfaced by 48's tsconfig restructure). Three
  ad-hoc patches later, the structural cure: an events barrel that pins the
  union's scope, with a header rule for future declarers. Two morals:
  declaration-merged types are build-config-fragile (prefer explicit barrel
  registration), and a rule that erodes twice under pressure needs to become
  a script (see §12's merge.sh).
- **Workers enforce the constitution literally — keep it true.** A worker
  refused to start because AGENTS.md says "never write in main" while the
  serial-lane practice (orchestrator merges, no worktrees) had quietly made
  main the de facto workspace. The refusal was CORRECT; the constitution had
  drifted from practice. Silent divergence between the contract and the
  operating mode produces refusals at best and rule-rot at worst — amend the
  doc or waive explicitly per-brief, never rely on workers "getting it."
- **One e2e journey catches what 500 unit tests can't.** The single Playwright
  happy path failed on its first honest run because the web UI had NO way to
  abandon a run — a missing player affordance invisible to every layer that
  tests components in isolation. Budget the e2e early enough to act on what
  it finds.
- **Honest no-ops are deliverables.** The balance pass (58) measured, found
  the blocker non-config (bot simulation never wires the enemy-behavior hook;
  bots take literally zero damage), skipped its tuning iterations with
  written rationale, and changed nothing. That report is worth more than any
  numbers-moved theater — and it exposed that Gate 2's ensemble judges floors
  against passive enemies, a real finding three layers deep.
- **The orchestrator is also the ops layer.** Host-side acts workers cannot
  do in a sandbox: installing Playwright browsers, killing stranded dev
  servers on port 3001, cleaning process pile-ups. Budget orchestrator turns
  for provisioning, not just dispatching.
- **Verifier scrutiny items work.** Pointing the verifier at a specific
  worker-confessed deviation ("read the async hook diff; confirm strictly
  additive via empty test diff") converts a worry into a machine-checked
  fact. Workers' honest deviation confessions + targeted verification is a
  reliable two-step.

## 12. Next-Time Blueprint (do these before the first dispatch)

What we would change in each artifact, ranked by pain saved:

**The harness (`codex-run.sh` / `cursor-run.sh`) — highest leverage:**
1. Watchdog v2: trigger on *no file growth for N minutes at any size* (not
   size<500B), since real stalls are mid-session too; heartbeat line to
   stderr every minute so an outer loop can distinguish alive-quiet from dead.
2. A global codex lockfile in the script itself — one-codex-at-a-time
   enforced by `flock`-style mutual exclusion, not orchestrator discipline
   (the #1 stall cause should be unrepresentable).
3. Auto-retry-once on the startup stall signature (2-event JSONL at 60s)
   before surfacing exit 124 — it recovered 100% of the time manually.
4. A `preflight` subcommand: 10-second echo-smoke per lane before a wave
   begins; detects vendor outage in seconds instead of via silent hangs.
5. Ship `merge.sh`: gate-with-real-exit-code → staging scan (reject
   `node_modules|.pnpm-store|.cache|.next` and >50MB files) → commit with
   co-authors → push. The orchestrator's merge ritual as one atomic script.

**`AGENTS.md`:**
6. Make the workspace rule brief-driven: "work in the workspace your brief
   assigns (default: an isolated worktree)" — kills the constitution-vs-
   practice refusal class while keeping the safety default.
7. Fold in the gate-scope amendments discovered live: scoped gates include
   owned-path lint; `pnpm exec vitest run <path>` (never `pnpm test -- <path>`,
   which runs everything).
8. Simplify commits to what actually happened: workers never commit; the
   orchestrator commits everything with co-author attribution. The two-path
   rule was dead weight once practice settled.

**`CLAUDE.md`:**
9. Describe BOTH operating modes (parallel-worktree and serial-main-tree) and
   when to switch — the doc assumed parallel PRs; the run was 80% serial on
   main, and every divergence cost a small consistency tax.
10. Add the orchestrator shell-hygiene rules as hard text: no piped exit
    codes; no blind `git add -A`; dispatch+watch is one atomic act; pre-read
    the integration surface before writing a brief's owned-files fence (two
    STOPs were brief defects from fencing without reading insertion points).
11. Mechanize-on-second-failure as an explicit rule: any orchestrator
    discipline that fails twice must move into a script/tool before work
    continues.

**`NORTH_STAR.md` / planning:**
12. Name ambient-CLI inference as a first-class provider path from day one
    (it became the project's headline; the API-key path never ran) — and
    write milestone bars as numbers up front (the ≥8/10 served bar was
    invented mid-run).
13. PHASE-00 additions: every brief must carry an explicit branch/workspace
    assignment; producer/consumer pairs must share a machine-checkable frozen
    artifact or be serialized (Trap 2b as planning law); schema phases get
    "author these 3–5 concrete entities as pure data" probes in their
    completion criteria (authorability ≠ table coverage).
14. Pre-seed `.gitignore` with the tooling dirs a worker fleet WILL create:
    `.pnpm-store/`, `.cache/`, `.next/`, browser caches, temp stores.

**Process:**
15. Start the orchestrator decision log at minute zero (backfilling cost an
    hour and reconstruction accuracy).
16. Stand up the keepalive loop (`/loop` or equivalent) BEFORE any unattended
    stretch — the "overnight run" that ran zero phases was a mechanism gap,
    not a planning gap; the cron-tick loop later carried whole waves.
17. Schedule the human checkpoints as a standing checklist file from day one
    and append to it continuously, instead of assembling it at the end.

## 13. The Full-Clear Campaign (post-completion, 2026-06-13)

The user asked one question — "have you tried clearing the full game in a
browser?" — and the answer invalidated more of the system than any gate had.
24 campaign runs found **11 real defects** behind 543 green tests, then
cleared the game twice (seeds fullclear-1 in 2.9m, fullclear-4 in 2.5m).

**Findings, in causal order:**

1. **Behavioral truth beats gate truth, again and harder.** The reference
   runs shipped 4 defects through green gates; this campaign found 11 —
   including combat that had NEVER resolved on bump (movement emitted
   `attack_intent` with unchanged state), which silently invalidated every
   balance number in the project. A game where bots take zero damage passed
   530+ tests for days. The campaign is now the only acceptance evidence we
   trust for "the game works."

2. **Call-site opt-in is a bug factory.** Enemy-behavior hooks were opt-in
   per stepRun call site; the same omission recurred in THREE places (CLI
   simulate, Gate 2 simulator, web session). The fix that ended the class
   was inverting the API: hooks default-on, explicit `hooks:"none"` escape
   hatch. Rule: when forgetting a parameter produces silently-wrong (not
   broken) behavior, the default must be the correct behavior.

3. **Don't hand-roll a second brain.** Browser bot v1–v3 reimplemented
   policy logic by parsing the DOM and died to bugs the CLI policies had
   already solved. v4 bridged the real policy over a dev-only serialized
   state window and immediately played at CLI strength. Reuse the brain;
   bridge the senses.

4. **Diagnostics-on-abort paid for themselves every single round.** The
   screenshot + page HTML + console + bot-state JSON dumps (added in v3)
   turned every failure into a one-read diagnosis: the CSS-module selector
   miss, the arrival one-shot timer, the spawn-budget throw, the L3-at-d7
   under-leveling, the drop-instead-of-use inventory loop. Cost: ~30 lines.

5. **Artifact persistence must never be control flow.** A fixed
   seed+createdAt in the web transport made every second session collide
   with append-only generation records (10,953 errors in one run), and the
   same error class later failed verification as unhandled prefetch
   rejections. Evidence writes should no-op on conflict, never throw into
   game logic.

6. **Fixture content is not the calibrated game.** Balance was calibrated
   on the fallback pack; the e2e transport served hand-made fixtures (2
   enemies, no heals) — so the browser game was a different, unwinnable
   game (L3 with shallows gear at depth 7). DIRECTOR=fallback mode aligned
   the campaign with the calibrated content. Rule: behavioral tests must
   run the same content distribution you tuned.

7. **The campaign found a real player-facing engine bug nothing else
   could:** opening a door rebuilt floor geometry and wiped
   decorativeFeatures — players lose the Hoard marker. Three layers of
   tests missed it; the CLI driver had silently worked around it; only the
   un-workaround-ed browser path exposed it.

8. **Stall protocol matured:** 4 codex no-event stalls (101-byte jsonl
   signature); kill+relaunch recovered 2; a double-stall on one brief was
   rerouted to Cursor per the two-stall rule and delivered. Lanes are
   redundant, not ranked.

9. **Kill process GROUPS.** Killing a Playwright parent orphaned its
   `next dev` webServer at 117% CPU, which silently wedged the NEXT run on
   the occupied port for 25 minutes. Campaign runners now get pkill by
   pattern, then verify zero survivors.

10. **The balance chain was an investigation, not a tuning pass:** 0-WIN →
    extreme-lever STOP (proved levers insufficient) → turn-ledger (proved
    1-vs-5 exchange) → kit-usage audit (bots never equipped) → calibration
    v2 with player offense as a lever (29/45 WIN) → take_hoard legality fix.
    Each STOP was correct and each escalation carried numbers. Budget
    real calibration as a multi-task chain with diagnosis gates, never as
    one "tune the numbers" task.

## Append Log

| Date | Finding added | Trigger |
|---|---|---|
| 2026-06-11 | Initial document: §1–§9 from the first day's run (Waves A + half of B: 16 phases, 35+ sessions, 5 failures recovered, 3 doc ambiguities adjudicated) | human request |
| 2026-06-12 | Trap 2b (prose spec ≠ frozen interface); authorability vs table coverage (§4) | 23 reconciliation; 14 STOPs |
| 2026-06-12 | §10: watchdog mechanization, concurrency root cause, ambient backend, timebox salvage, advisory-mode staging, prompt forensics | Waves C–D close |
| 2026-06-12 | §11: lane outage, live watchdog gap, orchestrator shell bugs, merge-gate erosion + events barrel, constitutional refusal, e2e's UX catch, honest no-ops, ops duties | Waves E–H close |
| 2026-06-12 | §12: the next-time blueprint (17 items across harness, AGENTS, CLAUDE, NORTH_STAR/planning, process) | human request at project close |
| 2026-06-13 | §13: full-clear campaign — 24 runs, 11 defects behind green gates, two browser full clears; default-on APIs, policy-bridge pattern, diagnostics-on-abort, artifact-write hygiene, fixture-vs-calibrated content, process-group kills | human request ("clear the full game") |
