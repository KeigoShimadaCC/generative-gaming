# PHASE-38 — Background Prefetch & Server Route

## 1. Objective
The latency-hiding machinery: floor N+1 generation kicks off on arrival at floor N, runs the full pipeline in the background, and is ready (or fallen-back) by descent — plus the thin server transport.

## 2. Context
UX §6 (the whole section: no spinner, 8s hard cap, fallback invisibility); TECH_SPEC §4 (server = two concerns, fire-and-forget + polling); 29's latency baseline; 36's pipeline.

## 3. Dependencies
31–37. Serial (this is the Wave D integration point).

## 4. Scope IN
- `src/director/orchestration/`: prefetch controller — trigger on floor arrival, run 32→31→36 pipeline, hold result; descent request → ready floor | wait-up-to-cap | fallback; cancellation on run end; single-flight per floor.
- Server transport: API route handlers (start-generation, poll-status, get-floor) calling the same controller — no logic in routes (Next.js app lands in 48; until then, handlers are framework-agnostic functions with a tiny node http harness for testing).
- Timing tests with mock provider latency injection: fast (ready before descent), slow (cap → fallback), mid (wait window).

## 5. Scope OUT
- UI transition (52). Next.js scaffold (48). Memory in prompts (44).

## 6. Owned files
`src/director/orchestration/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Prefetch controller + single-flight + cancellation + tests | orchestration/prefetch.ts | Codex | 25m / 50m | — |
| 2 | implement | Transport handlers + http test harness | orchestration/transport.ts | Cursor | 10m / 20m | task 1 |
| 3 | verify | Latency-matrix re-run (fast/mid/slow/timeout/error) — descent always yields a floor within cap; no double-generation; cancellation leaks nothing | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · latency-matrix tests (injected delays) · single-flight assertion.

## 9. Completion criteria
1. Descent always yields a playable floor within the configured cap, in every latency scenario (tests).
2. Exactly one generation in flight per floor (test).
3. Artifacts written for every attempt regardless of outcome (cross-check with 37).
4. Acceptance bar: UX §6's "the transition is pure theater in the common case" is mechanically true with the measured 29 baseline.

## 10. Risks & escalation
If 29's latency baseline + Gate 2 simulation cannot fit the cap, this is a design-level conflict — stop and report with numbers (orchestrator/human adjust cap or gate budget in docs first).
