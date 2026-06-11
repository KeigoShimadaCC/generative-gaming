IMPLEMENT TASK — PHASE-12: inventory & equipment (contract: phase-plans/PHASE-12-INVENTORY-EQUIPMENT.md; read it plus GAME_DESIGN.md §4 slots and §8 categories).

STEP 0 (ENVIRONMENT.md verified): gates pnpm run check. Import: state, config (16 slots, stack-to-5, equipment slots: 1 weapon / 1 armor / 2 charms), schemas item types, turn registry (register the 'pickup' action resolver), combat (read how derived stats consume equipment from state — combat.ts already derives weapon/armor bonuses from state equipment fields; your job is to manage those fields correctly, not to compute stats). Do NOT modify turn/combat/status/player/movement. No Math.random/Date.now. Do NOT commit.

OWNED FILES: src/engine/systems/inventory.ts + inventory.test.ts only.

THE WORK:
1. Slot management: 16 slots; stacking for identical consumables to 5 (identity = same schema definition id; equipment never stacks); add/remove with typed full-inventory error (UX-style reason).
2. Pickup resolver: item on player's tile → inventory (or stack), pickup event; full → illegal with reason, no turn consumed. Drop: inventory → ground at player tile (one ground item per tile — if occupied, nearest free walkable cell deterministically).
3. Equip/unequip: weapon/armor/charm slots per config; equipping into an occupied slot swaps (old item to inventory; if full, typed error, no change); equipment state fields exactly where combat's derivation reads them; equip/unequip events.
4. Tests: stack/split math incl. stack-to-5 boundary; full-inventory paths (pickup refusal costs no turn; swap-when-full no-op); drop placement determinism on a crowded fixture; equip swap; ITEM CONSERVATION property test — 1000 seeded random ops (pickup/drop/equip/unequip/stack) on a fixture, total item count (inventory + ground + equipped, counting stack sizes) constant, no duplication or loss.

DEFINITION OF DONE: pnpm run check green (paste); rg 'Math.random|Date.now' src/engine/systems/inventory.ts empty. Report + AMBIGUITIES + actual vs 30m. NO commit. Then stop.
