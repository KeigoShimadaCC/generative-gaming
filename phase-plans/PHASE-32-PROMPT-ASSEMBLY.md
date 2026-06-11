# PHASE-32 — Prompt Assembly: Canon, Trace Summary, Director Persona

## 1. Objective
The deterministic function that builds the Director's prompt: distilled world canon + run state + a structured summary of how the player actually plays.

## 2. Context
WORLD §10 (hard canon → prompt), §3 (Director persona traits), §8 (depth-arc personalization); NORTH_STAR §6 (the floor responds to the trace); 23A traces as input.

## 3. Dependencies
30. Parallel with 31.

## 4. Scope IN
- `src/director/prompt/`: canon block (WORLD §10 distilled, checked-in as a versioned prompt file with a test asserting it stays in sync with WORLD.md's numbered laws), persona block per depth band (indifferent/interested/intimate), task block (the §12 manifest ask + band budgets injected as numbers from config).
- Trace summarizer: trace → structured behavioral facts (combat avoidance rate, item usage profile, NPC engagement, hoarding signals, deaths/close calls, quest choices) — deterministic, unit-tested, capped token budget.
- Prompt snapshot tests (same inputs → same prompt).

## 5. Scope OUT
- Memory across runs (44). Narration-specific prompting (45). Any provider call (31's mock used in tests).

## 6. Owned files
`src/director/prompt/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Canon/persona/task blocks + sync test + snapshots | prompt/blocks.ts | Codex | 15m / 30m | 31 |
| 2 | implement | Trace summarizer + tests on fixture traces (distinct play styles → distinct summaries) | prompt/summarize.ts | Codex (same session) | 20m / 40m | — |
| 3 | verify | Style-separation check: hoarder vs pacifist fixture traces produce measurably different summaries; prompt fits token cap | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · snapshot tests · summarizer style-separation test.

## 9. Completion criteria
1. Prompt is a pure function of (canon version, band, config, trace, run state) — snapshot-proven.
2. Distinct fixture play styles yield distinct summaries (test with named assertions).
3. Canon block provably derived from WORLD §10 (sync test fails if WORLD.md's laws change without prompt update).
4. Acceptance bar: responsiveness (the M2 metric) has its causal input — what the Director is told about the player — fully testable without any API call.

## 10. Risks & escalation
Summarizer is where "the dungeon reads you" lives or dies — if behavioral facts feel thin, report with examples; the orchestrator may expand the fact list (doc edit) rather than letting the worker improvise.
