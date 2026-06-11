IMPLEMENT TASK — PHASE-06: engine state model & serialization (contract: phase-plans/PHASE-06-ENGINE-STATE.md; read it plus TECH_SPEC.md §2/§9 and GAME_DESIGN.md §2/§4 first).

STEP 0 (ENVIRONMENT.md, verified): gates pnpm run check. src/schemas (entity types, protocol) and src/config and src/engine/rng + src/engine/clock are merged — import from them; NEVER redefine an entity type locally; NEVER hardcode a number that exists in config. No Math.random/Date.now. Do NOT commit.

OWNED FILES: src/engine/state/** only.

THE WORK:
1. src/engine/state/types.ts — GameState: run meta (runId, seed, depth, band derived from depth per config, turn, terminal status ACTIVE|WIN|LOSS|ABORTED), floor state (grid placeholder reference by id — the map module arrives in PHASE-07A, so hold floor geometry as an opaque serializable slot with a typed interface to be implemented later + a comment marking the 07A contract), player (HP, level, XP, fullness, position, inventory slots, equipment, statuses — types imported from schemas where they exist), entities map (id → enemy/NPC/item-on-ground/trap instances referencing schema definitions + runtime fields: position, currentHP, status list, behavior runtime slots), quest state, log event list (typed event union — define the event envelope {turn, type, data} with an initial small set: state_created, serialization markers; systems add their events in later phases via a declared extension pattern, document it), rng stream cursors (named substream states), protocol/engine version stamp.
2. src/engine/state/init.ts — createInitialState(seed, config): deterministic construction; entity id scheme (monotonic per-kind counters, e.g. enemy#1).
3. src/engine/state/serialize.ts — serialize(state): string (stable key ordering — deterministic JSON) and deserialize(s): GameState with zod-style validation of the envelope; round-trip identity.
4. Tests: round-trip byte-identity (serialize→deserialize→serialize equal strings); golden snapshot fixture (one serialized initial state committed and compared); id scheme determinism; band derivation per config table; no-Date/no-Math.random grep guard test.

DEFINITION OF DONE — run and paste:
1. pnpm run check (green)
2. rg 'Math.random|Date.now' src/engine/state/ (empty)
Report files, outputs, AMBIGUITIES (stop-and-list, don't invent shapes — especially anything that smells like a schema change, which is PHASE-05 territory), actual time vs 40m estimate. NO commit. Then stop.
