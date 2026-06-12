IMPLEMENT TASK — PHASE-23A: trace recording (contract: phase-plans/PHASE-23A-TRACE-RECORDING.md; read TECH_SPEC.md §5 stamping list).

GATE SCOPE (sibling in src/harness/replay): pnpm run typecheck + pnpm exec eslint src/harness/trace + pnpm exec vitest run src/harness/trace. Do NOT commit.
STEP 0: the engine contract (start/getAvailableActions/step/isTerminal) is frozen in src/engine/turn; state serialization + hashing-ready stable serialize exists in src/engine/state. Do NOT modify engine modules.
OWNED FILES: src/harness/trace/** (+ tests).

THE WORK:
1. recorder.ts — wrap the engine contract as a PURE OBSERVER: record(engineLikeSession) or a step-interceptor — design so recording cannot alter outcomes; NDJSON line per turn {turn, action, events, stateHash}; header line: full TECH_SPEC §5 stamp (protocolVersion, engineVersion from package.json, contentRef (provider id/pack version), seed, createdAt as an INJECTED timestamp param — no Date.now in src), run-id scheme (seed+timestamp-param based).
2. stateHash: stable serialize → fast hash (fnv1a or similar, integer math).
3. Writer: runs/<run-id>/trace.ndjson via injected fs adapter (testable; node fs default).
4. Tests: record a short fixture run → every line parses, stamp complete; hash deterministic; THE PURITY PROOF: same seed run with and without recorder → identical final state hash; appendix: trace of the full-run WIN smoke records 12 floors without error.
DEFINITION OF DONE: scoped gates green (paste); rg 'Math.random|Date.now' src/harness/trace/ empty. Report + actual vs 30m. NO commit. Then stop.
