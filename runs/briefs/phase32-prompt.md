IMPLEMENT TASK — PHASE-32: prompt assembly (contract: phase-plans/PHASE-32-PROMPT-ASSEMBLY.md; read WORLD.md §10 hard canon + §3 Director persona + §8 depth arc, NORTH_STAR §6, and src/schemas/manifest.ts).

GATE SCOPE (sibling in src/director/provider): pnpm run typecheck + pnpm exec eslint src/director/prompt + pnpm exec vitest run src/director/prompt. Do NOT commit.
STEP 0 — CRITICAL INPUT: src/schemas/manifest.ts fixtures include the three REAL ambient outputs with annotated validity failures — your prompt's job is to close those gaps (e.g. if real outputs omitted required fields or broke caps, the prompt must show/state them). The spike prompt (runs/spikes/29-ambient-director/prompt.txt) is the crude baseline to improve on.

OWNED FILES: src/director/prompt/** (+ tests).

THE WORK:
1. blocks.ts: canon block — WORLD §10's ten laws distilled (~half page), stored as a versioned exported constant with a SYNC TEST: hash/fingerprint the §10 section text from WORLD.md in-test; if WORLD changes, the test fails → forces deliberate prompt review. Persona block per band (Shallows indifferent / Middle interested / Lowest intimate — WORLD §8 wording). Task block: the manifest ask with a COMPACT VALID EXAMPLE manifest (derive from a band fixture), the band's numeric budgets injected from config (spawn budget, entity caps, text caps, value bands), and output discipline ('ONLY the JSON object').
2. summarize.ts: trace → behavioral facts block. Input: a recorded trace (23A format). Extract deterministic facts: combat engagement rate (fights picked vs avoidable), retreat frequency, item usage profile (uses by category / hoarding signal: pickups vs uses), NPC engagement (talks initiated), exploration ratio (cells seen / floor), close calls (HP < 25% events), kills by enemy type, quest choices (accepted/refused/completed). Output: a capped (~150 words) structured text block + the raw fact object (evals will want it). Unit-test on hand-built mini-traces with known facts.
3. assemble.ts: assemblePrompt({band, depth, config, traceFacts, memoryBlock?: string (PHASE-44 slot, optional-null now), runContext}) → string. Pure; snapshot tests (two fixed inputs → committed snapshots).
4. Tests: sync test; summarizer fact extraction on 2 contrasting fixture traces (aggressive vs cautious bot traces exist under runs/milestones/m0/traces — copy 2 as test fixtures) with style-separation assertions; snapshot stability; token-budget guard (prompt length < a config cap).
DEFINITION OF DONE: scoped gates green (paste). Report + actual vs 40m. NO commit. Then stop.
