# PHASE-04C — Seeded RNG + Injected Clock

## 1. Objective
The only randomness and time sources the engine/gauntlet will ever use: seeded, forkable, reproducible.

## 2. Context
TECH_SPEC §9 (determinism rules); NORTH_STAR §4.3; PHASE-00 determinism guard.

## 3. Dependencies
03. Parallel with 04A, 04B.

## 4. Scope IN
- `src/engine/rng/`: pure seeded PRNG (e.g., mulberry32-class), string-seed derivation, **named substreams** (fork by label: `rng.fork("floor:3")`) so systems don't perturb each other's sequences.
- Helpers: int range, pick, weighted pick, shuffle, percent roll.
- `src/engine/clock/`: injected turn-counter clock interface (no wall time).
- Reproducibility tests: same seed → identical sequence; forked streams independent; cross-platform stable (pure integer math only).

## 5. Scope OUT
- No usage in any system yet. No crypto randomness. No wall-clock anywhere.

## 6. Owned files
`src/engine/rng/**`, `src/engine/clock/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | PRNG + substreams + helpers + tests | src/engine/rng/** | Codex | 15m / 30m | 04A, 04B |
| 2 | implement | Clock interface + test | src/engine/clock/** | Cursor | 5m / 15m | task 1 |
| 3 | verify | Re-run reproducibility tests; grep repo for Math.random/Date.now | — (read-only) | Cursor | 5m / 10m | — |

## 8. Verification commands
`pnpm run check` · `rg "Math.random|Date.now" src/` (must be empty).

## 9. Completion criteria
1. Identical seeds yield byte-identical sequences across two runs (test-proven).
2. Substream forking proven independent (test).
3. Repo-wide grep clean.
4. Acceptance bar: every later engine phase imports randomness only from here — the determinism invariant has exactly one implementation point.

## 10. Risks & escalation
Floating-point nondeterminism → integer math only; if a helper needs floats, stop and report.
