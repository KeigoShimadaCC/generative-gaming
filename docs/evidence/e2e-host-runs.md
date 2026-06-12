# E2E Host Runs - 2026-06-12

This records the host-side Playwright evidence for PHASE-55. The Codex macOS
sandbox cannot launch Chromium for this project: the Phase 55 worker observed
`browserType.launch ... MachPortRendezvousServer ... Permission denied (1100)`.
`ENVIRONMENT.md` also records the browser constraint: no usable Chromium in the
sandbox, so browser verification routes through the orchestrator/host.

The GitHub Actions e2e job remains wired separately from this host note. It runs
on `ubuntu-latest` and installs its own Chromium with:

```sh
pnpm exec playwright install --with-deps chromium
```

## Command

```sh
pnpm run e2e
```

## Journey

The single Playwright spec, `e2e/happy-path.spec.ts`, runs one deterministic
mocked-Director path: title screen -> new run -> play floor 1 -> pick up an item
-> inspect inventory -> descend through the transition overlay -> verify depth 2
is playable -> open quest panel -> open/close the Tab diary layer -> abandon the
run -> verify the final diary on the summary screen -> verify the run-index entry.

## Runs

| run | date       | command        | exit code | result |
| --: | ---------- | -------------- | --------: | ------ |
|   1 | 2026-06-12 | `pnpm run e2e` |         0 | pass   |
|   2 | 2026-06-12 | `pnpm run e2e` |         0 | pass   |
|   3 | 2026-06-12 | `pnpm run e2e` |         0 | pass   |
|   4 | 2026-06-12 | `pnpm run e2e` |         0 | pass   |
|   5 | 2026-06-12 | `pnpm run e2e` |         0 | pass   |

Verdict: 5/5 host-side runs passed. The local Codex sandbox run remains skipped
for browser launch permissions; CI coverage is provided by the Ubuntu e2e job.
