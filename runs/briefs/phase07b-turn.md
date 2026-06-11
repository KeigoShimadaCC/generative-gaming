IMPLEMENT TASK — PHASE-07B: turn cycle, structured actions, terminal states (contract: phase-plans/PHASE-07B-TURN-CYCLE-ACTIONS.md; read it plus GAME_DESIGN.md §3 and NORTH_STAR.md §4 first). This is the STABLE GAME CONTRACT — the five methods you build here are consumed by the UI, CLI, bots, and Gate 2 forever.

STEP 0 (ENVIRONMENT.md, verified): gates pnpm run check. Import GameState from src/engine/state, config from src/config, rng/clock from src/engine. src/engine/map exists (grid/terrain/fov; path.ts is being written in parallel by another worker — do NOT import path.ts; movement legality at this phase is bounds+walkability only via terrain tables). No Math.random/Date.now. Do NOT commit.

OWNED FILES: src/engine/turn/** only.

THE WORK:
1. src/engine/turn/actions.ts — structured action types: move (8-dir), attack (target id), use_item (item id + optional target), pickup, talk (npc id), wait, descend, inspect (cell) — payloads typed; action legality checker returning typed results: legal | {illegal, reason} (reasons are log-able strings per UX §2.2 'explained, not eaten'); getAvailableActions(state) enumeration (every currently-legal action, bounded — for direction actions enumerate only legal directions).
2. src/engine/turn/loop.ts — the engine contract: start(seed, content?) (delegates to state init), getAvailableActions, step(state, action) → {state, events}, render placeholder (real renderer is PHASE-22 — emit a minimal debug string), isTerminal. Strict turn order per GAME_DESIGN §3: player action resolves → all other actors act in stable actor-id order (actor logic itself is a no-op hook this phase — behaviors arrive in 15A/B) → end-of-turn tick hooks in the FIXED order DoT → durations → hunger → regen (register no-op hook slots; phases 10/11 fill them; FREEZE this hook interface and document it in the file header).
3. Terminal states: WIN/LOSS/ABORTED transitions + run hard-cap (config) enforcement inside step; abort action; stepping a terminal state returns it unchanged with an illegal-action event.
4. Invalid actions: typed error event, ZERO state change (assert via serialize-equality in tests), turn does NOT advance.
5. Tests: contract test per method; invalid-action no-op (serialize equality); hard cap forces terminal; all three terminal states reachable; actor ordering stability (fixture with 3 dummy actors using the no-op hook, order by id over 100 turns); tick order fixture (hooks that record call order).

DEFINITION OF DONE — run and paste: pnpm run check (green); rg 'Math.random|Date.now' src/engine/turn/ (empty).
Report files, outputs, AMBIGUITIES (the hook interface is load-bearing for 10/11 — if it feels wrong, STOP and report rather than reshaping), actual time vs 45m estimate. NO commit. Then stop.
