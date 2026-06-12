# BRIEF: full-clear bot — wait out floor transitions instead of key-spamming

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- No Chromium/Playwright in your sandbox; orchestrator runs the campaign.
- Working tree has uncommitted bot + engine combat fixes. Keep; build on top.

## BRANCH ASSIGNMENT (orchestrator authority)
Work directly on the `main` working tree. NO git commits, NO branches.

## EVIDENCE (campaign run 4, seed fullclear-1 — diagnostics in
test-results/fullclear-diagnostics/*no-turn-progress*)
- Bot reached depth 4 (combat fix verified working in-browser).
- At d4 t162 the bot stood on stairs and pressed `>` 8+ times while shell
  reported `transitionPhase: "descending"`, `inputLocked: false`,
  `screen: "playing"`, turn frozen at 162. The no-turn-progress breaker
  (24 identical states) aborted the run.
- Diagnosis: during a floor transition the game does not consume turns;
  the bot treats that as "stuck". It must instead idle while
  `transitionPhase !== "none"`.

## OBJECTIVE
The bot recognizes floor transitions: after a descend, it waits (no key
presses) until `data-transition-phase` returns to "none" or depth changes,
with a hard timeout, and the no-progress watchdogs do not count
transition-state polls.

## TASKS
1. In e2e/browser-bot.ts: when shell `transitionPhase !== "none"`, poll
   (e.g. every 250ms) WITHOUT pressing keys until it is "none" or depth
   changed. Hard timeout 90s (ambient floor generation can be slow) — on
   timeout, dump diagnostics with reason "floor transition wedged" and
   abort. Reset the no-progress/identical-state counters when a transition
   completes or depth changes.
2. After a successful descend, also stop re-pressing `>` — one descend
   intent per stairs visit until depth changes or transition ends.
3. Read the transition flow in app/ (GameShell / transitionPhase producer)
   only as needed to confirm the contract: which attribute values occur
   (e.g. "descending", others?) and whether input is ignored during them.
   List the possible phase values in your report.

## OWNED FILES
- e2e/browser-bot.ts (and e2e/full-clear.spec.ts only if a constant moves)
Everything else read-only.

## DONE = paste actual command output with explicit exit codes
- `pnpm run typecheck` → exit 0
- `pnpm run lint` → exit 0
- Report: phase-value contract found in app/, what you changed.

## ESTIMATE / TIMEBOX
Estimate 10 min. Timebox 20 min.
