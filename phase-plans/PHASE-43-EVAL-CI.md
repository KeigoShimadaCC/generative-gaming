# PHASE-43 — Eval CI Wiring, Thresholds, Regression Gates

## 1. Objective
Evals become law: PR-blocking mocked smoke, manual/nightly live runs, and threshold regression gates on Director-touching changes.

## 2. Context
TECH_SPEC §8 (CI posture: PR mocked, nightly live, regressions block); NORTH_STAR §5 ("a prompt improvement that drops solvability does not merge").

## 3. Dependencies
41, 42.

## 4. Scope IN
- `.github/workflows/evals.yml`: nightly + manual-dispatch live eval (secrets via repo config — human sets the secret), artifact upload of reports.
- PR job addition: mocked eval smoke + threshold check vs committed baseline report (`tests/eval-baselines/`).
- Threshold config (starting values from GAME_DESIGN §11 + M1's measured report) + a baseline-update procedure documented in the workflow file header (deliberate re-baseline, never silent).

## 5. Scope OUT
- Threshold tuning (58). New metrics. Cost dashboards.

## 6. Owned files
`.github/workflows/evals.yml`, `tests/eval-baselines/**`, PR workflow edit (coordinate: single writer on `.github/**` — no concurrent 04A work exists by now).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Workflows + threshold check + baseline + procedure docs | .github/**, eval-baselines/** | Cursor | 20m / 40m | — |
| 2 | verify | PR with an injected metric regression is blocked; clean PR passes; manual live dispatch runs (human triggers once) | — (read-only) | Cursor | 10m / 20m | — |

## 8. Verification commands
Actions run links: one blocked regression demo, one green pass, one live dispatch.

## 9. Completion criteria
1. Regression demonstrably blocks a PR (the induced-failure smoke).
2. Live dispatch produces an uploaded report artifact.
3. Re-baselining requires an explicit committed baseline change (procedure verified).
4. Acceptance bar: from now on, no Director-related merge without the eval suite's consent.

## 10. Risks & escalation
Secrets handling is human-owned — the workflow references the secret name only; if it's unset, live job must skip gracefully, not fail the pipeline.
