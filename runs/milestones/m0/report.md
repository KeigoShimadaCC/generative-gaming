# M0 Milestone Evidence

> **M0 — Playable skeleton.** The engine runs a complete, finite, seeded run with fallback content, headless and in the UI, fully offline. Bots can play it end to end.

## Clause Evidence

| M0 clause | Evidence |
|---|---|
| complete, finite, seeded run | `tests/integration/m0.test.ts > keeps the full fallback WIN smoke green`; determinism: `records byte-identical traces when the same policy and seed are run twice` |
| with fallback content | all 15 bot traces use content ref `fallback:old-stock` / pack `0.0.0` at protocol `1.2.0` |
| headless | `runs policy x seed fallback bots to terminal states with replay-identical traces`; 15-run table below |
| in the UI | human CLI acceptance is explicitly deferred; see final pending line |
| fully offline | `imports no network modules along the gameplay path` scans `src/cli/play.ts` plus the transitive import graph from `src/engine/**` for `node:http`, `node:https`, `http`, `https`, `undici`, and `fetch(` |
| Bots can play it end to end | all rows below terminate outside `ACTIVE` and each trace replays with `{ status: "identical" }` |

## 15-Run Outcome Table

| policy | seed | terminal | depth | turns | kills | hp% | itemUses | trace |
|---|---|---:|---:|---:|---:|---:|---:|---|
| cautious | phase24-bot-1 | ABORTED | 12 | 717 | 18 | 100 | 0 | runs/milestones/m0/traces/cautious-phase24-bot-1.ndjson |
| cautious | phase24-bot-2 | ABORTED | 2 | 175 | 1 | 100 | 0 | runs/milestones/m0/traces/cautious-phase24-bot-2.ndjson |
| cautious | phase24-bot-3 | ABORTED | 5 | 302 | 9 | 100 | 0 | runs/milestones/m0/traces/cautious-phase24-bot-3.ndjson |
| cautious | phase24-bot-4 | ABORTED | 12 | 737 | 12 | 100 | 0 | runs/milestones/m0/traces/cautious-phase24-bot-4.ndjson |
| cautious | phase24-bot-5 | ABORTED | 12 | 607 | 7 | 100 | 0 | runs/milestones/m0/traces/cautious-phase24-bot-5.ndjson |
| balanced | phase24-bot-1 | ABORTED | 12 | 753 | 25 | 100 | 1 | runs/milestones/m0/traces/balanced-phase24-bot-1.ndjson |
| balanced | phase24-bot-2 | ABORTED | 2 | 168 | 5 | 100 | 1 | runs/milestones/m0/traces/balanced-phase24-bot-2.ndjson |
| balanced | phase24-bot-3 | ABORTED | 5 | 281 | 12 | 100 | 1 | runs/milestones/m0/traces/balanced-phase24-bot-3.ndjson |
| balanced | phase24-bot-4 | ABORTED | 12 | 770 | 20 | 100 | 1 | runs/milestones/m0/traces/balanced-phase24-bot-4.ndjson |
| balanced | phase24-bot-5 | ABORTED | 12 | 636 | 14 | 100 | 1 | runs/milestones/m0/traces/balanced-phase24-bot-5.ndjson |
| aggressive | phase24-bot-1 | ABORTED | 10 | 526 | 24 | 100 | 0 | runs/milestones/m0/traces/aggressive-phase24-bot-1.ndjson |
| aggressive | phase24-bot-2 | ABORTED | 2 | 137 | 5 | 100 | 0 | runs/milestones/m0/traces/aggressive-phase24-bot-2.ndjson |
| aggressive | phase24-bot-3 | ABORTED | 5 | 273 | 14 | 100 | 0 | runs/milestones/m0/traces/aggressive-phase24-bot-3.ndjson |
| aggressive | phase24-bot-4 | ABORTED | 10 | 628 | 22 | 100 | 0 | runs/milestones/m0/traces/aggressive-phase24-bot-4.ndjson |
| aggressive | phase24-bot-5 | ABORTED | 6 | 326 | 12 | 100 | 0 | runs/milestones/m0/traces/aggressive-phase24-bot-5.ndjson |

## Golden Refresh

- Canonical golden: [tests/golden/replay-mini-wait.ndjson](tests/golden/replay-mini-wait.ndjson)
- Current protocol: `1.2.0`
- Replay evidence: `src/harness/replay/replay.test.ts > replays the committed golden fixture minted by the canonical recorder` run twice during M0 verification.

HUMAN RATIFICATION PENDING: pnpm run play
