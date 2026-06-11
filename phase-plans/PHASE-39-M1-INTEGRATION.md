# PHASE-39 — M1 Integration & Milestone Smoke

## 1. Objective
Prove NORTH_STAR milestone M1: AI-generated floors pass the gauntlet and get played end-to-end, with rates measured and a floor visibly responding to a trace.

## 2. Context
NORTH_STAR §10 (M1 wording); Wave D phases; 25A/B CLIs.

## 3. Dependencies
38, 28.

## 4. Scope IN
- `tests/integration/m1.test.ts`: mocked full-loop (play floor → trace → prompt → mock manifest → gates → materialize → play generated floor); CLI flag `--director live|mock` on simulate.
- A measured live session (key provided per HIL rules): 10 live generations across bands — validity rate, solvability rate, repair rate, fallback rate, latency, cost recorded into a milestone report artifact.
- Responsiveness spot-proof: two contrasting fixture traces → two live manifests → human-readable diff showing trace-correlated differences (this is M1's "visibly responds", pre-eval-suite).

## 5. Scope OUT
- Eval suite (Wave E formalizes the rates). UI. Memory/narration (Wave F).

## 6. Owned files
`tests/integration/m1*`, `src/cli/simulate.ts` (flag addition — coordinate single-writer with no concurrent 25B work), `runs/milestones/m1/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Mocked full-loop integration + CLI flag | tests/integration/m1*, cli/simulate.ts | Codex | 20m / 40m | — |
| 2 | implement | Live measured session + milestone report | runs/milestones/m1/** | Codex (same session, key per HIL) | 15m / 30m | — |
| 3 | verify | Re-run mocked loop; audit live report numbers against raw artifacts; reproduce the responsiveness diff read | — (read-only) | Cursor | 15m / 20m | — |
| 4 | integrate | Orchestrator: merge, human reviews responsiveness diff + accepts M1, rotate | — | orchestrator | 15m / 30m | — |

## 8. Verification commands
`pnpm run check` · mocked-loop suite · `pnpm run simulate -- --director live` (keyed) · artifact audit.

## 9. Completion criteria
1. Mocked loop green in CI permanently.
2. Live session report: ≥8/10 generations served without fallback (starting bar; evals formalize later), all artifacts complete.
3. Human reads the responsiveness diff and accepts M1 (validation log).
4. Acceptance bar: NORTH_STAR M1 sentence true with evidence links.

## 10. Risks & escalation
Live numbers materially worse than 29's baseline → report, don't tune prompts ad hoc (that's Wave F's job, eval-driven).
