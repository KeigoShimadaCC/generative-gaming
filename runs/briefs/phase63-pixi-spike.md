# PHASE 63 — SPIKE: PixiJS in Next.js + accessibility bridge (retire the render-arch risk)

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- Next.js 15 app under app/. Gate: `pnpm run verify:ci`. You CANNOT run a
  browser in your sandbox — verification is typecheck/lint/build + a unit test
  + the orchestrator runs the visual smoke host-side.
- This is a SPIKE: deliverable is a proven seam + knowledge, minimal merged code.

## BRANCH ASSIGNMENT (orchestrator authority)
Work on the `main` working tree. NO git commits, NO branches.

## OBJECTIVE
Prove PixiJS mounts in the Next app, renders the real GameState grid as a
canvas, stays a PURE FUNCTION of state, and can expose an off-screen DOM/aria
mirror for keyboard + screen-reader parity. Freeze the render-layer seam.

## SCOPE IN
- Add pixi.js as a dependency (latest stable v8). Confirm it builds with Next 15
  (client-only component, dynamic import / 'use client', no SSR of canvas).
- A minimal `<PixiStage>` client component that: mounts a Pixi Application on a
  canvas, takes a GameState (or the existing grid view-model from
  app/components/grid/model.ts) as a prop, and draws colored rects for cells +
  entities (NO sprites yet — just prove state->canvas rendering works and
  re-renders on state change, deterministically).
- An off-screen accessibility mirror: a visually-hidden DOM region (role=grid +
  aria like the current GameGrid) kept in sync with the same state, so keyboard
  handling and screen readers still work when the canvas is the visual layer.
  (Prove the PATTERN; full a11y is phase 89.)
- A documented RENDER SEAM: the exact interface app/ uses to hand state to the
  renderer (so R1+ build tilemap/camera/sprites behind it without touching app
  wiring again). Keep it swappable (canvas renderer vs the existing DOM grid).

## SCOPE OUT
- NO tilesets/sprites (R1). NO camera/lighting/particles (R1/R2). NO AI art
  (phase 62). NO engine/schema changes. Do not replace the existing DOM
  GameGrid yet — add the Pixi stage alongside, behind a flag/seam.

## OWNED FILES
- package.json (add pixi.js), pnpm-lock.yaml (regenerate)
- app/components/stage/** (NEW: PixiStage + its a11y mirror + a vitest)
- a short findings note at runs/spikes/phase63/report.md
Do NOT touch app/components/grid/** (that stays as the fallback/seam reference),
src/, content/.

## CONTEXT PAYLOAD
- The current renderer is app/components/grid/GameGrid.tsx (DOM/CSS grid, cells
  are divs with glyph+color; view-model in app/components/grid/model.ts). Reuse
  that view-model as the Pixi stage's input so the seam matches existing data.
- Next 15 client component rules: 'use client', guard window, dynamic import
  with ssr:false for the canvas. PixiJS v8 init is async (await app.init()).
- Determinism: the renderer must be a pure function of state; no internal
  simulation, no Math.random/Date.now in render. The orchestrator's golden/
  determinism suites must stay green.

## DONE = paste outputs with exit codes
- `pnpm run typecheck` -> 0, `pnpm run lint` -> 0.
- `pnpm exec vitest run --config app/components/stage/vitest.config.ts` -> 0
  (a test that the stage component constructs/renders the view-model headlessly
  — mock Pixi or test the pure view-model->draw-list mapping, not WebGL).
- `pnpm exec next build` (or the repo build script) does not error on the new
  client component — paste the tail.
- REPORT: the frozen render-seam interface (the prop/ts type app passes), the
  a11y-mirror pattern, and any Next/Pixi gotchas for R1+.

## TIMEBOX
≤ 1 day equivalent. STOP + report if Pixi v8 + Next 15 SSR fights you > 30 min
(fallback: note it and propose the dynamic-import workaround precisely).
