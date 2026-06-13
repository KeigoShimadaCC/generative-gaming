# PHASES 72–75 — Juice & feel (movement, combat feedback, effects, status)

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- Gate: `pnpm run verify:ci`. No browser in your sandbox; orchestrator runs the
  host-side VISUAL SMOKE (a real floor screenshot mid-action) — your unit tests
  pass but only the smoke proves it renders; expect a round-trip if it throws.
- R1 is live and committed: app/components/stage is the PixiJS renderer
  (draw-list.ts, PixiStageCanvas.tsx painter, camera.ts, fog.ts, sprite-layer.ts).
  The renderer is currently a PURE FUNCTION of state (renders on state change).
- ART.md §8 = the juice budget (read it; honor timings + reduced-motion).

## BRANCH ASSIGNMENT (orchestrator authority)
Work on the `main` working tree. NO git commits, NO branches.

## OBJECTIVE
Add a ticker-driven COSMETIC animation layer so actions feel good — movement
tweening, hit flash, screen shake, floating damage numbers, pickup/effect
sparkles, status-effect auras — WITHOUT changing simulation, state, or
determinism. Animations are pure eye-candy interpolated between authoritative
states; goldens/determinism/replay MUST stay green.

## SCOPE IN (R2 core, four phases)
1. **(72) Movement.** Tween sprite position between the previous and current
   tile over ~80–120ms (ART.md §8); subtle idle bob. The grid stops snapping.
2. **(73) Combat feedback.** On an attack/hit in the new state vs prior:
   attack lunge, 1-frame white hit flash on the target, screen shake scaled to
   damage (capped), floating damage numbers that rise+fade, death dissolve.
   Derive events by DIFFING consecutive states (the renderer already gets both),
   or from the engine's event log if exposed — do not add engine events.
3. **(74) Interaction effects.** Pickup sparkle, equip flash, quaff/throw,
   door-open, stairs glow (the Hoard already pulses).
4. **(75) Status-effect visuals.** Burn/poison/slow/etc. as tints/auras/overlays
   driven by the engine status fields already in the view-model.

## CRITICAL INVARIANT
- The animation layer is COSMETIC and time-based for FEEL, but the simulation,
  state hashes, goldens, determinism audit, and replay outcomes are UNCHANGED.
  No Math.random/Date.now in any code path that feeds state or the draw-list
  STRUCTURE; animation timing may use the Pixi ticker/elapsed but must converge
  to the exact authoritative frame when settled. A replay must reach identical
  terminal state; cosmetic in-between motion is allowed.
- Add a reduced-motion switch (read it like ?stage= / a setting; stub the
  setting, default motion ON) that disables shake/heavy tween and snaps —
  full settings UI is phase 90.

## SCOPE OUT
- NO descend cinematic (phase 76, separate). NO audio (R4). NO HUD redesign (R3).
  NO AI art generation. NO engine/schema/director/gauntlet/content changes.

## OWNED FILES
- app/components/stage/** (add an animation/ticker module + effect layers;
  extend the painter). Keep camera/fog/sprite-layer working and the a11y mirror intact.
Forbidden: src/engine, src/schemas, src/director, src/gauntlet, content/**, app/components/grid.

## CONTEXT PAYLOAD
- The painter (PixiStageCanvas.tsx) currently redraws from createStageDrawList on
  state change. R2 introduces a ticker so it can interpolate between states. Keep
  the draw-list pure; the ANIMATION state (tween progress, active flashes/shakes/
  numbers) lives in the painter/ticker, derived from (prevState, nextState).
- State diffing: the painter receives the new model; keep the previous model to
  diff (moved entities, hp deltas, new/removed entities) → spawn the right effects.
- Determinism guard: the orchestrator's `pnpm exec vitest --config tests/
  determinism-audit/...` and golden suites run in verify:ci — they must pass.

## DONE = paste outputs with exit codes
- `pnpm run verify:ci` → exit 0 (incl. determinism + golden — prove cosmetic layer
  didn't touch simulation).
- Unit tests for the PURE parts: the state-diff → effect-events mapping (move/
  hit/damage/pickup/status) given (prev, next) fixtures. Paste them.
- REPORT: the animation architecture (ticker, where anim-state lives, how it
  converges), the diff→effects mapping, reduced-motion behavior, and confirmation
  that no engine/determinism code was touched.

## ESTIMATE / TIMEBOX
Large. 60 min estimate, 120 min timebox. STOP+report if the painter can't cleanly
diff states or if a ticker fights the pure-render seam (escalate the seam tweak).
