IMPLEMENT TASK — PHASE-09: combat resolution (contract: phase-plans/PHASE-09-COMBAT.md; read it plus GAME_DESIGN.md §5 and §9.1).

STEP 0 (ENVIRONMENT.md verified): gates pnpm run check. Import: state, map (line of sight via fov/grid), turn registry (register the 'attack' action resolver; also export a resolveAttack(state, attackerId, defenderId) function for other systems — movement's attack_intent and later enemy behaviors call it), config (ALL numbers from config: hit chance, variance band, formula constants), rng (use a named 'combat' substream — never the root stream). Do NOT modify src/engine/turn or movement. No Math.random/Date.now. Do NOT commit.

OWNED FILES: src/engine/systems/combat.ts + combat.test.ts only.

THE WORK:
1. The one formula: damage = max(1, ATK − DEF) × seeded variance 0.85–1.15, rounded; flat hit chance from config (miss = no damage, miss event).
2. Derived stats: ATK = base (from level per config growth) + weapon bonus + buff_stat modifiers; DEF likewise with armor/shield — read equipment/status from state; statuses' numeric contributions: shield +3 DEF, weaken −2 ATK min 1 (per GAME_DESIGN §6 — implement the stat-derivation here as a pure function; the status SYSTEM with durations/ticks is PHASE-10, do not implement ticking).
3. Melee attack (adjacent check) and bolt attack (first target along a line within range, line-of-sight via map transparency).
4. Death: HP ≤ 0 → entity removed, died event, XP yield event (yield from entity cost/config), loot-drop hook (a registered-callback slot for thief/inventory drops — no-op default).
5. Player death → LOSS terminal via the state's terminal field.
6. Log events: one per resolution (attack_hit with damage, attack_missed, entity_died, xp_gained).
7. Tests: formula spot cases (ATK 5 vs DEF 2 → 3 ± variance, min 1 vs high DEF); statistical test — 10k seeded rolls, damage distribution within 0.85–1.15 band and hit rate within ±1% of config; melee adjacency rules; bolt first-target + LOS-blocked cases on ASCII fixtures; death/XP/removal; player death → LOSS; every resolution emits exactly one combat event.

DEFINITION OF DONE: pnpm run check green (paste); rg 'Math.random|Date.now' src/engine/systems/ empty; confirm combat uses rng.fork('combat') (quote the line). Report + AMBIGUITIES + actual vs 25m. NO commit. Then stop.
