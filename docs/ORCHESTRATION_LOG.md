# ORCHESTRATION_LOG — Who Did What, When

Append-only timeline of orchestrator actions and notable events. Complements
`scripts/ledger.tsv` (worker sessions: machine-recorded, authoritative for
worker timing/tokens), `runs/sessions/` (full worker transcripts), and git log
(merges). All times UTC. Entries before this file's creation are backfilled —
exact where a machine record exists, `~` where reconstructed.

Convention from here on: the orchestrator appends one row per dispatch, merge,
adjudication, stall intervention, or doc-spine edit, at the time it happens.

| Time (UTC) | Actor | Event |
|---|---|---|
| ~08:45 | orchestrator | Wave A approved by human; preflight found `agent`=grok CLI, Cursor is `cursor-agent` → ENVIRONMENT.md |
| ~08:50 | orchestrator | Dispatched 01A (Codex spike) + 01B (Cursor spike) in parallel, raw CLI (pre-harness) |
| 09:04 | worker:cursor | 01B findings landed (5/5 claims) |
| ~09:06 | orchestrator | 01A STALL #1 detected (no-event, stdin pipe); killed; root cause logged |
| ~09:07 | orchestrator | 01A relaunched with `< /dev/null` |
| ~09:14 | worker:codex | 01A findings landed: `.git` writes ALLOWED, `&&` works (2 inherited facts refuted) |
| ~09:15 | orchestrator | Dropped 01A's sanctioned test commit; cross-audits dispatched (Cursor↔01A, Codex↔01B) |
| ~09:20 | worker:codex | 01B audit: NEEDS WORK (claim-4 evidence) → orchestrator round-tripped amendment to Cursor |
| ~09:22 | orchestrator | Spike closeout committed (368712d); PHASE-02 task 1 dispatched (Codex) |
| 09:29–09:38 | worker:both | Harness scripts built + smoked (ledger rows begin here — see ledger.tsv for all subsequent worker timing) |
| ~09:38 | orchestrator | 02 verified READY; adjudication: NA tokens accepted for cursor text mode; committed c033a4d |
| 09:40 | orchestrator | PHASE-03 dispatched — first harness-mediated dispatch |
| ~09:46 | orchestrator | 03 READY; committed 689616b; 04A (Cursor) ∥ 04B (Codex) dispatched |
| ~09:48 | orchestrator | 04A committed b54db42 + pushed; live CI run = verification (GREEN ~09:52) |
| ~09:53 | orchestrator | 04B ambiguities adjudicated: XP factor + pack_hunter N pinned in GAME_DESIGN; addendum (Cursor) ∥ 04C-PRNG (Codex) dispatched |
| ~09:58 | orchestrator | 04 combined verify READY; committed 99d768b; PHASE-05 dispatched (90m timebox, stall watch) |
| ~10:13 | orchestrator | 05 ambiguity adjudicated: text caps pinned in GAME_DESIGN §12; addendum dispatched |
| ~10:19 | orchestrator | 05 verify READY (bidirectional coverage); Wave A CLOSED — committed c6a7490, PROGRESS rotated to Wave B |
| 10:21 | orchestrator | PHASE-06 dispatched |
| ~10:32 | orchestrator | 06 READY (advisory: @types/node → backlog); committed 9d5e3ac; 07A dispatched |
| ~10:40 | orchestrator | 07A core landed; 07A-path (Cursor) ∥ 07B (Codex) dispatched |
| ~10:51 | orchestrator | 07 combined verify: 1 finding (path no-mutation coverage) → round-trip; committed 0862e5c |
| 10:54 | orchestrator | PHASE-08 dispatched |
| ~10:56 | worker:codex | 08 correct STOP: no player-action extension point in turn contract (1m, no improvisation) |
| ~10:56 | orchestrator | ADJUDICATION: authorized additive action-resolver registry (external 5-method contract unchanged); 07B-amendment dispatched |
| 11:00 | orchestrator | 08 re-dispatched against amended surface |
| ~11:08 | orchestrator | 07B-a+08 verify READY (dependency direction audited); committed 34c9c5f; 09 (Codex) ∥ 10 (Cursor) dispatched |
| ~11:18 | worker:codex | 09 landed; ambiguity: §6 status magnitudes not in config |
| ~11:21 | worker:cursor | 10 landed; seams: death-path divergence, no registerTickHook |
| ~11:22 | orchestrator | ADJUDICATION: DoT deaths = no XP, same death path; registerTickHook authorized (additive); consolidation dispatched |
| ~11:30 | orchestrator | Consolidation STALL #2 (no-event, cause unknown); killed; relaunched via @brieffile (r2) |
| ~11:35 | orchestrator | r2 progressing; ENVIRONMENT.md: prefer @brieffile + early-stall watch standard |
| ~11:40 | orchestrator | GitHub repo metadata set (description + topics) at human request |
| ~14:08 | orchestrator | This log created (backfilled); convention adopted: append per action |
