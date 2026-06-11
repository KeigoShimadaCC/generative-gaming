# PHASE-02 — Orchestration Harness Scripts

## 1. Objective
A single chokepoint for launching, logging, and timing every worker session, so all runs are uniform and measurable.

## 2. Context
References lesson #1 (one chokepoint); ENVIRONMENT.md (sandbox flags, token fields, macOS `date +%s`); CLAUDE.md §Time Discipline (velocity ledger needs actuals).

## 3. Dependencies
01A, 01B (verified facts feed the flags and the token extractor).

## 4. Scope IN
- `scripts/codex-run.sh <label> "<prompt>"`: uniform sandbox flags per 01A findings, JSONL tee to per-session log, wall-clock seconds, ledger row append (`scripts/ledger.tsv`: label, agent, model, effort, start, seconds, input+output tokens).
- `scripts/cursor-run.sh <label> <workspace> "<prompt>"`: same logging contract.
- `scripts/agent-report.sh`: roll up ledger by phase prefix.

## 5. Scope OUT
- No repo scaffold (PHASE-03). No CI. No retry/queue logic — stall handling stays manual per CLAUDE.md. No token cost dashboards.

## 6. Owned files
`scripts/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | codex-run.sh + ledger append, per 01A flag findings | scripts/codex-run.sh, scripts/ledger.tsv | Codex | 15m / 30m | — |
| 2 | implement | cursor-run.sh same contract | scripts/cursor-run.sh | Cursor | 10m / 20m | after 1 (shares ledger format) |
| 3 | implement | agent-report.sh rollup by phase prefix | scripts/agent-report.sh | Cursor | 10m / 20m | — |
| 4 | verify | Run one real session through each script; confirm log, timing, token sum, report row | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`scripts/codex-run.sh test-smoke "echo-only probe"` · `scripts/cursor-run.sh test-smoke . "read README"` · `scripts/agent-report.sh` — each producing a log file, a ledger row, and a rollup line.

## 9. Completion criteria
1. Both run-scripts execute a real session and append complete ledger rows (no `NA` token fields).
2. Report script totals per phase prefix correctly.
3. Behavioral smoke: §8 commands run by the verifier, outputs in the report.
4. Acceptance bar: orchestrator never again launches an ad-hoc worker invocation.

## 10. Risks & escalation
Token field shape differs from 01A findings → fix extractor within scope. Scripts must be macOS-safe (`date +%s`, BSD userland). Two failed verify round-trips → human.
