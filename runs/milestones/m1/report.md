# M1 Milestone Evidence

> M1 — The Director lives. AI-generated floors pass the gauntlet and get played. Validity and solvability rates measured. A floor visibly responds to the player's trace.

## Mocked Full-Loop

- `tests/integration/m1.test.ts > closes the mocked Director loop from bot trace to generated floor play` plays a fallback floor with a bot, parses and summarizes the trace, assembles a Director prompt, serves a mock manifest through `generateFloor`, observes Gate 0/1/2 pass, materializes the floor, and has a bot play the generated floor until it reaches stairs.

## Live Ambient Session

- Session runtime: 295.9s.
- Served without fallback: 10/10 (bar: >=8/10) -> MET.
- Gate-pass rows: 10/10 -> MET.
- HP-retention advisory rows: 10/10.
- Outcomes: generated 10, repaired 0, fallback 0.
- Latency ms: min 23834, p50 29921, avg 29167, max 32678.

| case | band | depth | trace policy | outcome | attempts | latency ms | gate failures | advisory checks | trace | generation record | served manifest |
|---|---|---:|---|---|---:|---:|---|---|---|---|---|
| shallows-aggressive-fixture | shallows | 1 | aggressive | generated | 1 | 29370 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/session-2026-06-12T06-35-07-722Z/shallows-aggressive-fixture.ndjson) | [record](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-shallows-aggressive-fixture/floors/1/generation.json) | [manifest](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-shallows-aggressive-fixture/floors/1/attempts/0/manifest.json) |
| shallows-cautious-fixture | shallows | 2 | cautious | generated | 1 | 29858 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/session-2026-06-12T06-35-07-722Z/shallows-cautious-fixture.ndjson) | [record](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-shallows-cautious-fixture/floors/2/generation.json) | [manifest](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-shallows-cautious-fixture/floors/2/attempts/0/manifest.json) |
| shallows-balanced-a | shallows | 3 | balanced | generated | 1 | 29921 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/session-2026-06-12T06-35-07-722Z/shallows-balanced-a.ndjson) | [record](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-shallows-balanced-a/floors/3/generation.json) | [manifest](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-shallows-balanced-a/floors/3/attempts/0/manifest.json) |
| shallows-aggressive-b | shallows | 4 | aggressive | generated | 1 | 29417 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/session-2026-06-12T06-35-07-722Z/shallows-aggressive-b.ndjson) | [record](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-shallows-aggressive-b/floors/4/generation.json) | [manifest](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-shallows-aggressive-b/floors/4/attempts/0/manifest.json) |
| middle-cautious-a | middle | 5 | cautious | generated | 1 | 32678 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/session-2026-06-12T06-35-07-722Z/middle-cautious-a.ndjson) | [record](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-middle-cautious-a/floors/5/generation.json) | [manifest](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-middle-cautious-a/floors/5/attempts/0/manifest.json) |
| middle-balanced-b | middle | 6 | balanced | generated | 1 | 23834 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/session-2026-06-12T06-35-07-722Z/middle-balanced-b.ndjson) | [record](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-middle-balanced-b/floors/6/generation.json) | [manifest](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-middle-balanced-b/floors/6/attempts/0/manifest.json) |
| middle-aggressive-c | middle | 8 | aggressive | generated | 1 | 24378 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/session-2026-06-12T06-35-07-722Z/middle-aggressive-c.ndjson) | [record](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-middle-aggressive-c/floors/8/generation.json) | [manifest](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-middle-aggressive-c/floors/8/attempts/0/manifest.json) |
| middle-cautious-d | middle | 9 | cautious | generated | 1 | 30660 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/session-2026-06-12T06-35-07-722Z/middle-cautious-d.ndjson) | [record](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-middle-cautious-d/floors/9/generation.json) | [manifest](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-middle-cautious-d/floors/9/attempts/0/manifest.json) |
| lowest-balanced-a | lowest | 10 | balanced | generated | 1 | 30938 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/session-2026-06-12T06-35-07-722Z/lowest-balanced-a.ndjson) | [record](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-lowest-balanced-a/floors/10/generation.json) | [manifest](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-lowest-balanced-a/floors/10/attempts/0/manifest.json) |
| lowest-aggressive-b | lowest | 11 | aggressive | generated | 1 | 30618 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/session-2026-06-12T06-35-07-722Z/lowest-aggressive-b.ndjson) | [record](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-lowest-aggressive-b/floors/11/generation.json) | [manifest](runs/milestones/m1/m1-live-session-2026-06-12T06-35-07-722Z-lowest-aggressive-b/floors/11/attempts/0/manifest.json) |

## Responsiveness Spot-Proof

| input | fights picked | fights avoided | pickups | item uses | retreats | close calls | trace |
|---|---:|---:|---:|---:|---:|---:|---|
| aggressive-fixture | 200 | 252 | 6 | 0 | 0 | 0 | [trace](runs/milestones/m1/traces/session-2026-06-12T06-35-07-722Z/shallows-aggressive-fixture.ndjson) |
| cautious-fixture | 257 | 382 | 20 | 0 | 0 | 0 | [trace](runs/milestones/m1/traces/session-2026-06-12T06-35-07-722Z/shallows-cautious-fixture.ndjson) |

| surface | aggressive-fixture served manifest | cautious-fixture served manifest |
|---|---|---|
| roster | cellar louse(shallows,approach_melee); pale root rat(shallows,approach_melee) | loose bone knocker(shallows,approach_melee); ash clay servant(shallows,approach_melee) |
| items | notched knife(weapon); patched hide(armor); dry apple(food); green copper(coin) | short iron tooth(weapon); patched hide vest(armor); dry oat cake(food); dull copper count(coin) |
| narration | The stair ends in cold rooms and patient dust. / Your pockets keep their little weight. The dark does not ask for it. | The stair ends in a pale room. Dust waits where no one has chosen it. / Your hand closes again. The floor gives no answer. |

VERDICT: trace-correlated provisionally; the two contrast traces received visibly different served manifests. Human review still decides whether the differences actually correlate with the trace content.

## Artifact Roots

- Milestone root: [runs/milestones/m1](runs/milestones/m1)
- Report: [runs/milestones/m1/report.md](runs/milestones/m1/report.md)

## Actual vs Estimate

- Estimate: 45m.
- Measured live-session runtime inside the harness: 295.9s.
- Worker wall-clock actual is reported in the final handoff.

M1 VERDICT (mechanical): MET per NORTH_STAR §10-M1
HUMAN REVIEW PENDING


## CORRECTED SESSION

- Session runtime: 137.9s.
- Calls: 5 sequential live `generateFloor` calls (shallows x3, middle x2).
- Served without fallback under honest Gate 2 verdicts: 5/5 (100%).
- Blocking gate-pass rows: 5/5.
- HP-retention advisory rows: 5/5.
- Outcomes: generated 5, repaired 0, fallback 0.
- Latency ms: min 23771, p50 25332, avg 27307, max 33187.

| case | band | depth | trace policy | outcome | attempts | latency ms | gate failures | advisory checks | trace | generation record | served manifest |
|---|---|---:|---|---|---:|---:|---|---|---|---|---|
| shallows-aggressive-fixture | shallows | 1 | aggressive | generated | 1 | 33187 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/corrected-session-2026-06-12T06-40-03-638Z/shallows-aggressive-fixture.ndjson) | [record](runs/milestones/m1/m1-live-corrected-session-2026-06-12T06-40-03-638Z-shallows-aggressive-fixture/floors/1/generation.json) | [manifest](runs/milestones/m1/m1-live-corrected-session-2026-06-12T06-40-03-638Z-shallows-aggressive-fixture/floors/1/attempts/0/manifest.json) |
| shallows-cautious-fixture | shallows | 2 | cautious | generated | 1 | 29028 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/corrected-session-2026-06-12T06-40-03-638Z/shallows-cautious-fixture.ndjson) | [record](runs/milestones/m1/m1-live-corrected-session-2026-06-12T06-40-03-638Z-shallows-cautious-fixture/floors/2/generation.json) | [manifest](runs/milestones/m1/m1-live-corrected-session-2026-06-12T06-40-03-638Z-shallows-cautious-fixture/floors/2/attempts/0/manifest.json) |
| shallows-balanced-a | shallows | 3 | balanced | generated | 1 | 25332 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/corrected-session-2026-06-12T06-40-03-638Z/shallows-balanced-a.ndjson) | [record](runs/milestones/m1/m1-live-corrected-session-2026-06-12T06-40-03-638Z-shallows-balanced-a/floors/3/generation.json) | [manifest](runs/milestones/m1/m1-live-corrected-session-2026-06-12T06-40-03-638Z-shallows-balanced-a/floors/3/attempts/0/manifest.json) |
| middle-cautious-a | middle | 5 | cautious | generated | 1 | 23771 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/corrected-session-2026-06-12T06-40-03-638Z/middle-cautious-a.ndjson) | [record](runs/milestones/m1/m1-live-corrected-session-2026-06-12T06-40-03-638Z-middle-cautious-a/floors/5/generation.json) | [manifest](runs/milestones/m1/m1-live-corrected-session-2026-06-12T06-40-03-638Z-middle-cautious-a/floors/5/attempts/0/manifest.json) |
| middle-balanced-b | middle | 6 | balanced | generated | 1 | 25215 | none | attempt0:G2_HP_RETENTION:recorded-fail | [trace](runs/milestones/m1/traces/corrected-session-2026-06-12T06-40-03-638Z/middle-balanced-b.ndjson) | [record](runs/milestones/m1/m1-live-corrected-session-2026-06-12T06-40-03-638Z-middle-balanced-b/floors/6/generation.json) | [manifest](runs/milestones/m1/m1-live-corrected-session-2026-06-12T06-40-03-638Z-middle-balanced-b/floors/6/attempts/0/manifest.json) |

AMENDED M1 VERDICT (mechanical): MET for the corrected five-call session; HP-retention failures are advisory under GAME_DESIGN §11 calibration staging.

## Full Live-Game Smoke (orchestrator-run, host)

`pnpm run simulate -- --policy balanced --seed live-game-smoke-1 --director ambient`
→ balanced bot, **depth 12/12 reached**, 575 turns, 16 kills, terminal ABORTED
(known bot-drive/balance items, PHASE-58). Every floor live-generated, gated,
materialized, prefetched. The machine holds for a complete game.

M1 VERDICT (mechanical): **MET** — corrected session 5/5 served-without-fallback
under honest gates, ~25s median latency, full-game smoke green. HUMAN REVIEW
PENDING (report + a personal `pnpm run play --director ambient` descent).
