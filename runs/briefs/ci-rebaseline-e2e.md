# BRIEF: CI green — re-baseline mocked evals + stop the e2e job hanging

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- Use `npm_config_cache=/private/tmp/gg-npm-cache` for npx/tsx invocations.
- HEAD 2f10a4e4: default-on hooks + balance calibration v2 merged. Tree clean.
- You CANNOT run browsers in your sandbox; for the e2e job you fix config,
  not run Playwright. The orchestrator validates on CI.

## BRANCH ASSIGNMENT (orchestrator authority)
Work directly on the `main` working tree. NO git commits, NO branches.

## PART A — mocked eval re-baseline
CI round 10 failed: the committed tests/eval-baselines/mock-baseline.json
predates honest combat (Gate 2 now rejects middle/lowest mock content;
overall solvability 66.7%→33.3% etc.). Re-baseline per
docs/runbooks/evals.md AGAINST CURRENT HEAD reality:
1. Run the mock eval per the runbook and regenerate
   tests/eval-baselines/mock-baseline.json honestly — do NOT pad numbers.
2. Locally replicate the CI smoke logic from .github/workflows/ci.yml
   (unique EVAL_ID, pinned seeds) and show the threshold compare passes:
   paste both commands with exit 0.
3. If post-calibration mock content now legitimately passes more gates,
   that improvement is the new baseline — record actual values.

## PART B — e2e CI job
The e2e job hung >1h in rounds 6 and 8 (cancelled both times); the check
job was unaffected. Diagnose from config alone:
1. Read the e2e job in .github/workflows/ci.yml + playwright.config.ts
   (webServer command, ports, reuseExistingServer, browser install step).
   Identify what can block forever on a runner (e.g. `next dev` without
   build cache, port collision, missing PLAYWRIGHT_BROWSERS_PATH cache,
   webServer timeout default).
2. Fix the config: explicit webServer timeout, `timeout-minutes: 15` on
   the e2e job (and `timeout-minutes: 30` on check as a backstop),
   browser-install step with cache, and anything else you diagnosed.
3. You cannot reproduce CI locally — keep changes minimal and reversible;
   the orchestrator validates by pushing.

## OWNED FILES
- tests/eval-baselines/mock-baseline.json
- .github/workflows/ci.yml, playwright.config.ts
- docs/runbooks/evals.md ONLY if the runbook steps changed.
Forbidden: everything else (no engine/content/bot changes).

## DONE = paste outputs with exit codes
- Part A: eval run + threshold compare → exit 0 each, with the new
  baseline's headline numbers (validity/solvability/fallback).
- Part B: the diagnosis (what could hang, file:line) and the diff summary.
- `git diff --check` → exit 0.

## ESTIMATE / TIMEBOX
Estimate 20 min. Timebox 40 min.
