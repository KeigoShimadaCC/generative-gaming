IMPLEMENT TASK — PHASE-11: player systems — XP, leveling, fullness, regen (contract: phase-plans/PHASE-11-PLAYER-SYSTEMS.md; read it plus GAME_DESIGN.md §4 and §3 tick order).

STEP 0 (ENVIRONMENT.md verified): gates pnpm run check. Import: state, config (ALL §4 numbers: xpToNextLevelFactor 8, growth, caps, fullness drain interval, starvation, regen interval, overfeed 200), turn module's registerTickHook (hunger and regen slots — read loop.ts frozen-surface header), combat's xp_gained events (consume from the event flow or expose an applyXp function — match how combat emits XP; read combat.ts first). Do NOT modify turn/combat/status/movement. No Math.random/Date.now. Do NOT commit.

OWNED FILES: src/engine/systems/player.ts + player.test.ts only.

THE WORK:
1. XP accumulation → level-up: threshold = 8 × current level (config), multi-level on big gains, cap 12; growth per config (+4 HP max, +1 ATK per 2 levels, +1 DEF per 3 levels — base stats; current HP increases by the max-HP delta on level-up); level_up event with HUD-pulse metadata.
2. Hunger (hunger tick slot): fullness −1 per config interval (turn-count based); at 0: −1 HP per 2 turns (starvation events); overfeed cap 200 decaying back to 100 first.
3. Natural regen (regen slot): +1 HP per config interval, ONLY when fullness > 0 and HP < max.
4. Self-register hooks via registerTickHook; tick order is the frozen DoT→durations→hunger→regen.
5. Tests: level curve spot cases incl. multi-level and cap; growth math; CLOSED-FORM starvation test — from full fullness and full HP, an idle player dies at exactly the turn the config arithmetic predicts (compute the expected turn in-test from config, then simulate); regen gating (no regen while starving; none at full HP); overfeed decay; level-up HP delta.

DEFINITION OF DONE: pnpm run check green (paste); rg 'Math.random|Date.now' src/engine/systems/player.ts empty. Report + AMBIGUITIES + actual vs 30m. NO commit. Then stop.
