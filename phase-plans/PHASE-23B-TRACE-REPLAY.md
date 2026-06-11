# PHASE-23B — Trace Replay

## 1. Objective
Any recorded trace replays to byte-identical state — replays as first-class proof of determinism.

## 2. Context
TECH_SPEC §9 (replays first-class, golden seeds); 23A's format.

## 3. Dependencies
21. Parallel with 23A (format coordinated via the stamp/header spec in TECH_SPEC §5; if drift appears, 23A's format wins).

## 4. Scope IN
- `src/harness/replay/`: replayer (trace → re-execute actions on fresh engine with same seed/content → compare per-turn hashes), divergence reporting (first divergent turn, both hashes), golden-seed test harness (fixture traces committed as regression anchors).

## 5. Scope OUT
- UI replay viewing (later, run index). Trace repair (a divergent trace is evidence, never fixed).

## 6. Owned files
`src/harness/replay/**`, `tests/golden/**` (fixture traces).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Replayer + divergence reporting + tests | replay/** | Codex | 20m / 40m | 23A |
| 2 | implement | Golden-seed harness + first committed golden traces | tests/golden/** | Cursor | 10m / 20m | after 1 + 23A |
| 3 | verify | Replay golden traces twice; mutate one engine constant locally and confirm divergence is *detected* (then revert) | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · golden replay suite · induced-divergence detection demo.

## 9. Completion criteria
1. Golden traces replay byte-identical (tests).
2. Induced divergence detected at the exact mutated turn (verified once).
3. Acceptance bar: "engine change altered outcomes" is now machine-detectable — the PHASE-00 breaking-change rule has teeth.

## 10. Risks & escalation
If replay requires content not in the trace (fallback pack reference), record content references in the header — coordinate with 23A's stamp.
