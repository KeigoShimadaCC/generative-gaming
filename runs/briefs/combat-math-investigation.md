# BRIEF: combat-math investigation — why bots lose 1v1 even at minimum enemy stats

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- Use `npm_config_cache=/private/tmp/gg-npm-cache` for npx/tsx invocations.
- No Chromium/Playwright in your sandbox. CLI simulate works in-sandbox.
- HEAD includes default-on gameplay hooks. The previous calibration
  experiment is archived at runs/analysis/balance-extreme-experiment.patch
  (NOT applied); the tree is at committed baseline.

## BRANCH ASSIGNMENT (orchestrator authority)
Work directly on the `main` working tree. NO git commits, NO branches.

## EVIDENCE (calibration STOP report, 2026-06-13)
- Baseline 45-run batch: 0 WIN / 6 ABORT / 39 LOSS; deaths cluster d5
  (19) and d6 (7); 30/39 deaths were SINGLE-attacker floors.
- EXTREME experiment (player HP 80, growth 10, heals 12, enemies at legal
  minima, ONE enemy per middle/lowest floor): still 0 WIN / 32 LOSS.
- itemUses across runs: 0–1. Total healing across 45 baseline runs: 78.
- A player at 80 HP losing a 1v1 against a minimum-stat enemy means the
  per-turn damage exchange is structurally lopsided, not mistuned.

## OBJECTIVE
A quantified diagnosis of the 1v1 exchange, the root cause(s) fixed where
implementation deviates from spec, and bots that actually use their kit.

## TASKS
1. **Turn-by-turn ledger**: instrument or trace ONE representative 1v1
   death (balanced policy, any failing seed). Produce a table: turn,
   player HP, enemy HP, player action, damage dealt, damage taken,
   hit/miss. Identify the exchange rate (player damage-per-turn vs enemy
   damage-per-turn).
2. **Compare implementation to GAME_DESIGN.md combat rules** (damage
   formula, attack/defense interaction, action economy — does the enemy
   act every player step including non-attack steps? double-turns?).
   Any deviation between code and GAME_DESIGN.md is a BUG — fix it.
3. **Audit the bot kit usage** in src/harness bots: do policies ever
   equip weapons/armor they pick up? Drink heals? itemUses ~0 says no.
   If policies ignore equipment/heals, fix the policies (all three) to:
   equip strictly-better gear, heal below 50%, prefer ranged/throwables
   if held. (This is the harness, not the engine.)
4. **Re-measure**: 15-seed balanced batch after each fix; paste tables.
   Target is NOT full §11 compliance (that's the next calibration pass) —
   target is a defensible exchange: bots sometimes win 1v1s, deaths shift
   deeper, some WINs appear or you can show why not yet.
5. **Report**: the ledger table, each root cause (file:line), what you
   fixed vs what remains as genuine tuning work for the follow-up
   calibration task.

## OWNED FILES
- src/harness/** (bot policies, driver), src/engine combat/turn files ONLY
  where implementation deviates from GAME_DESIGN.md (cite the section),
  regenerated goldens/eval banks if traces change.
Forbidden: GAME_DESIGN.md, Gate 2 thresholds, content/ numbers (that's
the calibration task's lever, not yours), e2e/**.

## DONE = paste outputs with exit codes
- The 1v1 ledger table.
- `pnpm run check` → exit 0; determinism audit + golden suite → exit 0.
- Before/after 15-seed balanced batch tables.

## ESTIMATE / TIMEBOX
Estimate 35 min. Timebox 70 min. STOP if the root cause is a deliberate
design property per GAME_DESIGN.md (report; that escalates to the human).
