# PHASE-01B — Spike: Cursor CLI Environment Verification

## 1. Objective
Verify the Cursor Agent (composer-2.5) invocation patterns end-to-end so fan-out briefs are dispatchable on verified facts.

## 2. Context
ENVIRONMENT.md §Cursor; CLAUDE.md §Workers (invocation shape); references: keychain errors, `--mode=plan` empty-output fallback.

## 3. Dependencies
None. Requires `agent` CLI installed/authed.

## 4. Scope IN
- Probe: `agent --list-models` (composer-2.5 present), one `--print --trust` edit task in a scratch folder, one `--mode=ask` read-only audit task, concurrent two-session test, `.git` write capability test from a Cursor session.
- Written findings report.

## 5. Scope OUT
- No harness scripts, no repo files, no fixes. Throwaway scratch work only.

## 6. Owned files
`runs/spikes/01B-cursor-env/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | spike | Run all probes; record verdicts with command + output | runs/spikes/01B-cursor-env/findings.md | Cursor | 10m / 15m | 01A |
| 2 | verify | Independent read of findings vs ENVIRONMENT.md claims | — (read-only) | Codex | 5m / 10m | — |

## 8. Verification commands
None (pre-scaffold). Evidence = findings.md + raw outputs.

## 9. Completion criteria
1. Every Cursor-section fact in ENVIRONMENT.md has a verdict with evidence.
2. Confirmed: can Cursor sessions run concurrently; can Cursor write `.git` (decides AGENTS.md commit path).
3. Read-only audit mode proven (no files modified during ask-mode probe — verified by diff).
4. Acceptance bar: orchestrator can dispatch parallel Cursor briefs without an unverified assumption.

## 10. Risks & escalation
Keychain/auth failure → human. If Cursor cannot write `.git`, AGENTS.md §Commits needs a human-approved amendment — report, don't improvise.
