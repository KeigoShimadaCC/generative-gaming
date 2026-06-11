# PHASE-35 — Manifest → Floor Application

## 1. Objective
The deterministic bridge: a fully-gated manifest becomes a playable engine floor via floorgen and the placement API — the "apply" in parse → validate → apply.

## 2. Context
NORTH_STAR §4.4 (AI never mutates state; deterministic code applies); 17's placement API; 30's placement-hint shape.

## 3. Dependencies
17, 30. Parallel with 33, 34 (34 uses a pre-release copy of this for materialization — coordinate: this phase's `materialize()` is the shared function; 34 imports it. Sequence tasks so materialize lands first).

## 4. Scope IN
- `src/director/apply/`: `materialize(manifest, seed) → FloorState` — layout from knobs, entities resolved from manifest definitions through 16's assembly, placement hints resolved through 17's API (with deterministic fallback placement when hints are unsatisfiable), quests/NPCs/narration attached, origin tags preserved.
- Unsatisfiable-hint handling: place legally anyway, record the deviation in the application report (never fail a gated manifest for a hint).

## 5. Scope OUT
- Gates (33/34 call this, not vice versa). Serving/prefetch (38).

## 6. Owned files
`src/director/apply/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | materialize() + hint resolution + deviation report + tests | apply/** | Codex | 25m / 50m | 33 |
| 2 | verify | Same manifest + seed → identical floor (hash); band fixtures materialize playable floors (bot completes); adversarial hints produce legal placements + recorded deviations | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · determinism hash test · fixture-floor bot completion.

## 9. Completion criteria
1. Materialization deterministic (test).
2. All 30 band fixtures produce floors a bot completes (test).
3. No hint can cause an illegal placement (adversarial test) — deviations recorded instead.
4. Acceptance bar: Gate 2 and live serving share one materialization path; what was simulated is exactly what is served.

## 10. Risks & escalation
The one-materialization-path property is the safety story — if 34 needs a divergent copy for speed, stop and report; divergence here undermines Gate 2's meaning.
