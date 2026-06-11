# PHASE-25B — CLI: Simulate / Batch / Replay

## 1. Objective
The orchestrator-facing commands: run bots headlessly, batch seed sweeps, replay traces — the tools every later verification brief will cite.

## 2. Context
TECH_SPEC §2 (CLI surface: simulate/replay); 24's batch runner; 23B's replayer.

## 3. Dependencies
23B, 24. Parallel with 25A.

## 4. Scope IN
- `src/cli/simulate.ts`: `--policy --seed --content --depth` single runs; `--batch policies×seeds` sweeps with outcome table output (JSON + readable).
- `src/cli/replay.ts`: replay a trace file, verify hashes, print divergence or render turns (`--watch` to print every render).
- `pnpm run simulate`, `pnpm run replay` scripts.

## 5. Scope OUT
- Eval scoring (41). Director invocation (38). Pretty output beyond a table.

## 6. Owned files
`src/cli/simulate.ts`, `src/cli/replay.ts`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | simulate single + batch + outcome table | cli/simulate.ts | Cursor | 15m / 30m | 25A |
| 2 | implement | replay command + watch mode | cli/replay.ts | Cursor | 10m / 20m | task 1 |
| 3 | verify | Batch 3×5 on fixture content; replay one of its traces with --watch; outputs sane | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · `pnpm run simulate -- --batch ...` · `pnpm run replay -- <trace> --watch | head`.

## 9. Completion criteria
1. Both commands work against fixture content with documented flags (--help text accurate).
2. Batch outcome table includes terminal state, turns, depth, kills per run.
3. Acceptance bar: a verification brief can say "run `pnpm run simulate -- --batch ...` and paste the table" and that's sufficient instruction.

## 10. Risks & escalation
Keep flags few and stable — these commands become contract surface for dozens of later briefs.
