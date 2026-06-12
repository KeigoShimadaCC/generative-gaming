FIX BUNDLE — "CI truth": the plan audit found HEAD CI red + coverage gaps (runs/analysis/plan-audit/report.md GAPS 2–9 — read it first). Make CI honestly green over the FULL estate.

OWNED: vitest configs (root + the per-suite ones), the slow tests' timeout declarations ONLY (no logic changes), .github/workflows/ci.yml, app/components/diary/DiaryPanel.test.ts (or the ArtifactViewer empty-state string — pick the correct expectation per UX), runs/milestones/m1+m3 report evidence lines, docs/evidence/e2e-host-runs.md (new).

THE WORK:
1. SLOW-TEST TIMEOUTS (gaps 2,3,5): give the named slow tests explicit generous timeouts (floorgen sweep, bots 3x10 batch, persona bank gen/determinism — 120s-600s as their local runtimes x4 suggest); do NOT weaken assertions or shrink the sweeps.
2. CI COVERAGE (gaps 4,8 + backlog): wire ALL suites into ci.yml as explicit steps: root vitest + tests/integration config + tests/golden config + the app component configs (enumerate them: rg -l 'vitest.config' app/) + determinism audit config. Cheapest first.
3. DIARY ASSERTION (gap 6): reconcile DiaryPanel.test.ts:41 vs ArtifactViewer.tsx:196 empty-state strings — the null-model-no-runId state should say 'No generation artifacts recorded for this run.' per the diary's intent; fix whichever side is wrong (read both components' UX intent).
4. E2E EVIDENCE (gap 7): docs/evidence/e2e-host-runs.md recording the 5/5 host-side runs of 2026-06-12 (exit codes, the journey, why host-side — cite ENVIRONMENT Mach-port fact); ci.yml e2e job stays (it installs its own chromium on ubuntu — verify the workflow does; fix if not).
5. Update runs/milestones/m1/report.md (CI wiring line) + m3/report-draft.md (evidence slots that can now be filled locally).
DONE: pnpm run check green w/ exit code + EVERY suite config run locally green (paste each: integration, golden, determinism, each app config, e2e SKIPPED-note for sandbox) — the orchestrator pushes and confirms the live CI run after. Report + actual vs 45m. NO commit. Then stop.
BRANCH ASSIGNMENT (orchestrator authority): main working tree; no commits.
