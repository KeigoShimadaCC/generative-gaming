IMPLEMENT TASK — PHASE-35: manifest → floor materialization (contract: phase-plans/PHASE-35-MANIFEST-APPLICATION.md). The ONE materialization path both Gate 2 and live serving share — "what was simulated is what is served."

GATE SCOPE: alone — full pnpm run check. rng via fork('run'/'floorgen') consistent with the run loop's conventions (read loop.ts). Do NOT commit.
STEP 0: Gate 2 has a local makeCandidateFloor with TODO-PHASE-35 (src/gauntlet/gate2/run.ts) — you will replace it; the run loop's floor-building internals (floorgen generate + place + enemies assemble) show the canonical assembly steps; the manifest's placement hints align with place.ts request hints.
OWNED FILES: src/director/apply/** (+ tests), src/gauntlet/gate2/run.ts (ONLY the TODO swap to your shared function), src/engine/run/loop.ts (ONLY if a small refactor extracts its floor-build into a function you can share — prefer exporting a buildFloor from apply/ that BOTH gate2 and a future provider path call; if loop.ts refactor is needed beyond 10 lines, STOP and report).

THE WORK:
1. materialize(manifest, seed) → {floor (grid+placed content+assembled enemies), deviations: PlacementDeviation[]} — layout from manifest.params via floorgen; placement via the placement API honoring hints; enemies via assemble; quest/npcs/narration attached; origin tags preserved. Deterministic.
2. Unsatisfiable hints: legal placement anyway + recorded deviation (never fail a gated manifest on a hint).
3. Swap Gate 2's TODO to materialize() (its candidate floors now ARE the canonical build).
4. Tests: same manifest+seed → identical floor (serialize-hash, twice); the 3 band fixtures materialize and a bot completes each (small ensemble); adversarial hints (out-of-range room index, all-same-cell spread) → legal placements + deviations recorded; gate2's tests still green unmodified (run them).
DEFINITION OF DONE: pnpm run check green (paste); confirmation gate2 tests unchanged. Report + actual vs 35m. NO commit. Then stop.
