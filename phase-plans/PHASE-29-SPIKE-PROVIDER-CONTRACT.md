# PHASE-29 — Spike: Live Provider Contract Test

## 1. Objective
Prove, with real API calls, that our schema style (Zod → JSON Schema via the AI SDK) is accepted by the target provider(s) and returns parseable structured output — before one line of pipeline code exists.

## 2. Context
The most expensive reference lesson (3 undocumented schema rejections, ~40 min lost, mocked tests blind to all of them); TECH_SPEC §6 (landmines list); PHASE-00 (live-contract-first law).

## 3. Dependencies
05. **Human provides API key** (CLAUDE.md HIL #5 — only after 28 is closed or in an isolated worktree with no phase under audit).

## 4. Scope IN
- A throwaway harness: take 3 representative schema shapes (a deep nested entity, an array-heavy roster, the §7 effect-bundle composition), convert, call `generateObject` against the candidate Director model and the candidate judge model, record accept/reject + error text + output parse result + latency + token cost per call.
- Findings: which constructs fail, the workaround per failure, measured latency/cost baseline for one floor-scale generation.

## 5. Scope OUT
- The real manifest schema (30 uses the findings). Any retained pipeline code. Prompt engineering.

## 6. Owned files
`runs/spikes/29-provider-contract/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | spike | Build probe, run matrix (3 shapes × 2 models), write findings | runs/spikes/29-provider-contract/** | Codex | 15m / 15m hard | — |
| 2 | verify | Reproduce one accept and one reject from findings verbatim | — (read-only) | Cursor | 5m / 10m | — |

## 8. Verification commands
Spike harness invocation (documented in findings); evidence = recorded request/response pairs.

## 9. Completion criteria
1. Accept/reject verdict per schema construct, with provider error text quoted.
2. Latency + cost baseline for floor-scale generation recorded (feeds UX 8s budget sanity and GAME_DESIGN cost metric).
3. ENVIRONMENT.md gains a "Provider facts" section from findings.
4. Acceptance bar: PHASE-30 can be written as assembly against known-accepted constructs.

## 10. Risks & escalation
15-minute hard timebox — if the provider rejects everything, that's a finding, not a reason to iterate; report and let the orchestrator re-plan 30.
