# Tuning 02 Summary

## Stage 0 Detector Revision

Revised `src/evals/metrics/responsiveness.ts` and tests, then froze the metric for
tuning. The metric version is now `phase-47-responsiveness-v2`.

Critiques addressed:
- Completionist detectors now require dialogue depth, quest richness, and anchored callbacks instead of NPC/quest presence.
- Pacifist and speedrunner layout detectors are disambiguated: pacifist uses enemy density plus route/far-placement shape; speedrunner uses compact floor plus structured stairs/exit tags.
- Pacifist soft threats now require low density, no near-entrance threat, and avoidance behavior together.
- Narration detectors require trace-fact-specific references anchored to authored item/enemy names or structured route tags.
- Chaos origin provenance was replaced with content-variance scoring across behavior, item, placement, callback, and trap axes.

Stage 0 checks:
- `pnpm exec vitest run src/evals/metrics/responsiveness.test.ts` -> 1 file, 6 tests passed.
- `pnpm run typecheck` -> pass.
- `pnpm exec eslint src/evals/metrics/responsiveness.ts src/evals/metrics/responsiveness.test.ts src/evals/runner/runner.test.ts` -> pass.
- `pnpm exec vitest run src/evals/metrics/responsiveness.test.ts src/evals/runner/runner.test.ts` -> 2 files, 10 tests passed.

## Baseline

Initial ambient baseline without a temporary `CODEX_HOME`:
- Command: `pnpm run evals -- --mode ambient --n 1 --eval-id tuning-02-baseline`
- Result: complete but unusable, 15/15 fallback. Known nested-Codex environment failure:
  `failed to initialize in-process app-server client: Operation not permitted`.

Usable baseline with temporary writable `CODEX_HOME`:
- Command: `pnpm run evals -- --mode ambient --n 1 --eval-id tuning-02-baseline-envfix`
- Result: 15 records; validity 100%; solvability 86.67%; fallback 13.33%.
- Responsiveness: same-persona 5.13%; cross-persona 7.05%; sample count 13.

## Iteration History

| Iteration | Change | Same-persona | Cross-persona | Validity | Solvability | Stop |
|---|---|---:|---:|---:|---:|---|
| Baseline | original prompt after detector freeze | 5.13% | 7.05% | 100% | 86.67% | no |
| 1 | trace-keyed responsiveness targets in `blocks.ts` | 54.76% | 17.86% | 93.33% | 93.33% | yes: target met, validity regressed |

Target was met in iteration 1: same-persona 54.76% and cross-persona 17.86%,
which is below half of same-persona (27.38%). Iteration 1 also regressed validity
from 100% to 93.33% due one invalid `lowest:speedrunner` NPC/quest blend, so
tuning stopped immediately per the brief.

Iteration details: `runs/evals/tuning-02/iteration-1.md`.

## Final State

Final kept state includes the iteration 1 prompt change because it is the only
state that met the responsiveness target and it improved solvability/fallback,
but the validity regression is recorded as a residual risk.

Mock re-baseline:
- Preserved previous fixed-id artifacts under `runs/evals/tuning-02/ci-mock-baseline-original/`.
- Command: `pnpm run evals -- --mode mock --n 1 --eval-id ci-mock-baseline`
- Result: complete; 15 records; validity 66.67%; solvability 66.67%; fallback 33.33%.
- Regenerated `tests/eval-baselines/mock-baseline.json`.
- `pnpm dlx tsx tests/eval-baselines/compare.ts tests/eval-baselines/mock-baseline.json runs/evals/ci-mock-baseline/report.json` -> passed, 112 metrics compared.

## Final Validation

- `pnpm run check` -> pass; typecheck and lint passed; Vitest 78 files passed,
  529 tests passed, 2 skipped.

## Residual Risks

- Completionist same-persona stayed 0% in iteration 1, while completionist-shaped content appeared as cross-persona noise in speedrunner/chaos cells. The next tuning round should tighten target classification and add exact NPC/quest schema examples before attempting more ambient calls.
- `bandAccuracy` remained 0% in both baseline and iteration reports; this appears pre-existing and out of scope for this responsiveness tuning task.
