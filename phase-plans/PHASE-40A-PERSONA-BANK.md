# PHASE-40A — Persona Trace Bank

## 1. Objective
The eval suite's input corpus: recorded traces embodying five named play styles, generated reproducibly by parameterized bot variants.

## 2. Context
NORTH_STAR §5 (persona list: hoarder, pacifist, speedrunner, completionist, chaos gremlin); 24's policy interface.

## 3. Dependencies
24. Parallel with 40B.

## 4. Scope IN
- `src/evals/personas/`: five persona policies as parameterizations/extensions of 24's bots (hoarder: pickup-everything + low item use; pacifist: avoid combat; speedrunner: stairs-rush; completionist: full-explore + NPC engagement; chaos: seeded erratic legal play), each with a documented behavioral signature.
- Bank generation command: personas × seeds on fallback content → committed trace fixtures under `tests/eval-bank/` + a signature test (each persona's traces measurably match its signature via 32's summarizer).

## 5. Scope OUT
- Scoring (40B). Live generation (41 consumes the bank).

## 6. Owned files
`src/evals/personas/**`, `tests/eval-bank/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Five persona policies + signatures + tests | personas/** | Codex | 25m / 50m | 40B |
| 2 | implement | Bank generation command + committed fixtures | tests/eval-bank/** | Cursor | 10m / 20m | after 1 |
| 3 | verify | Signature separation matrix: summarizer distinguishes all 5 personas pairwise on ≥2 facts each | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · signature-separation matrix test.

## 9. Completion criteria
1. Five personas, each signature-verified against its own traces (tests).
2. Pairwise separation matrix fully distinguishable (test).
3. Bank regenerable byte-identical from seeds (determinism check).
4. Acceptance bar: responsiveness evals have ground truth — "did the Director respond to a hoarder *as* a hoarder" is now answerable.

## 10. Risks & escalation
Personas failing to separate = summarizer gap (32), not a persona bug — report rather than over-engineering persona behavior.
