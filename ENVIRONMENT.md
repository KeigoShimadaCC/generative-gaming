# ENVIRONMENT.md — Living Environment Facts (STEP 0)

The single source of environment truth, pasted (or linked as mandatory reading) at
the top of **every** task brief as its STEP 0 block. Every fact a worker rediscovers
mid-task is a turn wasted; every lesson learned gets written here **the moment it is
learned** — by the orchestrator, on a worker's report (this file is locked to
workers).

Facts marked **[inherited]** come from previous-project rehearsals with the same
tools and must be re-verified by the Phase 01 environment spike; facts marked
**[verified]** have been confirmed in *this* repo, with the date.

## Codex CLI (`codex exec`) sandbox facts

- **[inherited]** All `.git` writes are blocked in-sandbox: no commit, tag, stage,
  or push. Workers record an intended commit breakdown (see AGENTS.md §Commits);
  the orchestrator executes commits.
- **[inherited]** No browser launch in-sandbox. Browser verification routes through
  Playwright MCP or an orchestrator-dispatched verifier.
- **[inherited]** `rm -rf` and chained shell commands are policy-blocked. Use Node
  `fs` removals; issue commands separately.
- **[inherited]** Shared ambient auth does not reliably tolerate concurrent
  `codex` sessions — they can contend or stall. **One Codex session at a time.**
- **[inherited]** On a no-event stall: relaunch the identical brief once; if it
  stalls again, stop and re-brief smaller.
- **[inherited]** Token usage in JSONL is `input_tokens` + `output_tokens` (no
  `total_tokens` field) — sum them for the ledger.

## Cursor Agent CLI facts

- Invocation: `agent --print --trust --model composer-2.5 --workspace <worktree>
  "<bounded prompt>"`; read-only audits use `--mode=ask` with explicit no-edit
  instructions (fall back from `--mode=plan` if it returns empty output).
- **[inherited]** macOS keychain errors on `agent status`/`agent models` → rerun
  with elevated access; record the occurrence here.
- Cursor sessions may run concurrently (separate worktrees); Cursor is the fan-out
  tool, Codex is the depth tool.

## Worktrees & repo facts

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
pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build
pnpm run check        # the all-in-one equivalent
```

(Exact scripts are created in Phase 01; update this block when they exist
**[to-verify]**.)

## Update protocol

1. Worker hits an undocumented environment fact → states it in the final report
   under "environment discoveries."
2. Orchestrator adds it here (with date + [verified]) **before dispatching the
   next brief**. Encoding the lesson immediately is the habit that fixes most
   slowdowns — tribal knowledge is a defect.
3. The Phase 01 environment spike walks every [inherited] fact and flips it to
   [verified] / removes it.
