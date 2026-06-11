# PHASE-46 — LLM-Judge Gate & Signature Moment

## 1. Objective
The judgment heuristics can't reach: a cheap-model judge for coherence/tone where regexes fail, and the once-per-run signature moment with its relaxed budget.

## 2. Context
NORTH_STAR §5 (LLM-judge where heuristics can't reach); GAME_DESIGN §12 (signature: Middle band, one per run [HARD], +25% budget); WORLD §8 (the Middle's "bold, personal authored beat"); 31's judge model slot.

## 3. Dependencies
45. Parallel with Wave G.

## 4. Scope IN
- `src/gauntlet/gate3/judge.ts`: judge call (cheap model via 31) on narration + named-entity text only (not whole manifests — cost), structured verdict schema (on-tone? coherent with floor? specific-to-this-player given the summary?), config-gated (off = heuristics only; the game never *requires* the judge), verdict into the gate report.
- Signature moment: prompt-side ask (32's task block extension), budget relaxation honored by Gate 1 (33's check reads the flag — coordination: the flag legality already in 33; this phase adds the budget-relax math), one-per-run enforcement, artifact-marked for the diary.
- `@live` judge calibration test: 10 fixture texts (5 on-tone, 5 off-tone) → judge agreement ≥8/10.

## 5. Scope OUT
- Judge-assisted eval scoring (backlog). Boss systems (excluded by GAME_DESIGN §13).

## 6. Owned files
`src/gauntlet/gate3/judge.ts`, `src/director/prompt/signature.ts`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Judge call + verdict schema + config gate + mocked tests + @live calibration | gate3/judge.ts | Codex | 20m / 40m | Wave G |
| 2 | implement | Signature ask + budget-relax + one-per-run + tests | prompt/signature.ts | Codex (same session) | 15m / 30m | — |
| 3 | verify | Keyless path unaffected (judge off = identical behavior); calibration re-run; two signature floors in one run impossible (test) | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · `@live` calibration · keyless-equivalence test.

## 9. Completion criteria
1. Judge verdicts flow into gate reports; off-switch leaves a fully working heuristics-only game (tests).
2. Calibration ≥8/10 on the fixture corpus (recorded).
3. Signature: relaxed budget honored, one-per-run [HARD] enforced, artifact-flagged (tests).
4. Acceptance bar: the mid-run "bold, personal" demo beat exists with its safety rails; tone has a second net.

## 10. Risks & escalation
Judge disagreement with the human's taste on calibration corpus → human curates the corpus (taste is theirs), worker re-runs.
