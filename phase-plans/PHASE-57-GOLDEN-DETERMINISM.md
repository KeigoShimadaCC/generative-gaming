# PHASE-57 — Golden Seeds & Determinism Audit

## 1. Objective
Lock the final behavior: refreshed golden traces across all systems, and a repo-wide determinism audit before release.

## 2. Context
TECH_SPEC §9 (golden seeds, breaking-change rule); 23B's harness; PHASE-00 determinism guard.

## 3. Dependencies
56. Parallel with 58.

## 4. Scope IN
- Golden refresh: full-run traces per band + per persona on fallback content; mocked-Director runs; committed as the release regression anchor.
- Audit: repo-wide grep + targeted tests for nondeterminism (Math.random/Date.now/unordered iteration over objects in engine paths/floating-point drift), replay of every golden ×2, cross-machine spot (CI runner vs local hashes).

## 5. Scope OUT
- Fixing balance (58). New goldens after this = deliberate re-baseline only.

## 6. Owned files
`tests/golden/**`, `tests/determinism-audit/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Golden regeneration + commit + replay×2 | tests/golden/** | Cursor | 15m / 30m | 58 |
| 2 | implement | Audit greps/tests + cross-machine hash check | tests/determinism-audit/** | Codex | 15m / 30m | — |
| 3 | verify | Independent full replay of all goldens; audit findings reproduced | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · golden replay suite · audit suite · CI-vs-local hash comparison.

## 9. Completion criteria
1. All goldens replay byte-identical, twice, locally and in CI.
2. Audit suite green; any finding fixed via round-trip to the owning system's worker.
3. Acceptance bar: from here, "did anything change behavior?" is a one-command question forever.

## 10. Risks & escalation
Cross-machine hash divergence = serious (float/platform issue) — stop, report with the diverging turn, human decides priority.
