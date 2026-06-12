IMPLEMENT TASK — PHASE-34: Gate 2 — simulated playability (contract: phase-plans/PHASE-34-GATE-2-SIMULATION.md; read GAME_DESIGN §11 thresholds + the M0 finding in PROGRESS backlog: bots never WIN, all ABORTED at turn ceiling, 100% hp — your thresholds must be judged against CURRENT bot reality, see below).

GATE SCOPE (sibling in src/gauntlet/gates01): pnpm run typecheck + pnpm exec eslint src/gauntlet/gate2 + pnpm exec vitest run src/gauntlet/gate2. Tests must use SMALL ensembles (2 policies × 2 seeds, low maxTurns) for speed; full ensemble size stays config. Do NOT commit.
STEP 0: materialization — PHASE-35 will own the shared materialize(); UNTIL THEN build candidate floors via the same primitives the run loop uses (floorgen generate + place + enemies assemble) behind a LOCAL makeCandidateFloor() with a TODO-PHASE-35 to swap to the shared path. Bots: src/harness/bots (driver + policies). Do NOT modify existing modules.
OWNED FILES: src/gauntlet/gate2/** (+ tests).

THE WORK:
1. run.ts: candidate floor from a gated manifest → SINGLE-FLOOR bot evaluation: run each policy × seed on JUST that floor (start at entrance; success = reaching stairs_down or completing the floor's quest; cap turns per config) — NOT full runs. Metrics per run: reached-stairs, hp retention, turns, deaths; aggregate per ensemble.
2. judge.ts: thresholds per band from config (§11 table: clear rate, hp retention band, hard rejects: any-death floors 1–2, zero-threat below depth 2 — threat = at least one enemy encounter possible on the path); verdict + GateReport (codes G2_*, frozen).
3. IMPORTANT calibration honesty: given the M0 finding (balance too soft), current floors may trivially pass hp-retention and fail nothing — your tests must include an ENGINEERED unwinnable floor (walled stairs → bots can't reach → reject) and an engineered zero-threat floor (reject below depth 2) and a normal fallback floor (pass). Threshold TUNING is PHASE-58's; you implement the machinery faithfully.
4. Determinism: same candidate + seeds → same verdict (test).
5. Wall-clock guard: ensemble eval time logged in the report struct (timing via injected clock).
DEFINITION OF DONE: scoped gates green (paste). Report + actual vs 45m. NO commit. Then stop.
