# PHASE-04A — CI Pipeline

## 1. Objective
Every PR runs the full gate suite (mocked only, no secrets) in GitHub Actions.

## 2. Context
TECH_SPEC §8 (CI posture); PHASE-00 invariants (no live API in PR CI).

## 3. Dependencies
03. Parallel with 04B, 04C (disjoint files).

## 4. Scope IN
- `.github/workflows/ci.yml`: pnpm cache, install, typecheck → lint → test → build-if-exists, on PR + main push.
- `@live`-tagged tests excluded from default runs (config flag in vitest setup if needed — coordinate: vitest config is 03-owned, so use env-based exclusion within workflow).
- Status badge in README stub.

## 5. Scope OUT
- No nightly/live eval job (PHASE-43). No deployment. No secrets configuration.

## 6. Owned files
`.github/**`, `README.md` (badge line only).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Workflow file + badge | .github/**, README.md | Cursor | 15m / 30m | 04B, 04C |
| 2 | verify | Trigger a PR run; confirm green and `@live` exclusion | — (read-only) | Cursor | 5m / 15m | — |

## 8. Verification commands
`gh pr checks <pr>` (or Actions log inspection) showing all gates green on a test PR.

## 9. Completion criteria
1. CI green on a real PR; fails correctly on an intentionally broken test (demonstrated once, then reverted by the worker in the same branch).
2. No secrets referenced anywhere in the workflow.
3. Behavioral smoke: the broken-test red run is the smoke.
4. Acceptance bar: orchestrator can use CI status as a merge precondition from now on.

## 10. Risks & escalation
Runner pnpm/node mismatch with local → pin versions to PHASE-03 choices.
