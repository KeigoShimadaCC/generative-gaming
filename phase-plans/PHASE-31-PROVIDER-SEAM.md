# PHASE-31 — Provider Seam, Model Config, Mocks

## 1. Objective
The one place that talks to LLM providers: model-agnostic, config-driven, fully mockable.

## 2. Context
TECH_SPEC §6 (AI SDK seam, model ids in config, frontier/cheap split); NORTH_STAR §8 ("swapping models is an eval run, not a refactor").

## 3. Dependencies
30. Parallel with 32.

## 4. Scope IN
- `src/director/provider/`: `generateManifest(prompt, schema) → result` via AI SDK `generateObject`; model/temperature/retry/timeout from config (`director` and `judge` model slots); typed error taxonomy (timeout, refusal, parse-fail, validation-fail); per-call usage capture (tokens, latency) onto the result for artifacts.
- Mock provider: fixture-backed implementation of the same interface (returns 30's fixtures; injectable failure modes) — the default in tests and keyless dev.

## 5. Scope OUT
- Prompts (32). Gates (33/34). Retry *policy* beyond simple transport retry (36 owns repair).

## 6. Owned files
`src/director/provider/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Seam + config + error taxonomy + usage capture + tests (mocked) | provider/** | Codex | 20m / 40m | 32 |
| 2 | implement | Mock provider + failure injection + tests | provider/mock.ts | Cursor | 10m / 20m | task 1 |
| 3 | verify | Keyless run uses mock automatically; one @live call through the seam captures usage correctly | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` (keyless, mock path) · one `@live` seam test.

## 9. Completion criteria
1. Same call sites work against mock and live by config alone (test).
2. All failure modes produce typed errors, never throws-through (tests).
3. Usage (tokens/latency) captured on every result (test + @live spot).
4. Acceptance bar: no other file in the repo imports the AI SDK — verifier grep.

## 10. Risks & escalation
The "no other file imports the provider" rule is the seam's whole value; encode it as a lint rule if cheap, else a grep test.
