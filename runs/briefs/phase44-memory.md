IMPLEMENT TASK — PHASE-44: run & cross-run memory (contract: phase-plans/PHASE-44-MEMORY.md; read WORLD.md §7 memory canon — "You again. Last time you died running." — and NORTH_STAR §6.6).

GATE SCOPE: alone — full pnpm run check. Do NOT commit.
STEP 0: persistence read API (src/harness/persistence: recentEvents, eventsBySalience — memory events already flow from quests/runs), prompt assembly's memoryBlock slot (assemblePrompt takes memoryBlock?: string — PHASE-32 left it null). Do NOT modify persistence schema (gaps → STOP) or assemble's signature.
OWNED FILES: src/director/memory/** (+ tests).

THE WORK:
1. select.ts: selectMemories(profileId, currentRunId, repo) → salience+recency-weighted picks (config weights: deaths > refusals > completions > deeds), capped token budget; renderMemoryBlock(picks) → bounded prompt text ('What the Deep remembers: ...') — deterministic given DB state.
2. callbacks.ts: within-run callback tracking — entities/quests referenced earlier this run, available to later floor prompts (in-memory, fed from run events); plus buildLearnedSummary(runSummary, events) → the 'what the dungeon learned' note (post-run, feeds diary + next run's opening).
3. Wire: a composed helper the orchestration layer calls to fill assemblePrompt's memoryBlock.
4. Tests: two-run fixture — run 1's death event provably lands in run 2's memory block (THE demo-beat mechanism, NORTH_STAR §6.6); salience ordering per config; token cap; determinism; learned-summary derivation from a known event sequence.
DEFINITION OF DONE: pnpm run check green (paste); the two-run propagation test name quoted. Report + actual vs 40m. NO commit. Then stop.
