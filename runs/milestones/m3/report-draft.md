# M3 Report Draft

Status: MECHANICAL EVIDENCE ASSEMBLED; PLAYER SESSIONS PENDING (3+);
HUMAN VERDICT PENDING.

## North Star Text Under Test

> **M3 - It's actually fun.** Honest sessions with real players: the majority
> spontaneously mention a moment the dungeon "knew them," and want a second run.
> Eval suite green in CI.

> **If the player can't feel the dungeon responding to them, the AI freedom is
> wasted; if the player ever sees a broken floor, the harness has failed. Ship
> neither.**

## Clause Verdicts

| NORTH_STAR clause | Current verdict | Evidence slot |
|---|---|---|
| Honest sessions with real players | PLAYER SESSIONS PENDING (3+) | Fill from `runs/milestones/m3/observation-sheet.md` after 3+ sessions. |
| Majority spontaneously mention a moment the dungeon "knew them" | PLAYER SESSIONS PENDING (3+) | Need >=2 of 3 "yes" rows, with exact quotes. |
| Majority want a second run | PLAYER SESSIONS PENDING (3+) | Need >=2 of 3 started/requested run 2 without being pushed. |
| Eval suite green in CI | CI GREEN LINK PENDING; LATEST HEAD CI IS RED | Current HEAD: `a6aabb20`; latest checked run: `https://github.com/KeigoShimadaCC/generative-gaming/actions/runs/27422222478` completed `failure` at 2026-06-12T14:34:28Z. Paste the later green CI link here before final acceptance. |
| No broken floor reaches player | LOCAL MECHANICAL EVIDENCE GREEN; HUMAN CONFIRMATION PENDING | `pnpm run check`, golden replay suite, determinism audit, mocked eval baseline all passed locally; player sessions must record any broken/stuck floor. |

## Mechanical Evidence

| Evidence item | Status | Link / command |
|---|---|---|
| M0 playable skeleton report | PRESENT | `runs/milestones/m0/report.md` |
| M1 Director lives report | PRESENT | `runs/milestones/m1/report.md` |
| M2 reads-you report | PRESENT | `runs/milestones/m2/report.md` |
| Full local gate | GREEN | `pnpm run check` -> typecheck pass, lint pass, Vitest 79 files / 532 passed / 2 skipped. |
| Golden replay suite | GREEN | `pnpm exec vitest run --config tests/golden/vitest.config.ts --reporter verbose` -> 1 file / 9 passed. |
| Determinism audit | GREEN | `pnpm exec vitest run --config tests/determinism-audit/vitest.config.ts --reporter verbose` -> 1 file / 3 passed. |
| Mocked eval baseline | GREEN | `pnpm run evals -- --mode mock --n 1 --eval-id m3-closeout-mock` plus `pnpm dlx tsx tests/eval-baselines/compare.ts tests/eval-baselines/mock-baseline.json runs/evals/m3-closeout-mock/report.json` -> Eval complete, 15 records, validity 66.67%, solvability 66.67%, fallback 33.33%, threshold check passed (112 metrics, 0 regressions beyond tolerance). |
| Eval baseline file | PRESENT | `tests/eval-baselines/mock-baseline.json` |
| M3 human checklist | PRESENT | `runs/milestones/HUMAN-CHECKLIST.md` |

## Human Evidence To Fill

| Session | Knew-them quote? | Started / wanted run 2? | Broken-floor report? | Notes path |
|---|---|---|---|---|
| 1 | pending | pending | pending | pending |
| 2 | pending | pending | pending | pending |
| 3 | pending | pending | pending | pending |

## Final Human Verdict

HUMAN VERDICT PENDING.

Record the final answer here after the checklist and player sessions:

- Accepted / rejected:
- Date:
- Human:
- Reason:
- Follow-up backlog promoted:
