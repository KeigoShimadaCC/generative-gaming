# M4 — Make It a Game: milestone report

**Goal:** turn the debug dot-grid into something that reads as a game in three
seconds — and make the AI Director's authorship visible, including the art.

**Verdict:** core MET. The dungeon reads as a dungeon, actions feel good, and the
same AI that authors floors now draws them per band. Evidence below. Residual
R5 polish (accessibility depth, perf profiling) is documented, non-blocking.

## What shipped (phases 62–90, waves R0–R5)

- **R0 foundations.** Two risk spikes returned GO: (62) the AI generates usable
  sprites AS CODE (pixel-matrix v1) — live codex drew a recognizable cave slug at
  $0; (63) PixiJS v8 renders GameState in Next 15 as a pure draw-list with an
  accessibility mirror. `ART.md` authored as the visual bible.
- **65 pipeline.** sprite-manifest validator/rasterizer, deterministic atlas,
  schema→sprite resolver, ArtDirector seam, + 17 curated "Old Stock" fallback
  sprites (player/Hoard/creatures look like real pixel art).
- **R1 dungeon (LIVE).** Auto-tiled walls/rooms, fog-of-war + player light,
  follow-camera, entity sprites, Hoard glow. Wired into GameShell (DOM grid kept
  as `?stage=dom` a11y fallback). `runs/spikes/r1-dungeon-after.png`.
- **R2 juice.** Movement tween, hit flash, screen shake, floating damage numbers,
  interaction effects, status auras — cosmetic; determinism + goldens stayed green.
- **ArtDirector.** The Director's art counterpart: per (theme,entity) it generates
  a sprite via ambient codex through an Art Gauntlet (schema→palette→renders→
  readability) into the atlas, fallback on reject. Live-proven: a themed
  fungal-caster (`runs/spikes/artdirector-caster.png`).
- **R3 minimap.** Explored-floor minimap with player/stairs/Hoard marks.
- **76 descend cinematic.** Surfaces the "AI is authoring this floor" beat.
- **R4 audio + AI themed art LIVE.** Keyless procedural Web Audio (SFX from state
  diffs + per-band ambient). Generated 19/21 themed sprites across 3 bands
  (2 correctly fell back — gauntlet working); they render in-game by band
  (`runs/spikes/r4-ai-themed-floor.png`). Same caster, 3 band looks
  (the 3-band montage).
- **R5 settings.** Motion/audio toggles + volume, accessible, persisted.

## Evidence
- Screenshots/GIF sent to human: r1-dungeon-after, artdirector-caster, the
  3-band caster comparison, r4-ai-themed-floor, m4-demo.gif (playthrough in motion).
- `verify:ci` green throughout, INCLUDING the determinism audit + golden suite
  every render/juice phase (the renderer is a pure function of state; simulation,
  replay, and hashes are unchanged — engine/gauntlet/director/schema untouched).
- A PixiJS async-init crash that ALL green gates missed was caught by the
  mandatory host-side visual smoke and fixed (851... — the lesson: for render
  work, a rendered frame is the gate, not the green check).

## Invariants held
- No engine/gameplay/balance/schema changes. The renderer is a pure function of
  state; determinism + replay green. Offline/$0: fully playable and good-looking
  with the curated fallback (`ART=fallback`); zero AI art required.

## Residual (R5 polish — backlog, non-blocking)
- Accessibility: canvas + DOM/aria mirror exists; deeper screen-reader parity and
  colorblind palettes are a focused follow-up (phase 89).
- Performance: profile large floors / many sprites for the fps bar (phase 88).
- A few settings read URL params; wiring their consumers to the persisted value
  is a 1-line-each follow-up.
- Generated art covers core entities for 3 band themes; broadening coverage +
  optional live per-floor generation (with caching) is the next art increment.

## Close (2026-06-14, commit 4850534a)

Two final-polish items, then M4 is closed:
- **Floor readability.** The one tuning note from review — floor tiles competed
  with the foreground — fixed render-side: `terrain.floor` recedes (alpha 0.6,
  tint 0x8f8f8f) so walls, entities, items, and the player pop. Pure render-layer,
  gated on the floor sprite id, stacks with fog; determinism + goldens unchanged.
- **Audio actually on.** The R4 procedural audio engine landed in f34032ac but was
  never mounted; `GameShell` now calls `useGameAudio()`, so SFX + per-band ambient
  play in-game (autoplay-gesture gated, mute/volume persisted).

`verify:ci` green (typecheck, lint, root vitest, all 18 package configs incl. the
stage suite + determinism audit + golden suite). A themed visual smoke confirmed
the floor recedes and the foreground reads cleanly. **M4 core: MET.** Residual
items above are backlog, non-blocking.
