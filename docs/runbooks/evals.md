# Eval runbook

Evals score Director output on validity, solvability, difficulty-band fit, novelty,
responsiveness, latency, and cost. CI enforces a **mocked** smoke gate on every PR;
**ambient** (live Codex) runs stay on a host with ambient auth.

## PR gate (mocked, CI)

Runs automatically in `.github/workflows/ci.yml`:

```bash
pnpm run evals -- --mode mock --n 1 --eval-id ci-mock-baseline
pnpm dlx tsx tests/eval-baselines/compare.ts \
  tests/eval-baselines/mock-baseline.json \
  runs/evals/ci-mock-baseline/report.json
```

- No API keys or Codex auth required.
- Compares `runs/evals/ci-mock-baseline/report.json` against
  `tests/eval-baselines/mock-baseline.json` using tolerances in
  `tests/eval-baselines/thresholds.json`.
- Any quality-metric regression beyond tolerance fails the PR.

## Local ambient (live) eval

GitHub runners cannot run ambient evals. Use a machine with Codex CLI auth
(`codex` on `PATH`, working `~/.codex`).

**Serialization:** only one Codex process at a time on this machine — including
gameplay ambient Director calls. Do not overlap eval runs with play/simulate
sessions that hit the ambient provider.

```bash
# Full default matrix (5 personas × 3 bands), 1 generation per cell
pnpm run evals -- --mode ambient --n 1

# Smaller smoke while iterating
pnpm run evals -- --mode ambient --n 1 \
  --cells shallows:hoarder,middle:pacifist \
  --max-calls 5
```

### Where reports land

| Artifact | Path |
|---|---|
| JSON report | `runs/evals/<eval-id>/report.json` |
| Human summary | `runs/evals/<eval-id>/report.md` |
| Per-generation artifacts | `runs/evals/<eval-id>/<generation-run-id>/` |

`<eval-id>` defaults to `eval-<ISO-timestamp>` unless `--eval-id` is set.

### Cost rules

- Ambient mode invokes Codex per generation; default matrix is 15 cells × `n`
  generations (capped by `--max-calls`, default 15).
- Start with `--cells` and low `--n` when exploring; scale up deliberately.
- Token usage is recorded per generation in the report JSON.

### Manual workflow stub

`.github/workflows/evals.yml` (`workflow_dispatch`) checks for Codex on the runner
and **always exits 0** with a pointer here — it does not run live evals in CI.

## Re-baseline procedure

Baselines are deliberate commits, never auto-updated by CI.

### Mock PR baseline (`tests/eval-baselines/mock-baseline.json`)

1. Run the mocked eval with the fixed CI eval id:
   `pnpm run evals -- --mode mock --n 1 --eval-id ci-mock-baseline`
   If `runs/evals/ci-mock-baseline/` already exists, use a clean worktree or
   preserve the old artifact directory somewhere inspectable before rerunning;
   generated eval evidence is immutable and should not be deleted or edited.
2. Read `runs/evals/ci-mock-baseline/report.md` and confirm changes are expected.
3. Regenerate the baseline (preserves `_baseline` metadata):
   ```bash
   node -e "
   const fs = require('fs');
   const report = JSON.parse(fs.readFileSync('runs/evals/ci-mock-baseline/report.json','utf8'));
   const baseline = {
     _baseline: {
       recordType: 'eval-baseline-metadata',
       purpose: 'PR mock smoke threshold gate',
       rebaselinedAt: new Date().toISOString(),
       sourceEvalId: 'ci-mock-baseline',
       rebaselineProcedure: 'See docs/runbooks/evals.md — deliberate commit only.'
     },
     ...report
   };
   fs.writeFileSync('tests/eval-baselines/mock-baseline.json', JSON.stringify(baseline, null, 2) + '\\n');
   "
   ```
4. Commit with an explicit message, e.g. `Phase 43: re-baseline mock eval (reason: …)`.

### Ambient baselines (future / tuning phases)

Ambient reports are kept under `runs/evals/` for inspection. Promoting an ambient
report to a committed baseline follows the same deliberate-review pattern; see
`phase-plans/PHASE-47-RESPONSIVENESS-TUNING.md` when tuning lands.

## Threshold tuning

PR mock thresholds live in `tests/eval-baselines/thresholds.json`. Quality rates
use zero tolerance; latency uses zero for deterministic mock output. Broader
threshold calibration is scoped to Phase 58 (balance pass).
