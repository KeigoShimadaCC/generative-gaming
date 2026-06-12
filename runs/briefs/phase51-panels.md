IMPLEMENT TASK — PHASE-51A+51B combined: context panels — inspect, inventory, dialogue, quest log (contracts: phase-plans/PHASE-51A-INSPECT-INVENTORY.md + PHASE-51B-DIALOGUE-QUEST-UI.md; read UX §4 known-vs-unknown contract and §5 dialogue/quest model; serial lane = one worker owns both halves).

GATE SCOPE: alone — full pnpm run check (clean .next; redirect-don't-pipe). Do NOT commit.
STEP 0: input (50) emits mode-toggle intents to store UI flags (i/q/x) — your panels consume them; the engine's knowledge query APIs (items/identify), witnessed-facts tracking, dialogue trees (npc), quest log state (quests) are the data truth — panels NEVER compute game facts, only render engine queries.
OWNED FILES: app/components/panels/** (frame, inspect, inventory, dialogue, quest) (+ tests), game-route wiring lines, app/input/** ONLY for in-panel key navigation handlers (arrows/numbers/Enter/Esc routing when a panel owns focus).

THE WORK:
1. frame.tsx: one panel region, one mode visible (inspect | inventory | dialogue | quest), Esc closes top, mode switching via store flags.
2. inspect: x-mode cursor on the grid (moves with arrows when active), entity card: glyph/name-or-appearance/descriptor, known stats, 'unidentified: effect unknown' lines, accumulated witnessed facts for enemies — EXACTLY the engine's knowledge queries (UX §4: surprised by content, never by rules); hover parity (mouse over cell shows same card).
3. inventory: 16 slots + stacks + equipment slots; selection card; contextual flat actions (use/quaff/read/throw-with-direction-prompt/equip/unequip/drop) dispatching through the session holder; disabled-with-reason rendering.
4. dialogue: opens on talk events; NPC text + numbered replies (number keys + arrows); barter view (buy/sell lists, prices, coin, typed refusal reasons); exit-anywhere; world-paused indicator assertion (turn count unchanged while open — test).
5. quest: active objectives checklist + where/what hints + completed section; grid markers for on-floor objectives (a grid overlay prop — coordinate with the grid component's public props, don't fork it).
6. Tests: card truthfulness fixture sequence (unknown item shows exactly the unknown; witnessed facts appear only after witnessing); full keyboard walk of a fixture conversation incl. barter; quest marker positions; panel focus routing; every panel reachable/closable per UX §2.
DEFINITION OF DONE: pnpm run check green w/ exit (paste); the truthfulness + conversation walk test names. Report + actual vs 60m (double phase). NO commit. Then stop.
