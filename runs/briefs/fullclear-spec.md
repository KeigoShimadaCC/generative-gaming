IMPLEMENT TASK — full-game browser-clear campaign (human directive: clear the ENTIRE game through the real browser UI, repeatedly, to find bugs the 2-floor e2e can't).

OWNED: e2e/full-clear.spec.ts (new), e2e/browser-bot.ts (new driver), playwright.config.ts (a separate long-timeout project entry for this spec, EXCLUDED from the default/CI run — campaign tool, not PR gate), package.json 'e2e:fullclear' script, minimal append-only data-testid additions to app components where a needed signal is missing.

THE WORK:
1. browser-bot.ts: a turn-loop driver over the LIVE UI: each turn read game-state testids (data-depth/turn/terminal-status/screen + cell/HUD signals) and act via a simple policy: attack if enemy adjacent; pick up if item underfoot; heal via inventory if HP low; else move greedily toward stairs (toward the stairs marker if visible, else explore unseen); on floor 12 seek + take the Hoard (the WIN interaction); descend on stairs. Keys via page.keyboard. Per-run turn cap 3000 → fail with diagnosis.
2. full-clear.spec.ts: seed from env SEED (default 'fullclear-1'); journey: title → new run (mock director; AMBIENT=1 env switches provider) → bot-drive floors 1..12 → WIN asserted → diary renders → run index row. On ANY stuck/unexpected state: screenshot + dump game-state attributes + last 20 log lines to test-results/.
3. Determinism note documented (same seed → same outcome expected on mock).
DONE: pnpm run typecheck green w/ exit (paste) — you CANNOT launch the browser in-sandbox; the orchestrator runs the campaign host-side. Paste the policy summary + any testids you added. Report + actual vs 40m. NO commit. Then stop.
BRANCH ASSIGNMENT (orchestrator authority): main working tree; no commits.
