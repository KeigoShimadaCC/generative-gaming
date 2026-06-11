# PHASE-06 — Engine State Model & Serialization

## 1. Objective
The canonical `GameState` shape: serializable, inspectable, round-trippable — the object every other engine system mutates through reducers.

## 2. Context
TECH_SPEC §2 (engine purity), §9 (replays); GAME_DESIGN §4 (player state), §2 (run structure); NORTH_STAR §4.3.

## 3. Dependencies
05. Serial — all engine phases build on this.

## 4. Scope IN
- `src/engine/state/`: GameState type (run meta, floor state, player, entities, quest state, log events, rng-stream cursors), entity id scheme, state constructors from config.
- Serialization: `serialize`/`deserialize` with round-trip identity test; golden snapshot test fixture.
- Reducer convention: pure `(state, event) → state` helpers; mutation entry points documented in module README.

## 5. Scope OUT
- No game rules of any kind. No map generation. No rendering. No persistence-to-disk (PHASE-27).

## 6. Owned files
`src/engine/state/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | State types + constructors + id scheme | src/engine/state/types.ts, init.ts | Codex | 20m / 40m | — |
| 2 | implement | Serialize/deserialize + round-trip + golden snapshot tests | src/engine/state/serialize.ts + tests | Codex (same session) | 10m / 20m | — |
| 3 | verify | Round-trip property re-run; shape matches schemas (imports, no redefinition) | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · round-trip test output cited.

## 9. Completion criteria
1. serialize(deserialize(s)) === s byte-identical (test-proven).
2. State imports all entity types from src/schemas (zero local redefinitions — verifier grep).
3. Acceptance bar: a later phase can add a system by writing reducers against this shape without touching state types.

## 10. Risks & escalation
Shape decisions that smell like schema changes → stop, report (PHASE-05 owns shapes).
