# M2 Milestone Evidence

> **M2 — It reads you.** Across a full run, persona-distinct players receive measurably distinct content (responsiveness eval), the difficulty band holds, and the dungeon diary correctly narrates what happened. Run-to-run memory works.

## Mechanical Verdict

M2 VERDICT (mechanical): MET

HUMAN SESSION PENDING

## Per-Clause Evidence

| M2 clause | Evidence |
|---|---|
| persona-distinct players receive measurably distinct content | Phase 47 live tuning: usable ambient baseline same-persona 5.13%, cross-persona 7.05%, validity 100%, solvability 86.67%, fallback 13.33%; iteration 1 same-persona 54.76%, cross-persona 17.86%, validity 93.33%, solvability 93.33%. The cross rate stayed below half of same-persona (27.38%). M2 test: `tests/integration/m2.test.ts > keeps tuned mock responsiveness scores at or above the Phase 47 baseline` asserts current mock responsiveness against `tests/eval-baselines/mock-baseline.json`, not inline numbers. |
| difficulty band holds | Phase 47 iteration 1 live tuning improved solvability to 93.33% while preserving the recorded Gate/eval path. M2 test `keeps tuned mock responsiveness scores at or above the Phase 47 baseline` runs the current prompt/mock manifests through the eval suite; `records transition budget instrumentation after a fixture descend` confirms the store records `stairsToPlayableMs`, controller state, served source, and depth pair after a real descend. |
| dungeon diary correctly narrates what happened | M2 test: `keeps the dungeon diary faithful to fixture run sources` checks fixture-run diary entries for narration, close call, kill, death learning, and fallback floor text, and verifies every diary claim is backed by a trace or artifact source. |
| run-to-run memory works | M2 test: `threads run 1 death into run 2 prompt through persisted memory` writes a run-1 death to a temp SQLite DB, reopens persistence, builds the prompt through the real memory selector, and asserts run 2 contains the death memory under `CROSS-RUN MEMORY`. |
| artifacts are inspectable in browser | 54B bridge gap closed with `GET /api/artifacts` list/load over the shared read-only artifact reader. Component/bridge test: `app/components/artifacts/ArtifactViewer.test.ts > loads the Tab artifact pane model through the read-only API bridge` uses a fixture run dir, lists runs, loads the model, rejects an unsafe run id, and renders the Tab artifact pane. |
| host e2e smoke | Per gate scope, browser e2e is orchestrator-owned and not rerun in this sandbox. The M2 report notes the host/orchestrator e2e 5/5 requirement as external evidence to attach during final integration. |

## Verification

- `pnpm exec vitest run --config app/components/artifacts/vitest.config.ts --reporter verbose` -> exit 0; 1 file, 3 tests passed.
- `pnpm exec vitest run --config tests/integration/vitest.config.ts tests/integration/m2.test.ts --reporter verbose` -> exit 0; 1 file, 4 tests passed.
- `pnpm run typecheck` -> exit 0.
- `pnpm run lint` -> exit 0.
- `pnpm run check` -> exit 0; 79 files passed, 532 tests passed, 2 skipped.

## Deferred Human Session

Standing authorization defers the human session to the morning checklist.

Two-run live session script:

1. Run `pnpm run dev`.
2. Open `http://localhost:3001`.
3. Start run 1 and play it to death.
4. Start run 2 from the same browser profile.
5. On run 2, look for an opening recognition line that references run 1's death.
6. Press `Tab`, switch to `Artifacts`, and verify the artifact tree loads for the current run.

Acceptance note to add after the human pass:

- Recognition line observed: pending.
- Tab -> Artifacts loaded: pending.
- Human feel verdict: pending.

## Scope Notes

- No browser e2e was run by this worker, per gate scope.
- No commit was made.
- Artifact bridge is read-only: the route exposes list/load only; generation writes remain in the existing Director transport.

## Actual vs Estimate

- Estimate: 45m.
- Actual worker time: ~11m.
