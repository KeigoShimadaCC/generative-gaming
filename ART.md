# ART.md — Everdeep Visual & Audio Bible (M4)

The design contract for the visual/UX overhaul (milestone M4). Every sprite,
tile, camera move, particle, and sound builds to this. Frozen sections are
contracts — change them only with a human taste call.

Companion to the doc spine (NORTH_STAR / TECH_SPEC / UX / WORLD / GAME_DESIGN).
Where UX.md is *interface intent*, ART.md is *visual execution*.

Proven by the R0 spikes (phases 62–63): the AI generates sprites **as code**
($0 ambient codex), validated and rendered; PixiJS renders game state in Next
with an accessibility mirror. Both GO. Live smoke produced a recognizable
AI-authored cave slug (`runs/spikes/phase62/ai-live-slug.png`).

---

## 0. North star (visual)
Three-second test: a stranger glances at the screen and says *"that's a game,"*
not *"that's a debug grid."* The dungeon is a **place**; creatures have
**character**; actions **feel**; and the AI Director's authorship is **visible**
— including the art, which the same AI draws.

## 1. The two AIs, one thesis
The Director writes *what's on the floor* (content manifest). The **ArtDirector**
draws *what it looks like* (sprite manifests). Same pattern, same gates:
*AI proposes → validators gate → deterministic code applies → fallback if fail.*
Keyless, $0, deterministic, cached. A raster image-gen API is an OPTIONAL future
upgrade requiring a human key — never on the critical path.

## 2. Sprite-Manifest Contract — FROZEN (`everdeep.sprite-manifest.v1`)
```json
{ "w": 16, "h": 16, "palette": ["#rrggbb"], "px": [[0]] }
```
- `w === h`, and is `16` (default: terrain, items, enemies, NPCs, player) or
  `24` (reserved: Hoard, signature inventions, bosses — 2.25× tokens, not default).
- `palette`: 1–15 lowercase `#rrggbb`. Index `0` = transparent (not in palette);
  index `n>0` → `palette[n-1]`.
- `px`: row-major `number[][]`, exactly `h` rows × `w` ints; each in `0..palette.length`.
- **Readability bar:** ≥8% non-transparent; non-transparent spans ≥3 rows & ≥3 cols;
  ≥2 visible colors; silhouette readable before color detail.
- **Palette budget:** 3–6 colors normal, up to 8 signature, hard max 15.
- Validator/renderer reference: `runs/spikes/phase62/sprite-manifest.js` (dependency-free
  RGBA→PNG). Production validator lives in the Art Gauntlet (phase 65+).

## 3. Sprite style rules
- Chunky pixel art. Dark outline + one brighter highlight. Single-pixel details
  support the silhouette, never carry the read.
- Transparent background around entities; terrain tiles fill the cell edge-to-edge.
- Recognizable from silhouette first. No text, gradients, or anti-aliasing in the matrix.

## 4. Per-band visual identity — the AI's themes made VISIBLE
The Director already names a theme per floor; the renderer must *show* it. Each
band gets a seed palette + mood; the floor's specific theme tints within it.

| Band | Mood | Seed palette direction |
|---|---|---|
| **Shallows** (1–4) | torch-lit limestone, damp moss, inviting | dark cave outline, cool stone mids, moss-green accent, warm torch highlight |
| **Middle** (5–9) | deeper, colder, fungal/ferrous, tense | slate/iron greys, sickly fungal teal/violet accents, dim amber light |
| **Lowest** (10–12) | oppressive, hot/ashen or void-cold, dangerous | near-black, ember-orange or void-cyan accents, high-contrast danger reds |

Per-band identity drives: tile set tint, lighting color/temperature, ambient
particles, music. Phase 85 wires this end-to-end.

## 5. Tiles & the dungeon (R1)
- Terrain sprites: floor, wall, door, stairs-down, water, trap (hidden/revealed),
  plus band variants. **Auto-tiling**: 8-bit bitmask on wall neighbors picks the
  edge/corner sprite so rooms read as rooms, corridors as corridors. Drop-shadow
  under walls for depth.
- The Hoard and the per-floor **signature invention** get bespoke 24×24 sprites
  and special treatment (phase 70/87).

## 6. Camera (R1)
Follow the player; smooth (lerped) scroll; zoom that frames the local room/light
radius (not the whole floor). Clamp at floor edges. Never show the tiny-lattice
whole-floor view again.

## 7. Lighting & fog (R1)
Three states per tile: **unseen** (black), **explored** (dimmed, desaturated),
**visible** (lit). Soft light radius around the player tinted by band. Fog does
real atmospheric work, not just hiding.

## 8. Juice & animation (R2) — budget
Motion serves readability and feel, never obscures state.
- Movement: position tween ~80–120ms, facing flip, subtle idle bob.
- Combat: attack lunge, **hit flash** (white 1 frame), **screen shake** (scaled to
  damage, capped), **floating damage numbers**, death dissolve.
- Interactions: pickup sparkle, equip flash, quaff/throw arcs, door open, stairs glow.
- Status effects: burn/poison/slow/etc. as auras/tints driven by engine status state.
- **Reduced-motion mode** (phase 89) disables shake/heavy tween, keeps state legible.

## 9. The descend cinematic (R2, phase 76)
The headline moment. On descend: briefly surface the AI *authoring the next floor*
(theme/diary reveal beat), then the new room arrives via camera. This is where
"the AI made this" is *felt*, not explained.

## 10. HUD/UX (R3)
Game-styled vitals (HP/fullness/status with icons + pulse), icon inventory/hotbar
(item sprites as icons), minimap (explored + player/stairs/Hoard markers), restyled
inspect/quest/diary/artifact panels (keep their truthfulness guarantees), real
title screen, game-styled death/victory/summary. Pixel-UI chrome consistent with
the sprite style.

## 11. Audio (R4)
SFX bus + per-action sounds (move/attack/hit/pickup/descend/win/lose); ambient
music per band with crossfade on descend; signature-invention sting (phase 87).
Curated, keyless asset set. Full mixer + settings (phase 90). Audio is off by
default until first user gesture (browser autoplay policy).

## 12. Render architecture & seam — FROZEN (from phase 63)
- PixiJS v8 canvas, client-only (`dynamic(..., {ssr:false})`, async `app.init()`).
- **Renderer is a pure function of state:** `state → draw-list → painter`. No
  simulation, no `Math.random`/`Date.now` in render. Determinism + goldens stay green.
- Accessibility: canvas is `aria-hidden`; semantics live in the DOM/aria mirror
  (`StageA11yMirror`). Keyboard play and screen-reader parity survive (phase 89).
- Sprites/camera/tilemap/particles plug in **behind the draw-list painter**, not
  at the app seam — R1+ never re-touch app wiring.

## 13. ArtDirector → Art Gauntlet → fallback (built R0/65+)
```
ArtDirector prompt (theme+entity+dims+palette)  ->  ambient codex ($0)
  -> sprite manifest (v1)  -> Art Gauntlet: schema -> palette legality
        -> renders-without-throw -> readability heuristic
  -> accepted: atlas cache, keyed (theme, entity, seed) [deterministic on replay]
  -> reject/timeout: curated Old Stock sprite set (handcrafted)
```
Generation is cached per (theme, entity, seed) so a floor's art is authored once
and identical on replay. `ART=fallback` forces the curated set (offline, $0, must
look good). Mirror the ambient provider's spawn + JSON-extraction discipline; a
live provider contract test is subtask 1 of the ArtDirector build.

## 14. Accessibility & performance bars
- Keyboard parity, screen-reader state bridge, reduced-motion, colorblind-safe
  palettes (phase 89).
- ≥45fps at the target floor size on the demo machine (phase 88).

## 15. What ART.md does NOT govern
Engine/gameplay/balance (M0–M3, frozen), content schema/vocab (Director's domain),
the gameplay gauntlet (Gates 0–3). The Art Gauntlet is separate and additive.
