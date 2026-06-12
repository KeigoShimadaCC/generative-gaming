# BRIEF: balance calibration v2 — ledger-grounded, player offense is now a lever

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- Use `npm_config_cache=/private/tmp/gg-npm-cache` for npx/tsx invocations.
- Tree has UNCOMMITTED, verified-stable bot kit-usage + oscillation-guard
  changes in src/harness/bots/** and a runtime-status schema split — do NOT
  touch src/harness/bots/**, src/schemas/vocab/statuses.ts, or e2e/**.
- Prior art: runs/briefs/balance-calibration.md (v1, STOPped),
  runs/analysis/balance-extreme-experiment.patch (archived, not applied).

## BRANCH ASSIGNMENT (orchestrator authority)
Work directly on the `main` working tree. NO git commits, NO branches.

## GROUNDING (combat-math ledger, 2026-06-13)
- Depth-5 1v1: player ATK 2 / DEF 0 vs enemy HP 12 / ATK 5 / DEF 1.
  Exchange: player deals 1/turn, takes 5/turn. Needs 12 hits, dies in 5.
- Formula and action economy match GAME_DESIGN — the STAT TABLES are wrong.
- v1 proved enemy-side-only levers cannot fix this (0 WIN even at minima
  with 80 HP): the missing lever was player offense.
- Current 15-seed balanced batch (post kit fixes): 0 WIN / 4 ABORT(hp100) /
  11 LOSS, deaths d2–d11.

## AUTHORITY (frozen — GAME_DESIGN.md §11 targets, §5 formula unchanged)
Band ensemble targets: shallows ≥95% clear, middle ≥85%, lowest ≥70%,
with the HP-retention bands. Translate into exchange-rate design targets:
- Player kills an at-band enemy in ~3–5 hits (with band-typical gear).
- An at-band enemy kills a no-heal player in ~5–7 hits.
- Heals per band cover ~1.5–2 full engagements.

## LEVERS (all now allowed)
1. Player: base attack, attack growth per level, base/growth HP, starting
   defense (src/config/**).
2. XP curve / xpYield so leveling keeps pace with bands.
3. Enemy band stat tables and fallback-pack entity stats (content/**).
4. Healing item potency/frequency in the fallback pack.
5. Spawn budgets per band.
Do NOT change: GAME_DESIGN.md, Gate 2 thresholds, combat formula, schema
authoring bounds.

## TASKS
1. Derive the stat tables on paper first (exchange math per band at
   expected player level), then apply.
2. Iterate with 5-seed balanced batches; finish with the full
   45-run batch (3 policies × 15 seeds, max-turns 8000). Paste the table.
3. Acceptance:
   - ≥1 WIN appears across the 45 (bots are imperfect players; WINs prove
     the path exists), shallows deaths (d1–2) rare, median death depth ≥ 7.
   - Gate 2 fixture ensemble passes band thresholds: `pnpm exec vitest run src/gauntlet` → exit 0.
   - `pnpm run check` → exit 0 (regenerate goldens/eval banks via existing
     generators if traces changed).
   - Determinism audit + golden suite → exit 0 (paste).
4. Report: every number before → after, final distribution table, and any
   §11 target still unmet with WHY (e.g. bot exploration gaps causing
   hp-100 ABORTs are a bot defect, not balance — call those out, leave
   them).

## OWNED FILES
- src/config/**, content/**, Gate 2 fixtures if stats are embedded,
  regenerated goldens/eval-bank outputs, their tests.
Forbidden: src/harness/bots/**, src/schemas/vocab/statuses.ts, e2e/**,
GAME_DESIGN.md, Gate 2 thresholds, src/engine combat formula.

## DONE = pasted outputs with exit codes per task 3.

## ESTIMATE / TIMEBOX
Estimate 50 min. Timebox 100 min. STOP if acceptance is unreachable with
these levers — with the exchange math showing why.
