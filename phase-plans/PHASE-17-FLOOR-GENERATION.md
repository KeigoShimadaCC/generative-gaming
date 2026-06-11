# PHASE-17 — Floor Generation

## 1. Objective
Seeded rooms-and-corridors generation from knob parameters (size, room count, layout flavor) with guaranteed solvability — the engine half of "the Director chooses knobs, never tiles."

## 2. Context
GAME_DESIGN §2 (geometry table, layout flavors, solvability guarantee [HARD]); TECH_SPEC §9 (seeded); NORTH_STAR §3 (layout parameters are Director-authorable).

## 3. Dependencies
07A. Parallel with 13–16 (different folder).

## 4. Scope IN
- `src/engine/floorgen/`: generation from a `FloorParams` knob object (from schemas): grid size, room count range, layout flavor (open/warren/halls/ring/sanctum), entrance + stairs placement, connectivity guarantee (every room reachable; post-gen BFS assert).
- Placement API for content: walkable-cell allocation for enemies/items/traps/NPCs honoring "never unreachable, never on exits" rules — the single placement chokepoint later phases and Gate 2 trust.
- Per-flavor characterization fixtures (golden layouts per seed).

## 5. Scope OUT
- Content selection (what to place — 26/Director). Theme/palette semantics (cosmetic metadata pass-through only).

## 6. Owned files
`src/engine/floorgen/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Rooms/corridors generator + connectivity assert + tests | floorgen/generate.ts | Codex | 25m / 50m | — |
| 2 | implement | 5 layout flavors + golden-layout fixtures | floorgen/flavors.ts | Codex (same session) | 15m / 30m | — |
| 3 | implement | Placement API + reachability/exit rules + tests | floorgen/place.ts | Cursor | 15m / 30m | after 1 |
| 4 | verify | 1k-seed sweep: 100% connectivity, stairs always reachable, placement rules never violated | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · 1k-seed connectivity sweep · golden-layout snapshot tests.

## 9. Completion criteria
1. 1,000 seeds × all flavors × all band sizes: zero connectivity failures.
2. Same seed + params → identical layout (test).
3. Placement API provably never places on unreachable cells or exits (property test).
4. Acceptance bar: Gate 2 can treat "generated floor" as structurally sound by construction and only judge *content* difficulty.

## 10. Risks & escalation
Generation is the classic infinite-loop habitat: hard iteration caps with seeded retry, and a generation failure returns a typed error (caller falls back), never hangs.
