# VERIFICATION BRIEF (READ-ONLY): full-clear campaign fix batch

You are an independent verifier. You must NOT edit, create, or delete any
file. You only run commands and report.

## What you are verifying
The uncommitted working-tree diff (`git status` / `git diff`) produced by
five worker tasks:
1. e2e browser bot v2→v3 (e2e/browser-bot.ts, e2e/full-clear.spec.ts) —
   frontier exploration, aria HP read, no-progress watchdog, transition
   wait, loop-breaker, diagnostics dumps.
2. Engine combat fix: src/engine/systems/movement.ts bump-attack now calls
   resolveAttack; run-loop/web-session gameplay hooks
   (src/engine/run/loop.ts, app/input/game-session.ts,
   app/components/runindex/replay.ts).
3. TitleScreen seed override without hydration mismatch
   (app/components/title/TitleScreen.tsx) + take-hoard key (app/input/keys.ts).
4. Arrival-transition retry completion (app/store/game-store.ts + tests +
   app/store/vitest.config.ts).
5. Descend-throw fallback + depth-aware mock transport
   (app/store/game-store.ts, app/api/director/transport-server.ts + tests).

## Checks (run all; paste outputs with exit codes)
1. `pnpm run check` → expect exit 0 (typecheck, lint, 535+ tests).
2. `pnpm exec vitest run --config app/store/vitest.config.ts` → exit 0
3. `pnpm exec vitest run --config app/api/director/vitest.config.ts` → exit 0
4. `pnpm exec vitest run --config app/input/vitest.config.ts` → exit 0
5. Review `git diff` for contract violations and report findings:
   - src/engine must contain NO LLM/provider imports, NO Date.now/Math.random
     nondeterminism added by this diff;
   - the spawn-budget legality check must NOT have been loosened anywhere;
   - golden/eval fixture changes must be regenerated outputs consistent with
     the combat fix, not hand-edited to pass (spot-check plausibility:
     do traces now contain damage/combat events where before they had none?);
   - no changes outside the files listed above plus PROGRESS.md, scripts/
     ledger.tsv, runs/ artifacts, test-results/ (report ANY stragglers).
6. Confirm `git log --oneline -1` is 4befe1be (verification is of the
   working tree on top of it).

## Verdict format
End with exactly one line: `VERDICT: GREEN` or `VERDICT: RED — <reason>`,
followed by a bulleted findings list (including non-blocking observations).
