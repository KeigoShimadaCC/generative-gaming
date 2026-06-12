IMPLEMENT TASK — PHASE-45: narration beats & Gate 3 heuristics (contract: phase-plans/PHASE-45-NARRATION-GATE3-HEURISTICS.md; read WORLD.md §6 voice rules — second person, fairy-tale-with-teeth, the banned-everywhere list — and §3.7 sparing; GAME_DESIGN §12 beat caps).

GATE SCOPE: alone — full pnpm run check. Do NOT commit.
STEP 0: narration beats already exist in the manifest schema (intro + ≤3 observation beats with trigger conditions) and materialize attaches them; the renderer's log is where beat text reaches the player; gates 0–2 + repair consume GateReport shapes; novelty.ts has reusable text-similarity pieces. Do NOT modify gates 0–2 or repair.ts (Gate 3 heuristics plug into the same chain via repair's gate sequencing — read how repair orders gates and STOP if no insertion point exists for a gate-3 call; report it rather than rewiring repair yourself).
OWNED FILES: src/director/narration/** , src/gauntlet/gate3/heuristics.ts, content/banned-vocab.json (+ tests).

THE WORK:
1. narration/: beat trigger evaluation — engine-event-driven conditions (first sight of entity X, player action patterns: flee/hoard/quaff events) firing the manifest's beats as Deep-voice log lines, capped per floor (config); fired-beat tracking on run state (each beat fires once).
2. gate3/heuristics.ts: deterministic text checks over ALL generated strings (names, descriptions, dialogue, narration): banned-vocabulary regex set from content/banned-vocab.json (modern tech terms, fourth-wall/UI words, contemporary slang — seed it thoughtfully from WORLD §6's banned list, ~60 entries with word-boundary regexes), length caps re-assert, second-person check for narration lines (heuristic: flags 'I think/you click'-style violations), near-dup of recent floors' narration (reuse novelty text similarity). Output: standard GateReport (G3_* codes, frozen). Failures are REPAIRABLE (reason codes into repair prompts like any gate).
3. Tests: violation corpus (≥20 strings: 'the goblin checks his smartphone', 'press the inventory button', 'lol nice'...) — 100% caught with correct codes; on-canon corpus (≥20 from the fallback pack's actual strings) — 0 false positives; beat caps + once-only firing; trigger conditions on fixture event streams.
DEFINITION OF DONE: pnpm run check green (paste); both corpora results. Report + actual vs 40m. NO commit. Then stop.

RETRY AMENDMENTS (r2, orchestrator scope grants after your correct STOP):
- You MAY add a deep_narration event type to the engine event union (wherever quests/run events joined it) and its formatter line in src/engine/render/log.ts (Deep-voice line, exhaustive-switch discipline) — append-only edits.
- You MAY add one export to src/evals/metrics/novelty.ts for its text-similarity helper (no behavior change) and import it.
Everything else in the original brief stands.

RETRY AMENDMENTS (r3): repair.ts confirmed to have no gate-3 insertion point — you are GRANTED additive ownership of src/gauntlet/repair.ts (+ its test, append-only): insert a pluggable post-Gate-2 hook — registerGate3(fn: (manifest, ctx) → GateReport) — default absent/no-op; when registered and failing, same repairable semantics as gates 0–2 (reason codes into repair prompts, counts toward cap). Pre-existing repair tests must pass UNMODIFIED, else STOP. Your heuristics gate registers itself via this hook. All prior amendments stand.
