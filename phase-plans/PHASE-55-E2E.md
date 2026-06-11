# PHASE-55 — Playwright E2E Happy Path

## 1. Objective
Exactly one browser e2e: boot → new run → play a floor → descend through a (mocked) generated floor → die or quit → diary shows.

## 2. Context
TECH_SPEC §8 (one happy path, no more); ENVIRONMENT.md (browser via MCP/orchestrator constraints — Playwright runs on the host, not in the Codex sandbox).

## 3. Dependencies
52, 51A.

## 4. Scope IN
- `e2e/happy-path.spec.ts`: the single scripted journey above against the dev server with mock Director, deterministic seed; CI wiring (PR job, headless).
- Stability discipline: explicit waits on game-state markers, zero sleeps.

## 5. Scope OUT
- Any second e2e. Visual regression. Live-API e2e.

## 6. Owned files
`e2e/**`, Playwright config, CI workflow edit (single-writer on `.github/**`).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | The spec + config + CI wiring | e2e/**, .github edit | Cursor | 20m / 40m | — |
| 2 | verify | 5 consecutive green runs locally + 1 in CI (flake check) | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run e2e` ×5 · CI run link.

## 9. Completion criteria
1. 5/5 local green + CI green (flake-resistant by evidence).
2. The journey covers: input, grid, transition, panel, diary — one pass through every major surface.
3. Acceptance bar: a UI regression that breaks the core loop cannot merge silently.

## 10. Risks & escalation
Flake = timebox sink. Marker-based waits only; if a wait needs a sleep, the UI needs a state marker — report it as a finding for the owning phase.
