# PHASE-61 — M3 Final Acceptance

## 1. Objective
Close milestone M3: real-player sessions confirm the dungeon "knew them," the suite is green in CI, and the human accepts the MVP as done.

## 2. Context
NORTH_STAR §10-M3 (the wording: majority of players spontaneously mention a moment the dungeon knew them, want a second run; eval suite green in CI).

## 3. Dependencies
59, 60.

## 4. Scope IN
- Player sessions: 3+ honest sessions with real players (human recruits; orchestrator prepares a one-page observation sheet — what they said unprompted, did they start run 2), collected into `runs/milestones/m3/`.
- Final sweep: full CI green (gates + e2e + eval baseline), golden replays green, ledger closed out (final velocity stats), PROGRESS.md final rotation, backlog groomed into a post-MVP list for the human.
- The M3 report: milestone verdict against NORTH_STAR §10's exact sentences, with evidence links for each.

## 5. Scope OUT
- Acting on session feedback (post-MVP backlog). Any code change beyond a demo-blocking emergency (human-approved round-trip only).

## 6. Owned files
`runs/milestones/m3/**`, `PROGRESS.md` (rotation), backlog grooming.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Observation sheet + session collation + M3 report draft | m3/** | Cursor | 15m / 30m | — |
| 2 | verify | Evidence audit: every M3 claim links to an artifact/CI run/session note | — (read-only) | Cursor | 10m / 15m | — |
| 3 | integrate | Orchestrator: final CI/golden sweep, ledger close, rotation, present report → human verdict | — | orchestrator + human | 30m / 45m | — |

## 8. Verification commands
Full CI run link · golden suite · eval baseline · the M3 report itself.

## 9. Completion criteria
1. NORTH_STAR M3's sentences each marked true/false with evidence — honestly (a false with evidence beats a hollow true).
2. Human issues the final acceptance (validation log, dated).
3. Post-MVP backlog delivered as a groomed list.
4. Acceptance bar: the north star question — freedom worth having, harness that held — has its answer in writing.

## 10. Risks & escalation
If players don't feel "it knew me," M3 fails honestly: the report quantifies the gap, the human decides the next arc. That outcome is a valid project result — NORTH_STAR's final sentence cuts both ways.
