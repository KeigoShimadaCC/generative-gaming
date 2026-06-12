IMPLEMENT TASK — PHASE-36: repair loop & fallback degradation (contract: phase-plans/PHASE-36-REPAIR-FALLBACK.md; read NORTH_STAR §5 fallback rule, UX §6 invisibility, GAME_DESIGN repair cap 2 [HARD]).

GATE SCOPE: alone — full pnpm run check. Do NOT commit.
STEP 0: everything composes here — provider (generateManifest + taxonomy), gates 0/1/2 (uniform GateReport with frozen reason codes), materialize, artifacts (GenerationAttemptInput accepts your pieces adapter-free — verified), fallback provider (the Old Stock getFloor as degradation target), config (repair cap 2, timeouts). Do NOT modify existing modules.
OWNED FILES: src/gauntlet/repair.ts (+ test).

THE WORK:
1. generateFloor(ctx) → {floor, record}: prompt (from ctx, assembled upstream — take the prompt string) → provider.generateManifest → gate 0 → 1 → 2 (with materialize for 2) → on all-pass: materialized floor + full GenerationRecord (every attempt chained) via artifacts writer.
2. On gate failure: build a REPAIR PROMPT = original prompt + 'Your previous output failed these checks:' + the failed checks' codes+details + the offending JSON fragment(s) + 'Return the corrected complete JSON manifest only.' → retry via provider; cap at config.repairCap (2) total repairs.
3. On exhaustion / provider taxonomy failures (timeout, process_error): fallback — Old Stock getFloor(depth, seed), outcome recorded as fallback with the full attempt chain. NEVER throw through; ALWAYS return a servable floor.
4. Tests (mock provider): happy path 1-shot; malformed → repaired on attempt 2 (assert repair prompt contains the reason codes + fragments — snapshot one); unrepairable → fallback after exactly 2 repairs; timeout → immediate fallback; every path writes a complete chain (read back via artifacts reader); cap never exceeded (adversarial always-fail mock).
DEFINITION OF DONE: pnpm run check green (paste); repair-prompt snapshot quoted. Report + actual vs 30m. NO commit. Then stop.
