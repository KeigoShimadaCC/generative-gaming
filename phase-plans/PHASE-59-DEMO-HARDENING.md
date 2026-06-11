# PHASE-59 — Demo Through-Line Hardening

## 1. Objective
The NORTH_STAR §6 seven-beat demo runs flawlessly, twice in a row, live.

## 2. Context
NORTH_STAR §6 (the through-line is the product's five minutes); reference lesson: pre-registered demo criteria prevent review-time discoveries; 56's accepted build.

## 3. Dependencies
57, 58.

## 4. Scope IN
- A written demo script (`docs/demo-script.md`): beat-by-beat, with the expected on-screen outcome per beat and recovery notes.
- Two full live rehearsal passes (human + orchestrator), defect list from each → round-trips to owning-phase workers (fix-forward, scope = demo-blocking only).
- Empty/edge-state sweep on demo surfaces: first-ever run, no-API-key boot, mid-run reload, malformed artifact directory — each lands somewhere presentable.
- One top-level UI error boundary (the only error-infra in MVP, per reference precedent).

## 5. Scope OUT
- New features. Non-demo-blocking polish (backlog). Recording/publishing the demo (human's).

## 6. Owned files
`docs/demo-script.md`, error-boundary file, fix-forward edits via owning workers' files.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Demo script + edge-state sweep + error boundary | demo-script.md, boundary | Codex | 20m / 40m | — |
| 2 | integrate | Rehearsal 1 (human plays the script) → defect round-trips | — | orchestrator + human | 30m / 45m | — |
| 3 | integrate | Rehearsal 2 — must be clean | — | orchestrator + human | 20m / 30m | — |

## 8. Verification commands
The demo script itself, executed live, twice; `pnpm run check` after every fix round-trip.

## 9. Completion criteria
1. Rehearsal 2 completes all seven beats with zero broken UX.
2. Every edge state lands presentably (sweep checklist).
3. Demo script committed and accurate to what the build does.
4. Acceptance bar: the human would show this to a stranger tomorrow without checking anything first.

## 10. Risks & escalation
A beat that can't be made reliable (e.g., signature moment underwhelming live) → human decides: re-scope the beat or accept variance. Never fake a beat with hardcoding.
