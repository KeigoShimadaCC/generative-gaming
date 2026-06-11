INTEGRATION TASK — PHASE-09/10 consolidation (orchestrator-adjudicated seams from parallel work; read src/engine/systems/combat.ts, status.ts, and src/engine/turn/loop.ts headers first).

OWNED FILES: src/config/** (additive), src/engine/turn/** (additive only), src/engine/systems/combat.ts, src/engine/systems/status.ts (+ their tests).

THE WORK — three seams:
1. CONFIG: add GAME_DESIGN §6 status magnitudes to config (poisonHpPerTurn −1, burnHpPerTurn −2, regenHpPerTurn +2, shieldDefBonus +3, weakenAtkPenalty −2; source comments §6). Point BOTH combat.ts (shield/weaken derivation) and status.ts (tick deltas) at it — no locally pinned magnitude literals remain in implementation code (tests may keep expected literals).
2. TURN (additive, same discipline as the resolver registry — existing tests UNMODIFIED and green, else STOP): add registerTickHook(slot, hook) for the four frozen slots (damageOverTime, durations, hunger, regen); step() runs registered hooks in slot order. Update the frozen-surface header. status.ts then SELF-REGISTERS its DoT/durations hooks (remove the exported-composition workaround).
3. DEATH UNIFICATION: export one death routine from combat.ts — applyDeath(state, entityId, {attribution}) — handling removal, entity_died event, loot-drop hook, player→LOSS immediately, XP ONLY when attribution is a killer entity. status.ts burn-kill calls it with attribution none (no XP). Both kill paths now identical in effects except XP. Tests: burn kill drops loot + immediate LOSS for player + no XP; combat kill unchanged.

DEFINITION OF DONE: pnpm run check green with all pre-existing turn tests unmodified (paste); rg for the magnitude literals in combat.ts/status.ts implementation code (none outside config). Report + actual vs 20m. NO commit. Then stop.
