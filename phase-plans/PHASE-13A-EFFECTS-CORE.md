# PHASE-13A — Effect Interpreter I: Core Verbs

## 1. Objective
The interpreter for the 8 stat/status verbs: damage, heal, apply_status, cure_status, buff_stat, nutrition, identify, enchant.

## 2. Context
GAME_DESIGN §7 (verbs + bounds + composition); schemas from 05 are the input type — the interpreter executes validated effect bundles, never raw data.

## 3. Dependencies
10, 12. Parallel with 13B (disjoint files).

## 4. Scope IN
- `src/engine/effects/core.ts`: one executor per verb, parameter bounds re-asserted at execution (defense in depth), target resolution for self/melee shapes, effect-bundle sequencing (1–3 effects in order, atomic per bundle).
- `src/engine/effects/registry.ts` (shared registry shell — 13A creates, 13B only registers into it; coordinate via frozen registry interface defined here first).
- Log events per effect execution.

## 5. Scope OUT
- Spatial/meta verbs (13B). Triggers and targeting shapes beyond self/melee (14 wires bolt/burst/floor via 13B's geometry helpers).

## 6. Owned files
`src/engine/effects/core.ts`, `src/engine/effects/registry.ts` (+ tests).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Registry interface (frozen first, 15 min in) + 8 verb executors + tests per verb | core.ts, registry.ts | Codex | 25m / 50m | 13B (after registry freeze) |
| 2 | verify | Per-verb audit vs GAME_DESIGN §7 rows; bounds re-assertion proven by out-of-bounds execution test | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · out-of-bounds execution rejection test.

## 9. Completion criteria
1. All 8 verbs execute with doc-exact semantics (test per verb).
2. Out-of-bounds parameters rejected at execution even if they somehow passed validation (test).
3. Registry interface frozen and published for 13B within the first 15 minutes (recorded in PROGRESS.md).
4. Acceptance bar: an item defined purely as schema data heals/poisons/enchants correctly with zero item-specific code.

## 10. Risks & escalation
Registry shape is the 13A/13B coupling point — freeze it first, message the orchestrator, then build. Drift here = merge pain.
