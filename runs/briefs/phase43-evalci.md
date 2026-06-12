IMPLEMENT TASK — PHASE-43: eval CI wiring (contract: phase-plans/PHASE-43-EVAL-CI.md, AMENDED for the ambient path: no API secrets exist — PR job = mocked eval smoke + threshold check; ambient evals stay LOCAL via a documented runbook; the workflow's ambient job is a manual-dispatch stub that exits 0 with a clear notice when codex auth is absent).

GATE SCOPE: alone — full pnpm run check at end. Do NOT commit.
OWNED FILES: .github/workflows/evals.yml (new), .github/workflows/ci.yml (append mocked-eval step only), tests/eval-baselines/** (new), docs/runbooks/evals.md (new).

THE WORK:
1. ci.yml append: after tests — pnpm run evals -- --mode mock --n 1, then a threshold-check step comparing the produced report.json to tests/eval-baselines/mock-baseline.json via the runner's compare (regression beyond tolerances → exit nonzero).
2. Generate the initial mock baseline locally (run the mocked eval; commit-stage the report as baseline) + header-comment the deliberate re-baseline procedure.
3. evals.yml: workflow_dispatch job — checks codex availability, exits 0 with 'requires local ambient auth — see docs/runbooks/evals.md' when absent.
4. docs/runbooks/evals.md: local ambient eval how-to (sequential-only rule, cost cap, where reports land, re-baseline procedure).
VERIFY: mocked eval + comparator locally green (paste); yaml self-reviewed (pinned action versions).
Report + actual vs 25m. NO commit. Then stop.
