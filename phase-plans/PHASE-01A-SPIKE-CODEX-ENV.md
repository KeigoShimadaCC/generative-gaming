# PHASE-01A — Spike: Codex CLI Environment Verification

## 1. Objective
Verify every `[inherited]` Codex fact in ENVIRONMENT.md against this machine/repo so all later briefs stand on verified facts.

## 2. Context
ENVIRONMENT.md (all Codex sections); CLAUDE.md §Time Discipline (spike rules); references lesson: every rediscovered fact mid-run costs a turn.

## 3. Dependencies
None. First phase. Requires `codex` CLI logged in.

## 4. Scope IN
- One `codex exec` session probing: `.git` write block, `rm -rf`/chained command block, browser launch block, sandbox network access, JSONL event/usage field shapes.
- A second concurrent session attempt to confirm (or refute) ambient-auth contention.
- Written findings report.

## 5. Scope OUT
- No harness scripts (PHASE-02). No repo scaffolding. No fixes for anything found. Spike code is throwaway.

## 6. Owned files
`runs/spikes/01A-codex-env/**` (findings report + raw logs only).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | spike | Run probe session; record each fact pass/fail with command + output | runs/spikes/01A-codex-env/findings.md | Codex | 10m / 15m | 01B |
| 2 | verify | Orchestrator-dispatched read of findings vs ENVIRONMENT.md claims | — (read-only) | Cursor | 5m / 10m | — |

## 8. Verification commands
None (pre-scaffold). Evidence = findings.md citing raw probe outputs in the same folder.

## 9. Completion criteria
1. Every Codex-section `[inherited]` fact in ENVIRONMENT.md has a verdict: confirmed / refuted / changed, with evidence.
2. JSONL usage-field shape documented (exact field names observed).
3. Concurrency verdict recorded (contention observed or not).
4. Behavioral smoke: the probe session itself completed headlessly end-to-end.
5. Acceptance bar: orchestrator can flip every Codex `[inherited]` tag to `[verified]` or amend it, citing this spike.

## 10. Risks & escalation
CLI not logged in / keychain errors → stop, report to human (auth is human-owned). Findings contradicting ENVIRONMENT.md are the point, not a failure.
