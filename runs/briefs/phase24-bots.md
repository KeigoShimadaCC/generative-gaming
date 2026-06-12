IMPLEMENT TASK — PHASE-24: bot players (contract: phase-plans/PHASE-24-BOT-PLAYERS.md; read GAME_DESIGN.md §11 for the thresholds these bots will power).

GATE SCOPE (sibling may run in src/cli later — you're alone now; full pnpm run check at end). rng: policies must be deterministic given seed — use the engine's rng streams via available state or a fork('bot:<name>') pattern. Do NOT commit. Do NOT modify engine modules.
OWNED FILES: src/harness/bots/** (+ tests).

THE WORK:
1. Policy interface: {decide(state-view) → action} where the state-view is ONLY what a player could know: getAvailableActions() + rendered/inspectable info (visible entities, known items, own stats — build a view helper honoring fog/identification; NO omniscient reads of hidden traps/unidentified effects/unseen cells — this honesty matters for Gate 2's meaning).
2. Three policies with documented heuristics: cautious (retreat at HP<50%, use heal items early, avoid melee when outnumbered, full-explore conservatively), aggressive (close distance, fight everything, spend little), balanced (between; quaff-to-identify when safe). Each deterministic per seed.
3. Full-run driver: runBot(policy, seed, provider, maxTurns) → trace (via the canonical 23A recorder) + outcome {terminal, depth, turns, kills, hpRetention}.
4. Batch runner: policies × seeds → outcome table (data structure + readable formatter).
5. Anti-stall: a policy must never repeat a no-progress action loop — k-repetition breaker (forced alternative or wait-with-purpose), tested.
6. Tests: 3 policies × 10 seeds on the fallback provider — ALL runs reach a terminal state within maxTurns (no hangs); traces valid (replay 2 spot-checked); policies measurably differ on ≥2 of {kills, turns, item-uses} distributions (test with seeded aggregates); fog-honesty test — a policy's decisions identical whether or not hidden traps exist out of sight (fixture).
DEFINITION OF DONE: pnpm run check green (paste); the 30-run outcome table in your report. Report + AMBIGUITIES + actual vs 45m. NO commit. Then stop.
