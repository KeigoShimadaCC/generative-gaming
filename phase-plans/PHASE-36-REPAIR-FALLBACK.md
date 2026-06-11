# PHASE-36 — Repair Loop & Fallback Degradation

## 1. Objective
Failure becomes invisible: gate-failed manifests get up to 2 repair attempts with reasons fed back, then graceful fallback to Old Stock — loudly logged, silently served.

## 2. Context
GAME_DESIGN §6-pillar "budget posture" (repair cap 2 [HARD]); NORTH_STAR §5 (fallback rule); UX §6 (no error ever visible); 33/34 reason codes; 26's pack.

## 3. Dependencies
33, 34, 35. Parallel with 37.

## 4. Scope IN
- `src/gauntlet/repair.ts`: orchestration — run gates in order (0→1→2), on fail build a repair prompt (original ask + gate report reasons + "fix only these"), re-generate via 31, cap at 2 repairs; on exhaustion select the band-appropriate fallback floor from 26; emit a full attempt-chain record (every manifest, every report, the outcome) for 37.
- Failure-mode tests via 31's mock injection: malformed → repaired; unrepairable → fallback; provider timeout → straight to fallback.

## 5. Scope OUT
- Artifact persistence (37 stores what this emits). Prefetch timing (38). Gate 3 (45/46 insert later via the same chain).

## 6. Owned files
`src/gauntlet/repair.ts` (+ tests).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Gate sequencing + repair prompting + cap + fallback + chain record + tests (all mocked) | repair.ts | Codex | 25m / 50m | 37 |
| 2 | verify | Failure-mode matrix re-run: each injected mode ends in a served floor (repaired or fallback), never an error escaping; chain record complete per attempt | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · failure-matrix tests (mock-injected).

## 9. Completion criteria
1. Every failure mode terminates in a servable floor (tests).
2. Repair cap enforced; repair prompts contain the specific gate reasons (snapshot).
3. The attempt chain is complete and ordered for any outcome (test).
4. Acceptance bar: the UX promise — degradation invisible at the table, loud in the artifact log — is mechanically true.

## 10. Risks & escalation
Repair prompts that don't include reason codes are wasted API spend — snapshot-test them. Cost per floor (1 + ≤2 repairs) is the budget; never loop beyond it.
