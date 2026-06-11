IMPLEMENT TASK — PHASE-04B: tunable config module (contract: phase-plans/PHASE-04B-CONFIG-MODULE.md; read it plus GAME_DESIGN.md in full — the doc is your data source).

STEP 0 — environment facts (ENVIRONMENT.md, verified): gates are pnpm run typecheck/lint/test/check. Do NOT commit. macOS BSD userland.

OWNED FILES: src/config/** only (you may create the folder; do not touch src/config consumers — none exist yet — or any other path).

THE WORK:
1. Create src/config/ with a typed, deeply-frozen (as const + Object.freeze) config object, grouped by GAME_DESIGN section. Transcribe EVERY value marked [T] in GAME_DESIGN §§2–12: run structure (§2 incl. floor geometry table), player (§4 table + regen/fullness), combat (§5: hit chance, variance band), economy (§8: value bands per band, merchant multipliers, items-per-floor), enemy spawn budgets (§9.1 table), Gate-2 thresholds (§11 table: clear rates, HP retention bands, ensemble 3 policies × 5 seeds), Director allowances (§12: narration beat caps, signature budget relax 25%).
2. Separate clearly-marked `bounds` export for every [HARD] value: caps (§2 run hard cap 8000), status duration bounds (§6 table), effect verb parameter bounds (§7 table), trigger proc chances and targeting ranges (§7), item bounds (§8: weapon +1–6, armor +1–5, food-floor rule), enemy stat budgets (§9.1), entity caps (§10: NPCs 0–2, traps 0–4, quest caps), repair cap 2 (§5-pillar/NORTH_STAR), signature one-per-run. Header comment: changing a bounds value = protocol version bump (TECH_SPEC §9).
3. Every value carries a comment citing its source (e.g. `// GAME_DESIGN §4`).
4. A structural test (src/config/config.test.ts): asserts every §-group exists, spot-checks ≥12 values verbatim against the doc tables (hardcode expected numbers in the test), asserts deep-frozenness.

DEFINITION OF DONE — run and include outputs:
1. pnpm run check (green)
2. A self-produced coverage table in your final message: GAME_DESIGN table → config path, one row per doc table, so the verifier can audit completeness.
If GAME_DESIGN is ambiguous anywhere (missing unit, contradictory bound), STOP on that value, list it under 'AMBIGUITIES' in your report, and proceed with the rest. NO commit. Then stop.
