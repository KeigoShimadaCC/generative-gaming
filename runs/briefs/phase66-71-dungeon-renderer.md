# PHASES 66–71 — The dungeon reads as a dungeon (PixiJS sprite renderer)

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- Gate: `pnpm run verify:ci` (typecheck+lint+ALL vitest). No browser in your sandbox;
  the orchestrator runs the visual smoke (real floor screenshot) host-side.
- FROZEN seams you build behind (do not redesign):
  - Render seam (phase 63): app/components/stage/seam.ts, draw-list.ts
    (`createStageDrawList(model) -> StageDrawList`), PixiStageCanvas.tsx (painter),
    a11y-mirror.tsx. STAGE_RENDER_SEAM_VERSION = "phase63-v1".
  - Art pipeline (phase 65): src/art/ — sprite-manifest v1 validator/rasterizer,
    atlas (keyed theme,entity,seed), resolver (cell/entity -> atlas key),
    content/art/fallback/index.json (17 curated sprites). USE THE RESOLVER —
    do not hand-map cells to sprites.
  - ART.md: §2 sprite contract, §5 tiles+auto-tiling, §6 camera, §7 fog/light, §12 render seam.

## BRANCH ASSIGNMENT (orchestrator authority)
Work on the `main` working tree. NO git commits, NO branches.

## OBJECTIVE
Replace the colored-rect grid with a real sprite dungeon: auto-tiled terrain,
entity sprites resolved from the atlas, a follow-camera with zoom, and
fog-of-war with a light radius — so the floor reads as a PLACE, not a lattice.

## SCOPE IN (the six R1 phases, one coherent renderer)
1. **(66) Tilemap + sprites.** Extend the draw-list/painter to draw SPRITES from
   the phase-65 atlas (via the resolver) for every cell + entity, replacing the
   debug rects. Terrain auto-tiling: 8-neighbor wall bitmask selects edge/corner
   presentation (the curated set has one wall sprite — apply edge shading/shadow
   via tint/overlay so walls read with depth; full per-edge wall sprites can come
   later, note it). Floors/doors/stairs/water/traps drawn from atlas.
2. **(67) Camera.** A pure viewport module: follow the player, lerped smooth
   scroll, zoom that frames the local area (NOT the whole floor), clamp to floor
   bounds. Apply as a transform on the Pixi stage container.
3. **(68) Fog + light.** Per ART.md §7: unseen=black, explored=dim+desaturated,
   visible=lit, plus a soft light radius around the player (band-tinted ok to stub
   to shallows). Drive from the existing visibility/fog fields in the view-model.
4. **(69) Entity sprites.** Player, enemies, items, NPCs drawn via resolver with
   facing where the state exposes it; layered above terrain, below fog-of-unseen.
5. **(70) Hoard + signature feature.** The Hoard uses its 24x24 sprite with a
   subtle glow/pulse; leave a clearly-marked hook for the per-floor signature
   invention (full treatment is phase 87).
6. **(71) Integration.** It all composes in the PixiStage; the DOM grid + a11y
   mirror remain as the accessible fallback (seam preserved). One band rendered.

## SCOPE OUT
- NO juice/animation/particles/shake/damage-numbers (that's R2). Static-but-correct
  sprite frames + camera + fog only. NO audio. NO HUD redesign (R3). NO AI art
  generation (the ArtDirector seam exists; you consume the fallback atlas). NO
  engine/schema/director/gauntlet changes. NO content/fallback (gameplay) changes.

## OWNED FILES
- app/components/stage/** (extend: draw-list, painter, + new camera.ts, fog.ts,
  tilemap.ts, sprite-layer.ts modules; keep a11y-mirror working)
- src/art/** ONLY if the resolver needs a tiny additive helper (no breaking changes;
  note any)
Forbidden: src/engine, src/schemas, src/director, src/gauntlet, content/fallback,
app/components/grid (the DOM fallback stays as-is).

## CONTEXT PAYLOAD
- The view-model is app/components/grid/model.ts (GridCellView etc.) — it exposes
  terrain kind, entities, visibility/fog, player position. The resolver
  (src/art/resolver.ts) maps these to atlas keys; read its mapping table (phase 65
  report) so you cover every discriminant.
- The atlas rasterizes sprite-manifest v1 to RGBA; load curated sprites from
  content/art/fallback/index.json. Build Pixi textures from the RGBA (nearest-
  neighbor scaling, no smoothing — keep pixels crisp).
- Determinism: render is a pure function of state; no Math.random/Date.now in the
  draw path; goldens/determinism suites must stay green.

## DONE = paste outputs with exit codes
- `pnpm run verify:ci` → exit 0 (incl. new stage tests: draw-list now emits sprite
  draws per resolver; camera math pure-tested; fog mapping pure-tested).
- A pure unit test proving: a fixture floor → draw-list contains the right atlas
  keys per cell (resolver wired), camera centers on the player + clamps, fog maps
  the three states. Paste it.
- REPORT: what each module does, how auto-tiling/shadow is applied, the camera
  interface, the fog mapping, and ANY view-model gap (escalate, don't guess).

## ESTIMATE / TIMEBOX
Large bounded phase (this is R1's core). 60 min estimate, 120 min timebox.
At the timebox, stop and report what's rendering vs not. STOP+report if the
view-model lacks a field you need (e.g. per-edge wall neighbors, facing).
