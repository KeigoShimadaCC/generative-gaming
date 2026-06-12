IMPLEMENT TASK — PHASE-30: floor manifest schema (contract: phase-plans/PHASE-30-MANIFEST-SCHEMA.md, AMENDED: the live-provider contract test is replaced by an AMBIENT-CLI contract test per the GO spike — read runs/spikes/29-ambient-director/findings.md incl. the orchestrator appendix, and TECH_SPEC §6's two-adapter amendment).

GATE SCOPE: alone — full pnpm run check (slow, expected). Do NOT commit.
STEP 0: src/schemas has all entity schemas; GAME_DESIGN §12 is the design contract (incl. text caps, signature flag); the run loop's FloorContentProvider shows what materialization ultimately needs; the spike's prompt.txt + 3 host-N-stdout.txt files show what ambient codex actually produces — design the envelope so those real outputs are CLOSE to valid (note what they'd fail on).

OWNED FILES: src/schemas/manifest.ts (+ fixtures + tests), and an @ambient-tagged test file (env-gated like @live: runs only when AMBIENT_LIVE=1).

THE WORK:
1. manifest.ts: the FloorManifest envelope composing existing entity schemas: depth, band, params (floorgen knobs incl. flavor), roster (enemy defs + placement hints), items (+hints), traps (+hints), npcs 0–2, quest (nullable), narration (intro + ≤3 beats), metadata {originTags summary, callbacks: string[], signature: boolean}, protocolVersion. Keep provider-compat style (required-nullable, no root unions) — the future API path needs it and it costs nothing.
2. Placement hints: room-index preference + near/far-from-entrance + spread — matching what floorgen/place.ts accepts (read it; align names).
3. Fixtures: one valid manifest per band (hand-written); a malformed set (≥6 distinct violations); PLUS: parse the three real spike outputs (runs/spikes/29-ambient-director/attempts/host-*-stdout.txt) in a test — assert each one's distance from validity (document each failure reason as a comment — these drive PHASE-32's prompt design). If any validates as-is, excellent — assert it.
4. Gate-0-ready: export parseManifest(raw: string) → {ok, manifest} | {ok:false, errors} handling fence-stripping/first-brace extraction (the ambient reality).
5. @ambient test (AMBIENT_LIVE=1 only): one real codex exec call from the test (host-side; skip with a clear message if codex unavailable) → parseManifest → report validity; do not fail the suite on model variance — assert parse, record validity.
DEFINITION OF DONE: pnpm run check green (paste); fixture + spike-output test results summarized. Report + AMBIGUITIES + actual vs 40m. NO commit. Then stop.
