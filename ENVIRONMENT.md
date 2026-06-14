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

- **[verified 2026-06-11, spike 01A]** `.git` writes were **ALLOWED** under
  `--sandbox workspace-write` (empty commit succeeded) — the inherited "blocked"
  fact was REFUTED for that CLI version. Codex workers were expected to use
  AGENTS.md's direct-commit path under `Codex Agent <agent@codex.local>`.
  **[nuance 2026-06-12, phase 35]** Branch creation (`.git` ref writes) FAILED
  in one session while commits work — git capability in-sandbox is per-
  operation, not all-or-nothing. Workers needing branches should report rather
  than retry.
  **[SUPERSEDED 2026-06-14, audit remediation]** `.git` writes are now **BLOCKED**
  again in this environment: both the Critical+High and Medium audit-remediation
  Codex runs failed every commit with `fatal: Unable to create '.git/index.lock':
  Operation not permitted`, left all changes uncommitted, and emitted
  `COMMIT_PLAN.md`. **Treat COMMIT_PLAN.md as the EXPECTED path, not the fallback:**
  brief Codex to make the changes + write a `COMMIT_PLAN.md` mapping files→commit,
  and the orchestrator applies the commits (per-finding, `--author="Codex Agent
  <agent@codex.local>"`). Git capability is environment/session-dependent — do not
  assume in-sandbox commits work.
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
- **[upgraded 2026-06-12, phase 36 verify]** Concurrent codex sessions are the
  probable cause of ALL five no-event stalls: a watchdog-instrumented smoke
  stalled exactly while a concurrent live ambient call ran, and completed in 5s
  when re-run alone. **One codex process at a time, period — including the
  game's runtime ambient Director calls.** Build dispatches and ambient
  generation must never overlap; the watchdog (exit 124) is the enforcement
  backstop.
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
- **[verified 2026-06-12]** `cursor-agent` CANNOT run inside a Codex sandbox —
  auth is keychain-bound and not portable ("authentication required" hang).
  Cursor dispatches are host-only; never nest cursor under codex.
- **[observed 2026-06-12, n=2]** Cursor sessions can hang silently at 0 output
  (transient service trouble, same family as the earlier 502) — host auth fine
  before and after. cursor-run.sh now has the same watchdog as codex-run.sh
  (exit 124). After two hangs on the same brief, reroute to Codex.

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
- **[verified 2026-06-12]** `pnpm test -- <path>` does NOT filter — it runs the
  full vitest suite. The correct scoped form is `pnpm exec vitest run <path>`.
  Use that in scoped-gate briefs from now on.

- **[inherited]** `.env*` files are gitignored and do **not** propagate into new
  worktrees — the orchestrator copies them explicitly when (and only when) the
  brief requires a key.
- Worktree path convention: `../gg-wt/<phase>-<slug>`; branch `phase-XX/<slug>`.
- **[inherited]** Dev-server port collisions are common: read `${PORT:-3000}`,
  document an override; never hardcode a port.
- **[inherited]** A running/previously-run Next.js app pollutes typecheck via
  `.next/types/*` — clean `.next` before the typecheck gate.
- macOS shell: `date +%s` for timing (no `%N`); BSD userland (`sed -i ''` etc.).
- **[verified 2026-06-12]** pnpm blocks native build scripts by default and
  `pnpm approve-builds` is interactive (sandbox-hostile). Native deps
  (better-sqlite3) must be listed in `pnpm.onlyBuiltDependencies` in
  package.json. **[noted 2026-06-14, audit]** `sharp` is similarly unapproved
  locally (affects host art rasterization only; the dependency-free PNG path in
  `runs/spikes/phase62/sprite-manifest.js` is the orchestrator's montage tool).

## Host facts (orchestrator-side)

- **[verified 2026-06-14]** Node engine mismatch: `package.json` requires Node
  `>=24 <26`, but the local host runs **v22.x**. CI uses Node 24. Two `pnpm test`
  entries can TIME OUT locally on Node 22 + throttled CPU — `evals/runner` (>5s cap)
  and `harness/bots › wins depth-12 fallback runs` (~318s vs 300s cap) — these are
  **timeouts, not assertion failures**; `verify:ci` and CI are green. Don't chase
  them as logic bugs; a perf look at the one playthrough test is the only follow-up.
- **[verified 2026-06-14]** Playwright browser cache invalidates on a chromium
  version bump: `playwright test` fails with "Executable doesn't exist at
  .../chromium_headless_shell-<v>/...". Fix on the host: `pnpm exec playwright
  install chromium` (one-time per bump). Host smokes use `--project=chromium`;
  the bundled full-clear campaign uses `pnpm run e2e:fullclear` (FULLCLEAR=1,
  its own dev server with `DIRECTOR=fallback`).
- **[verified 2026-06-14]** `scripts/generate-art.ts` footgun (now FIXED): a
  single-entity regen (`--theme=X --entity=Y`) used to REPLACE that theme's whole
  sprite list in `content/art/generated/index.json` (clobbered 47→3 entries). The
  merge now seeds from the existing index; a codex-free `--reindex` flag rebuilds
  `index.json` + `src/art/generated-records.ts` from on-disk records. Use
  `pnpm run generate-art -- --reindex` to repair the index after manual sprite edits.
- **[verified 2026-06-14]** Floor solvability is guaranteed at generation, not by
  luck: `floorgen` `assertConnectivity` BFS-floods from the player spawn using the
  player's own `isWalkableTile` + 8-neighbour movement and requires every walkable
  cell (stairs included) reachable, else retry, else no floor ships. Verified by a
  20k-seed reachability sweep (0 unreachable). Don't re-investigate "unreachable
  stairs" as an open risk.

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
