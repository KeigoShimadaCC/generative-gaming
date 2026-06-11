# PHASE-44 — Run & Cross-Run Memory

## 1. Objective
The Deep remembers: within-run callbacks and cross-run recognition flow from persisted memory events into the Director's prompt — diegetically.

## 2. Context
WORLD §7 (memory canon: "You again. Last time you died running."); NORTH_STAR §6.6 (demo beat: second run proves memory); 27's read API; 32's prompt blocks.

## 3. Dependencies
27, 32. Parallel with Wave G.

## 4. Scope IN
- `src/director/memory/`: memory selection — given profile + current run, choose the most narratively-usable events (recency- and salience-weighted: deaths > refusals > completions > deeds; config weights), render to a bounded prompt block ("what the Deep remembers"), within-run callback tracking (entities/quests referenced earlier this run available to later floors).
- Memory block integrated into 32's assembly (this phase owns the block file; 32's composition point was built for it).
- "What the dungeon learned" summary generator for run end (feeds 54A's diary screen and the next run's opening).

## 5. Scope OUT
- Diary UI (54A). Narration phrasing (45 styles it). New persistence schema (27's API is fixed; gaps → report).

## 6. Owned files
`src/director/memory/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Selection + weighting + prompt block + tests | memory/select.ts | Codex | 20m / 40m | Wave G |
| 2 | implement | Callback tracking + learned-summary + tests | memory/callbacks.ts | Codex (same session) | 15m / 30m | — |
| 3 | verify | Two-run fixture: run 1 death event provably present in run 2's prompt; token budget respected; salience ordering correct | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · two-run memory propagation test · prompt snapshot with memory block.

## 9. Completion criteria
1. Cross-run propagation test-proven (the demo beat's mechanism).
2. Memory block bounded and deterministic given the same DB state (snapshot).
3. Salience weighting matches config (test).
4. Acceptance bar: a mocked second run's prompt visibly "knows" the first run — verifiable by reading one snapshot.

## 10. Risks & escalation
Memory is the highest-delight, highest-creepiness feature — selection *content* rules (what's usable) get human review at close.
