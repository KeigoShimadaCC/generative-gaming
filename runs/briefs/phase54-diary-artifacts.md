IMPLEMENT TASK — PHASE-54A+54B combined: dungeon diary + artifact viewer (contracts: phase-plans/PHASE-54A-DIARY.md + PHASE-54B-ARTIFACT-VIEWER.md; read UX §7 the Tab layer + §8 death screen; WORLD §7 the diary is the Deep's manuscript).

GATE SCOPE: alone — full pnpm run check (clean .next; redirect-don't-pipe; app tests via their explicit config too). Do NOT commit.
STEP 0: 44's learned-summary + run summary (21) + narration beats fired + trace events are the diary's SOURCES (composition, never generation); 37's artifacts reader is 54B's whole data layer.
OWNED FILES: src/harness/diary.ts (the deterministic composer), app/components/diary/**, app/components/artifacts/** (+ tests), Tab-layer wiring lines (input table addition for Tab if absent).

THE WORK (54A):
1. diary.ts: composeDiary(runArtifacts) → per-floor recap entries (notable events: kills/close-calls/discoveries/quests + fired narration beats + callbacks), summary strip data, learned-note (44's builder); PURE function of artifacts — same run, same diary (test); FAITHFUL — every claim traceable to a trace/artifact source (the test cross-checks each entry against its source events).
2. diary UI: Tab flips to the layer (game paused), in-run partial view; death/victory final view led by the summary strip; Deep-voice styling (second person, the WORLD §6 register — static styling, text comes from composer); return-exact-position on Tab.
THE WORK (54B):
3. artifacts UI: per-floor generation tree (attempt chain: manifest → gate reports → repair → outcome), readable gate summaries + pretty JSON, search across the run's artifacts, copy button, usage/latency line, fallback highlighted; STRICTLY read-only (reader API only — audit your own imports).
4. Tests: composer purity + faithfulness; fixture-run diary content; viewer completeness (every artifact 37 wrote reachable — fixture run); zero write paths (grep).
DEFINITION OF DONE: pnpm run check green w/ exit + app suites (paste). Report + actual vs 60m. NO commit. Then stop.
