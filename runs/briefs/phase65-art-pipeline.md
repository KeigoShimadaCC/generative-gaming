# PHASE 65 — Asset/atlas pipeline + schema→sprite resolver + curated fallback set

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- Gate: `pnpm run verify:ci` (typecheck+lint+ALL vitest configs incl. app/* and src/*).
- ONE codex at a time. No browser in your sandbox.
- Frozen contracts to build to: ART.md §2 (sprite-manifest v1), ART.md §12 (render
  seam), ART.md §13 (ArtDirector→gauntlet→fallback). Reference impl:
  runs/spikes/phase62/sprite-manifest.js (validator+renderer).

## BRANCH ASSIGNMENT (orchestrator authority)
Work on the `main` working tree. NO git commits, NO branches.

## OBJECTIVE
Stand up the DETERMINISTIC art pipeline so the renderer can draw real sprites:
production sprite-manifest validate+rasterize, a sprite ATLAS cache, a
schema→sprite RESOLVER, a seeded cache key, and a hand-authored CURATED
FALLBACK sprite set covering core terrain+entities — so the game looks good
OFFLINE ($0, ART=fallback) from day one. NO AI generation yet (that's a later
phase that feeds the same atlas).

## SCOPE IN
1. Port the sprite-manifest v1 validator + rasterizer from the spike into
   production `src/art/` (or `app/render/` if it must be client — decide and
   justify; the validator is pure TS and belongs in src/). Pure, typed, tested.
2. Sprite ATLAS: an in-memory keyed store of decoded sprites (manifest →
   texture-ready pixel data). Key = `(themeId|'fallback', entityId, seed)` per
   ART.md §13. Deterministic.
3. schema→sprite RESOLVER: given a GameState cell/entity (terrain kind, enemy
   archetype, item kind, NPC, player, Hoard, trap state), return the atlas key
   to draw. Reads the existing schema/engine view-model types — do NOT change them.
4. CURATED FALLBACK SPRITE SET (the "Old Stock" of art): hand-author v1 sprite
   manifests (you may reuse/extend the spike's cave-slug + stone-floor) covering
   AT LEAST: floor, wall, door, stairs-down, water, trap-hidden, trap-revealed,
   player, 3 enemy archetypes, 3 item kinds, 1 NPC, the Hoard (24x24). Store as
   data under `content/art/fallback/` (JSON) — this is ART's Old Stock, parallel
   to content/fallback. They must pass the validator + readability bar.
5. The ArtDirector SEAM (interface only, NO generation): the typed boundary a
   future AI-sprite phase implements to add generated sprites to the atlas
   (so it plugs in without re-touching the resolver). Document it.

## SCOPE OUT
- NO codex/AI generation, NO Art Gauntlet generation logic (seam only).
- NO PixiJS drawing/camera/tilemap (R1 consumes this). NO engine/schema/director changes.
- Do not touch app/components/grid (DOM fallback stays) or app/components/stage
  (the spike's PixiStage — R1 wires the atlas into it).

## OWNED FILES
- src/art/** (NEW: validator, rasterizer, atlas, resolver, types, tests)
- content/art/fallback/** (NEW: curated sprite JSON + an index)
- a vitest config for src/art if not covered by root (root vitest includes src/**/*.test.ts — prefer that)
Forbidden: src/engine, src/schemas, src/director, src/gauntlet (read-only for types),
content/fallback (gameplay pack), app/**.

## CONTEXT PAYLOAD
- Sprite v1 contract: ART.md §2 (paste-faithful). Reference validator: runs/spikes/phase62/sprite-manifest.js.
- The resolver must map from whatever the render view-model exposes — read
  app/components/grid/model.ts and the engine state types it derives from to see
  the available terrain/entity discriminants. Map every one to a fallback sprite.
- Determinism: atlas + resolver pure; seeded key; no Date.now/Math.random.

## DONE = paste outputs with exit codes
- `pnpm run verify:ci` → exit 0 (incl. your new src/art tests).
- A node script or test that loads the curated fallback set, validates ALL of
  them against the v1 bar, and rasterizes them — paste pass output + counts.
- REPORT: the resolver's full mapping table (every terrain/entity discriminant →
  fallback sprite), the atlas key scheme, the ArtDirector seam interface, and
  where art lives. Confirm every render view-model discriminant has a sprite.

## ESTIMATE / TIMEBOX
Medium-large. 30 min estimate, 60 min timebox. STOP+report if the render
view-model doesn't expose enough to resolve a sprite for some cell type (that's
a seam gap to escalate, not to guess).
