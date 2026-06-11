IMPLEMENT TASK — PHASE-07A tasks 1+2: map model, terrain, FOV (contract: phase-plans/PHASE-07A-MAP-FOV.md; read it plus UX.md §1/§4 fog requirements). Pathfinding (task 3) belongs to ANOTHER worker — do NOT create src/engine/map/path.ts.

STEP 0 (ENVIRONMENT.md, verified): gates pnpm run check. Import from src/engine/state (the floor-geometry contract slot in types.ts is YOUR interface to implement — read its comment), src/config, src/engine/rng. No Math.random/Date.now. Do NOT commit.

OWNED FILES: src/engine/map/grid.ts, src/engine/map/terrain.ts, src/engine/map/fov.ts, src/engine/map/index.ts (+ their .test.ts files). NOT path.ts.

THE WORK:
1. grid.ts — tile grid structure satisfying the state module's floor-geometry contract: width/height from config band geometry, tile array (flat, indexed), coordinate utilities: inBounds, idx/coord conversion, 8-way neighbors, straight lines (Bresenham), radius/disc cells. Fully serializable (plain data).
2. terrain.ts — terrain enum: floor, wall, door, water, stairs_down, entrance; walkability and transparency lookup tables (door: walkable+opaque when closed — model open/closed as tile state; water: walkable+transparent; walls block both).
3. fov.ts — symmetric shadowcasting FOV (visible set from origin + radius), per-player fog memory layer (three states: unseen / remembered / visible — remembered persists tile terrain as last seen), blind-status radius override hook (radius parameter, the status itself comes later).
4. Tests per module: coordinate utilities (bounds, neighbors at edges/corners, line endpoints), terrain tables vs the list above, FOV symmetry property (for sampled origin pairs A,B on fixture maps: A sees B ⟺ B sees A), pillar/corner fixture cases with expected visible sets (commit the fixture maps as ASCII strings parsed in-test), fog state transitions.

DEFINITION OF DONE — run and paste: pnpm run check (green); rg 'Math.random|Date.now' src/engine/map/ (empty).
Report files, outputs, AMBIGUITIES (FOV edge-case rules: pin them in fixtures and list any contested case rather than deciding silently), actual time vs 30m estimate. NO commit. Then stop.
