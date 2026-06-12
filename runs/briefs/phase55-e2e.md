IMPLEMENT TASK — PHASE-55: the single Playwright e2e happy path (contract: phase-plans/PHASE-55-E2E.md). EXACTLY ONE journey, flake-resistant.

GATE SCOPE: alone — full pnpm run check + the e2e run. Playwright runs on the HOST fine (you are codex with workspace-write + network; browsers may need npx playwright install --with-deps chromium — the npm cache EPERM is documented, use pnpm dlx if npx fails). Do NOT commit.
OWNED FILES: e2e/** , playwright.config.ts, package.json 'e2e' script line, .github/workflows/ci.yml (append the e2e job — pinned versions).
THE JOURNEY (mock director, deterministic seed): boot dev server → title → new run → floor 1 renders (grid+HUD+log visible) → 10 scripted moves incl. one pickup + one inventory open/close → descend → transition → floor 2 renders → open quest log → Tab → diary layer shows → Tab back → abort run → death/summary screen → run index shows the run.
RULES: marker-based waits ONLY (data-testid on game-state markers — add minimal testids where absent, append-only UI edits allowed for that purpose); ZERO sleeps; 5 consecutive green local runs required (paste the 5 results); CI job headless.
DEFINITION OF DONE: pnpm run check green w/ exit; pnpm run e2e ×5 green (paste); ci.yml diff shown. Report + actual vs 25m. NO commit. Then stop.
