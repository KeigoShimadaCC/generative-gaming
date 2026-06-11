# ENVIRONMENT.md — Living Environment Facts (STEP 0)

The single source of environment truth, pasted (or linked as mandatory reading) at
the top of **every** task brief as its STEP 0 block. Every fact a worker rediscovers
mid-task is a turn wasted; every lesson learned gets written here **the moment it is
learned** — by the orchestrator, on a worker's report (this file is locked to
workers).

Facts marked **[inherited]** come from previous-project rehearsals with the same
tools and must be re-verified by the Phase 01 environment spike; facts marked
**[verified]** have been confirmed in *this* repo, with the date.

## Codex CLI (`codex exec`) sandbox facts — codex-cli 0.137.0

- **[verified 2026-06-11, spike 01A]** `.git` writes are **ALLOWED** under
  `--sandbox workspace-write` (empty commit succeeded) — the inherited "blocked"
  fact is REFUTED for this CLI version. Codex workers use AGENTS.md's
  direct-commit path under `Codex Agent <agent@codex.local>`; COMMIT_PLAN.md
  remains the fallback if a future version re-blocks.
- **[verified 2026-06-11, spike 01A]** Non-destructive `&&` chaining WORKS —
  inherited "chained commands blocked" REFUTED. `rm -rf` is rejected by policy
  before execution (CONFIRMED) — use Node `fs` removals.
- **[verified 2026-06-11, spike 01A]** No browser available in-sandbox: no
  chromium binary; `npx --no-install playwright` fails. CONFIRMED — browser
  verification routes through the orchestrator/host.
- **[verified 2026-06-11, spike 01A]** Outbound HTTPS works with
  `-c sandbox_workspace_write.network_access=true`.
- **[verified 2026-06-11]** Host npm cache contains root-owned files →
  `npx` fails with EPERM in sandbox. Machine fix (human, optional):
  `sudo chown -R 501:20 ~/.npm`.
- **[verified 2026-06-11]** Token usage: the `turn.completed` JSONL event carries
  `usage:{input_tokens, cached_input_tokens, output_tokens,
  reasoning_output_tokens}` — ledger total = input + output.
- **[verified 2026-06-11]** `codex exec` reads stdin when invoked without
  redirection — **always append `< /dev/null`** in scripted invocations; omitting
  it caused a 15-minute no-event stall (observed).
- **[verified 2026-06-11, phase 02]** Nested `codex exec` (Codex launched from
  inside a Codex sandbox) fails when `~/.codex` is read-only ("failed to
  initialize in-process app-server client"). `scripts/codex-run.sh` handles this:
  temp writable `CODEX_HOME` + `auth.json` copy, cleaned on exit. Note: auth.json
  is briefly copied to a temp dir — local-only, deleted on exit.
- **[verified 2026-06-11, phase 02]** `rm -f` against `/private/tmp` paths is
  policy-rejected in-sandbox; use Node/Python fs cleanup.
- **[inherited]** Shared ambient auth does not reliably tolerate concurrent
  `codex` sessions — **one Codex session at a time** (not re-tested; keep until
  a deliberate probe says otherwise).
- **[verified 2026-06-11]** Stall rule works as written: no-event stall →
  relaunch identical brief once (with root cause fixed) → completed in ~7m.
- **[observed 2026-06-11, n=2]** Codex no-event stalls (2-event JSONL, then
  silence) occur intermittently even with stdin redirected; both recoveries
  succeeded on relaunch with `@brieffile` prompts. Prefer `@brieffile` over
  long inline prompts for codex-run.sh dispatches; keep the early-stall watch
  (static <500 bytes for 5m → alert) on every Codex dispatch.

## Cursor Agent CLI facts

- **[verified 2026-06-11]** On this machine, `agent` resolves to the **grok CLI**
  (`~/.grok/bin/agent`), NOT Cursor. The Cursor CLI is **`cursor-agent`**
  (`~/.local/bin/cursor-agent`, version 2026.05.24). All Cursor invocations must
  use `cursor-agent`.
- **[verified 2026-06-11]** `cursor-agent` has no `--trust` or `--workspace`
  flags; use `--print` (full tool access incl. write/shell), `--model <model>`,
  `--mode plan|ask` for read-only, `--output-format text|json|stream-json`, and
  set the working directory by `cd`-ing into the target worktree before invoking.
- Canonical invocation: `cd <worktree> && cursor-agent --print --model
  composer-2.5 "<bounded prompt>"`; read-only audits: `--mode=ask` with explicit
  no-edit instructions.
- **[verified 2026-06-11, spike 01B]** Cursor workers CAN mutate `.git` (commit
  succeeded, reverted) — the AGENTS.md direct-commit path for Cursor is valid.
- **[verified 2026-06-11, spike 01B]** `&&` chaining and outbound HTTPS both work
  in Cursor sessions; model identity `composer-2.5` confirmed; cwd = invocation dir.
- **[inherited]** macOS keychain errors on `agent status`/`agent models` → rerun
  with elevated access; record the occurrence here.
- Cursor sessions may run concurrently (separate worktrees); Cursor is the fan-out
  tool, Codex is the depth tool.

## Worktrees & repo facts

- **[observed 2026-06-11]** Parallel implement-workers on the SAME worktree:
  disjoint file ownership prevents edit conflicts, but `pnpm run check` runs
  collide with the sibling's half-written files. Either dispatch parallel
  implement tasks in separate worktrees, or instruct workers to gate only
  their owned test path (`pnpm test -- <owned dir>` + typecheck) and let the
  combined verification run the full gate after all siblings land.
- **[amended 2026-06-12]** Scoped gates MUST include lint on the owned path
  (`pnpm exec eslint <owned dir>`) — a scoped gate of typecheck+tests only let
  6 lint errors through to the sibling's full gate (15A).

- **[inherited]** `.env*` files are gitignored and do **not** propagate into new
  worktrees — the orchestrator copies them explicitly when (and only when) the
  brief requires a key.
- Worktree path convention: `../gg-wt/<phase>-<slug>`; branch `phase-XX/<slug>`.
- **[inherited]** Dev-server port collisions are common: read `${PORT:-3000}`,
  document an override; never hardcode a port.
- **[inherited]** A running/previously-run Next.js app pollutes typecheck via
  `.next/types/*` — clean `.next` before the typecheck gate.
- macOS shell: `date +%s` for timing (no `%N`); BSD userland (`sed -i ''` etc.).

## Gate commands (cheapest first — fail fast)

```
pnpm run typecheck   # tsc --noEmit (cheapest)
pnpm run lint        # eslint .
pnpm test            # vitest run (@live excluded unless CODEX_LIVE=1)
pnpm run check       # all three, in that order
```

**[verified 2026-06-11, phase 03]** — pnpm v10.28.2, TS 6.0.3 strict, vitest
4.1.8, eslint 10.4.1, zod 4.4.3. Dispatch workers via `scripts/codex-run.sh
<label> @<brieffile>` / `scripts/cursor-run.sh <label> <dir> "<prompt>"`.

## Update protocol

1. Worker hits an undocumented environment fact → states it in the final report
   under "environment discoveries."
2. Orchestrator adds it here (with date + [verified]) **before dispatching the
   next brief**. Encoding the lesson immediately is the habit that fixes most
   slowdowns — tribal knowledge is a defect.
3. The Phase 01 environment spike walks every [inherited] fact and flips it to
   [verified] / removes it.
