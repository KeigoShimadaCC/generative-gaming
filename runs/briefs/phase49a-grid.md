IMPLEMENT TASK — PHASE-49A: grid renderer & fog (contract: phase-plans/PHASE-49A-GRID-RENDERER.md; read UX §1 grid spec + §10 budgets + §3 animation restraint).

GATE SCOPE: alone — full pnpm run check (clean .next first). Do NOT commit.
STEP 0: the app shell + store exist (48); the engine's render module has the glyph table + fog semantics to mirror (read src/engine/render/grid.ts — the WEB grid must agree with the ASCII renderer's precedence/fog rules; reuse its exported tables if exported, else propose an export in your report rather than duplicating).
OWNED FILES: app/components/grid/** (+ tests), the game route's grid-region wiring line.

THE WORK:
1. DOM/CSS-grid game view from store state: one cell div per tile, glyph + color class + a shape/label affordance (color never the only channel — UX §10); entity layering precedence (player > enemy > npc > item > revealed-trap > terrain); fog three-state (visible lit / remembered dim terrain-only / unseen blank).
2. Change pulses: damage/heal floating numbers + one-frame hit flash driven by log events since last render; movement = instant reposition with ~50ms ease; NOTHING queues input.
3. Single-pass update from store diff (memoized rows or cells — avoid full-grid re-render per turn where cheap).
4. Perf harness: a test rendering the largest band grid (40×24) through 100 state updates asserting budget (use whatever timing vitest+jsdom allows honestly — document what the number means; the true <16ms claim is browser-measured later, note it).
5. Fixture stories: hydrate 2 committed fixture states (mid-action floor; fog mix) for dev viewing.
DEFINITION OF DONE: pnpm run check green (paste); component tests for fog/precedence/pulses. Report + actual vs 40m. NO commit. Then stop.
