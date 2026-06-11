# PHASE-07A — Map Model, Terrain, FOV

## 1. Objective
The grid: tiles, terrain kinds, walkability, line of sight, and three-state fog (unseen/remembered/visible).

## 2. Context
UX §1 (fog states), §4 (witnessed-facts need LOS); GAME_DESIGN §2 (grid sizes); TECH_SPEC §9 (determinism).

## 3. Dependencies
06. Parallel with 07B (disjoint folders).

## 4. Scope IN
- `src/engine/map/`: tile grid structure, terrain enum (floor, wall, door, water, stairs, entrance), walkability/transparency tables, coordinate utilities (8-way neighbors, lines, radii).
- Symmetric shadowcasting (or equivalent) FOV; per-player fog memory layer.
- Pathfinding utility (A* or BFS) — needed by behaviors, Gate 2, and solvability checks; deterministic tie-breaking.

## 5. Scope OUT
- No floor *generation* (PHASE-17). No movement rules (PHASE-08). No rendering (PHASE-22).

## 6. Owned files
`src/engine/map/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Grid, terrain, coordinates, walkability + tests | src/engine/map/grid.ts, terrain.ts | Codex | 15m / 30m | 07B |
| 2 | implement | FOV + fog memory + tests (symmetry property test) | src/engine/map/fov.ts | Codex (same session) | 15m / 30m | — |
| 3 | implement | Pathfinding + deterministic tie-break test | src/engine/map/path.ts | Cursor | 10m / 20m | after 1 |
| 4 | verify | FOV symmetry & path determinism re-run on fixed fixtures | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · FOV symmetry property test · two-run path-identity test.

## 9. Completion criteria
1. FOV symmetric (A sees B ⟺ B sees A) on fixture maps (test).
2. Pathfinding deterministic across runs (test) and returns null for unreachable (test).
3. Fog transitions unseen→visible→remembered correct (test).
4. Acceptance bar: Gate 2 (PHASE-34) and behaviors (15A/B) can rely on `path()` and `visible()` as ground truth.

## 10. Risks & escalation
FOV algorithm edge cases (pillars, diagonal walls) — pin expected behavior in fixtures; ambiguity → report with the fixture, orchestrator decides.
