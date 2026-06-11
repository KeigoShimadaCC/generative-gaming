# PHASE-52 — Floor Transition & Generation Handoff UX

## 1. Objective
The stairs moment: 1–2s of theater when the floor is ready, a shimmering hold up to the cap when it isn't, fallback served invisibly — and the floor-arrival ritual.

## 2. Context
UX §6 (every word of it — this phase implements that section); 38's prefetch controller states; UX §10 (stairs-to-playable budgets are tested numbers).

## 3. Dependencies
38, 50. Parallel with 53.

## 4. Scope IN
- `app/components/transition/`: descend trigger → transition screen (floor number, one-line whisper from narration), controller-state-driven: ready (pure theater 1–2s) / waiting (progress shimmer to cap) / fallback (identical presentation — *no visual difference*), interruptible per UX, arrival ritual (fade-in from entrance, intro line to log, quest chip update).
- Latency budget instrumentation: stairs-to-playable measured and logged client-side (feeds 56's verification).

## 5. Scope OUT
- Prefetch logic (38). Diary (54A). Loading anything else (app boots fast or 48 fix).

## 6. Owned files
`app/components/transition/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Transition states + theater + arrival ritual + instrumentation | transition/** | Codex | 25m / 50m | 53 |
| 2 | verify | Mock-latency matrix in the browser (fast/slow/timeout): identical presentation for generated vs fallback; budgets measured within UX numbers; transition interruptible | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · browser latency-matrix smoke (38's injection) · measured budget table in report.

## 9. Completion criteria
1. All controller states presentable; fallback visually indistinguishable (verifier confirms via side-by-side).
2. Measured stairs-to-playable: ≤2s typical, ≤cap worst, on the mock matrix.
3. Arrival ritual matches UX §6's beats (orientation seconds, then rhythm).
4. Acceptance bar: the demo's seam — where the AI could have been felt waiting — is provably seamless.

## 10. Risks & escalation
The temptation is a "generating..." hint. UX forbids it. Any pressure to add one → human (UX doc change), never unilateral.
