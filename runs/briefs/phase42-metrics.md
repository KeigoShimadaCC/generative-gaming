IMPLEMENT TASK — PHASE-42: novelty & responsiveness metrics (contract: phase-plans/PHASE-42-NOVELTY-RESPONSIVENESS.md — THE THESIS METRICS; read NORTH_STAR §5/§10-M2).

GATE SCOPE: pnpm run typecheck + pnpm exec eslint src/evals/metrics + pnpm exec vitest run src/evals/metrics. Do NOT commit.
STEP 0: inputs are manifests (FloorManifest) + trace fact objects (summarizer's raw facts) + the fallback pack (novelty baseline). Pure functions. Do NOT modify core.ts.
OWNED FILES: src/evals/metrics/novelty.ts, src/evals/metrics/responsiveness.ts (+ tests), src/evals/runner/report.ts (wiring the two metrics in — append-only edit).

THE WORK:
1. novelty.ts: distance(manifest, {fallbackPack, recentManifests}) — name-similarity (normalized edit distance vs corpus), stat-vector distance, composition overlap (verb/behavior multiset jaccard); nearDuplicate flag at config threshold; score 0–1 + components.
2. responsiveness.ts: named DETECTORS per persona signature (hoarder → inventory-pressure content; pacifist → avoidance acknowledged structurally or in narration keywords; speedrunner → pace content; completionist → NPC/quest presence; chaos → per-seed variance tolerance). hitRate(manifest, traceFacts) + CROSS-PERSONA CONTROL matrix (A's content scores lower on B's detectors).
3. Wire both into the runner report (per-cell + aggregate).
4. Tests: engineered near-dup flagged / fresh passes; responsive fixtures high same-persona, low cross-persona; component math hand-checked.
Propose your detector set for review in the report — flag uncertain ones.
DEFINITION OF DONE: scoped gates green (paste). Report + actual vs 40m. NO commit. Then stop.
