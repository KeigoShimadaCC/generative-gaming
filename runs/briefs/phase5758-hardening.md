INTEGRATION TASK — PHASE-57+58 combined: golden seeds/determinism audit + balance pass (contracts: phase-plans/PHASE-57-GOLDEN-DETERMINISM.md + PHASE-58-BALANCE-PASS.md; the M0 finding is your target: bots never WIN, 100% hp retention — GAME_DESIGN §11 intent is the bar; human feel-checks deferred, data-only iterations).

GATE SCOPE: alone — full pnpm run check; bot batches are slow, budget accordingly. Do NOT commit.
OWNED FILES (57): tests/golden/**, tests/determinism-audit/**. (58): src/config/** (tuning values ONLY — zero [HARD] changes, zero non-config code), runs/milestones/balance-01/**.

THE WORK (58 FIRST — 57's goldens must bake on the final config):
1. Data: batch 3 policies × 15 seeds (full runs, fallback pack) → survival curves, WIN/ABORT split, hp retention, turn economy, item usage; diagnose: WHY no WINs (bot drive? enemy weakness? hoard interaction?) and why 100% hp (enemy ATK vs regen rates?).
2. Up to 3 config-only iterations toward §11 intent (e.g. enemy stat budget multipliers within [HARD] band tables, spawn budgets, regen interval, soft-cap pressure): after each, re-batch and compare; targets: ≥20% of balanced-bot runs WIN; Shallows hp retention into the 55–90 band; no Shallows bot deaths on floors 1–2. STOP on target, 3 iterations, or regression (keep best).
3. Report: balance-01/report.md — per-iteration tables, what moved, the honest end-state vs targets. Note: bot WIN-drive gaps that config CANNOT fix (e.g. bots not taking the hoard) get diagnosed + backlogged, not hacked.
THE WORK (57, after 58's final config):
4. Regenerate goldens via the canonical recorder (per band + per persona on fallback; mocked-director runs), replay ×2 identical; cross-run hash spot (two fresh processes).
5. Determinism audit suite: repo-wide greps (Math.random/Date.now/object-iteration in engine), golden replay in CI-able form.
DONE: pnpm run check green w/ exit; balance report + golden replay evidence pasted. Report + actual vs 90m (long batches). NO commit. Then stop.
