IMPLEMENT TASK — PHASE-21: run loop, caps, win/loss, the Hoard (contract: phase-plans/PHASE-21-RUN-LOOP.md; read GAME_DESIGN.md §2 and WORLD.md §1 win canon). This phase makes it a GAME — everything else is merged and waiting.

GATE SCOPE: alone in repo for engine code — full pnpm run check (a sibling may create content/fallback data files; ignore content/). rng fork('run'). Do NOT commit.
STEP 0: import floorgen (generate + place), enemies (assemble), turn (descend handling — read how loop.ts treats descend: built-in; you wire what descend DOES), state (run meta/depth/band), config (depth 12, soft cap 800, hard cap 8000 — hard cap already enforced by 07B; you own the soft cap), all content types. Do NOT modify existing modules beyond their published hooks/registries.

OWNED FILES: src/engine/run/** (+ tests).

THE WORK:
1. loop.ts — floor progression: the content-injection interface FloorContentProvider {getFloor(depth, seed) → {params, roster, items, traps, npcs, quest?}} — the run loop CONSUMES content, never selects it (fallback pack PHASE-26 and Director PHASE-38 both implement this; define the interface here, document it as frozen); descend → generate next floor via floorgen + place content via placement API + assemble enemies; band from depth; player placed at entrance.
2. Soft cap: after config.softCap turns on a floor, escalating reinforcement spawns every 100 turns — FROM THE CURRENT FLOOR'S ROSTER, within remaining spawn budget (16's rosterAffordable), placed legally; boredom events emitted.
3. endings.ts — floor 12: the Hoard (a special feature/cell from floor params); take-one-thing interaction at the Hoard → WIN; death → LOSS (already routed); abort → ABORTED; run summary structure (depth/turns/kills/discoveries/quests — derived from log events, feeds the diary later).
4. Tests: a scripted full descent (stub provider with minimal floors) reaches floor 12, takes the thing, WINs; soft-cap reinforcements appear on schedule within budget (fixture floor, fast-forward turns); reinforcements stop when budget exhausted; all three endings reachable; run summary derivation correct vs a known event sequence; malformed provider result → typed error not crash.

DEFINITION OF DONE: pnpm run check green (paste); rg 'Math.random|Date.now' src/engine/run/ empty. Report + AMBIGUITIES + actual vs 35m. NO commit. Then stop.
