# M4 — Make It a Game (Visual & UX Overhaul)

**Milestone goal:** a first-time player looking at the screen for three seconds
says *"that's a game"* — not *"that's a debug grid."* The dungeon reads as a
place, the creatures have character, actions feel good, and the AI Director's
authorship is **visible** — including the art itself.

**Chosen direction (human, 2026-06-13):**
- **Art:** AI-generated sprites — the same AI that authors floors authors their look.
- **Renderer:** Canvas/WebGL via **PixiJS** — full game render layer.

**Phases:** 62–91 (~30), in six waves (R0–R5). Milestone **M4**.

---

## Load-bearing architecture (read first)

### 1. This is a RENDERING milestone. The engine is untouched.
Every phase here lives in `app/` (the Next.js client) + `assets/` + a new
`src/artdirector/` generation subsystem. **None of it touches**
`src/engine`, `src/gauntlet` (gameplay gates), `src/director` (content),
`src/schemas` (content vocab), or `content/` (fallback pack). The engine
remains the deterministic source of truth; **the renderer is a pure function
of `GameState`.** Deterministic replay and goldens MUST still pass unchanged
(a render layer cannot change simulation). This isolation is the reason a
30-phase visual overhaul is safe.

### 2. AI sprites mirror the existing Director→gauntlet→fallback pattern.
The project's thesis — *AI proposes, validators gate, deterministic code
applies, fallback if anything fails* — extends to art:

```
ArtDirector prompt (theme + entity vocab)
      |  (ambient codex, $0 — generates sprites AS CODE/DATA, not raster)
      v
Sprite manifest: pixel-matrix | SVG | draw-ops, + palette + dims
      |
      v
Art Gauntlet: schema (dims/format) -> palette legality -> renders-without-throw
      |                                                  -> readability heuristic
      +--> accepted -> sprite atlas cache (keyed by theme+entity+seed)
      |
      +--> reject/timeout -> curated "Old Stock" sprite set (handcrafted)
      v
PixiJS render layer (consumes atlas; AI sprite or fallback, invisibly)
```

**Keyless $0 primary path:** codex writes sprite data as code (a 16×16 pixel
matrix of palette indices, or compact SVG, or PixiJS Graphics draw-ops).
Cached per (theme, entity, seed) so a floor's art is generated once and is
deterministic on replay. A **raster image-gen API** (DALL·E/SD) is a
documented OPTIONAL upgrade that needs a human-provided key — NOT on the
critical path.

### 3. Invariants (never violated by this milestone)
- Renderer is a pure function of `GameState` + sprite atlas; no simulation in `app/`.
- Determinism: same seed → same frames given the same (cached) atlas. Replay renders identically.
- Accessibility floor: keyboard play and a screen-reader state bridge survive the move to canvas (R5).
- Offline/$0: the curated fallback sprite set makes the game fully playable and good-looking with zero AI art generated.
- The gameplay gauntlet (Gates 0–3) is unrelated and unchanged; the **Art Gauntlet is a separate, additive validator.**

### Pre-registered acceptance ("good" looks like)
- **Demo-visible:** a 10-second clip where a player descends, a torch-lit
  AI-themed room scrolls into view, a creature with a real sprite approaches,
  the player attacks (hit flash + shake + damage number), and a floor-descend
  cinematic names the floor the AI just wrote. No dots. No debug grid.
- Runs ≥45fps on the demo machine at the target floor size.
- Determinism + golden + integration suites still green (`verify:ci`).
- Fully playable & good-looking with `ART=fallback` (zero AI art).

---

## Wave R0 — Foundations & risk retirement (Phases 62–65)

**62 — SPIKE: AI-sprite-as-code is viable.** *(retire the #1 risk first)*
Prove codex can generate a usable sprite (e.g. a 16×16 cave-slug + a
floor/wall tile) as validated data, rendered in PixiJS. Output is KNOWLEDGE:
a frozen sprite-manifest contract (format, dims, palette encoding) + a
go/no-go on the codex-art path vs needing the image-API upgrade. ≤1 day, no
merged render code beyond a throwaway harness.

**63 — SPIKE: PixiJS in Next.js + accessibility bridge.** Prove a PixiJS
canvas mounts in the Next app, renders the real `GameState` grid, stays a
pure function of state, and can expose an off-screen DOM/aria mirror for
keyboard + screen reader. Freeze the render-layer seam (how `app` hands state
to the renderer).

**64 — ART/UX BIBLE (doc spine).** New `ART.md`: palette system, tile/sprite
dimensions, the per-band visual identity (shallows/middle/lowest themes),
camera rules, animation principles, juice budget, audio direction, the
sprite-manifest contract (from 62), and the readability bar. This is the
frozen design contract every later phase builds to.

**65 — Asset & atlas pipeline + schema→sprite mapping.** The deterministic
machinery: load/cache sprite atlases, the entity/terrain → sprite resolver
(maps schema enemies/items/terrain/NPCs to sprites, AI or fallback), and the
seeded cache key. Plus the **curated Old Stock sprite set** stub so fallback
works from day one.

## Wave R1 — The dungeon reads as a dungeon (Phases 66–71)

**66 — Tilemap renderer.** Floor/wall/door/stairs/water/trap as real tiles
with **auto-tiling** (bitmask wall connections) + drop-shadows/edges so rooms
read as rooms and corridors as corridors.
**67 — Camera.** Follow the player, smooth scroll, sane zoom (room-fit or
fixed), edge clamping. Kills the "whole floor tiny" problem.
**68 — Fog of war + light.** Unseen / explored-dim / visible, with a light
radius around the player and a soft gradient. Atmosphere from nothing.
**69 — Entity sprites.** Player, enemy archetypes, items, NPCs — resolved via
65, AI sprite or fallback, with facing.
**70 — Hoard & signature features.** The win-condition Hoard and the AI's
"signature invention" per floor get distinct, special rendering.
**71 — R1 integration + visual smoke.** One screenshot per band proving a
real dungeon; determinism/golden still green.

## Wave R2 — Juice & feel (Phases 72–77)

**72 — Movement.** Position tweening, facing, idle bob; the grid stops snapping.
**73 — Combat feedback.** Attack animation, hit flash, **screen shake**,
**floating damage numbers**, death dissolve.
**74 — Item/interaction effects.** Pickup sparkle, equip flash, quaff/throw,
door-open, stairs glow.
**75 — Status-effect visuals.** Burn/poison/slow/etc. as auras/overlays/tints
driven by engine status state.
**76 — The descend cinematic.** Surface the headline beat: descending shows
the AI *authoring the next floor* (the diary/theme reveal), then the room
arrives. This is where "AI made this" becomes felt, not explained.
**77 — R2 juice pass + perf check.** Tune timings; confirm ≥45fps.

## Wave R3 — HUD / UX redesign (Phases 78–82)

**78 — Vitals HUD.** Game-styled HP/fullness/status bars (icons, pulse on
change), level/depth, replacing the debug readouts.
**79 — Inventory & hotbar.** Item **icons** (the AI sprites), equipped gear,
keyboard-driven hotbar; restyle the 16-slot inventory.
**80 — Minimap.** Explored-floor minimap with player/stairs/Hoard markers.
**81 — Context panels restyle.** Inspect / quest / diary / artifact-viewer
(the Tab layer) restyled as game UI, not debug panels — keep the truthfulness
guarantees.
**82 — Title, menus, end screens.** Real title screen (animated bg), settings,
and game-styled death/victory/run-summary screens.

## Wave R4 — Atmosphere (Phases 83–87)

**83 — Audio foundation.** SFX bus + per-action sounds (move/attack/hit/
pickup/descend), mixer, settings. Curated SFX set (keyless).
**84 — Music per band.** Ambient tracks per band with crossfade on descend.
**85 — Per-band visual theming.** Palette/tileset/lighting/particle identity
per band so the AI's floor themes are finally *visible* — the named theme
drives the look.
**86 — Ambient particles & weather.** Dust motes, drips, embers, depth haze —
cheap atmosphere via the particle system.
**87 — Signature-invention treatment.** The AI's per-floor "wow" gets a
bespoke visual/audio sting so the generative magic lands.

## Wave R5 — Polish, accessibility, integration (Phases 88–91)

**88 — Performance pass.** Atlas batching, culling, large-floor profiling; hit
the fps bar on the demo machine.
**89 — Accessibility layer.** Canvas + DOM/aria mirror; keyboard parity; reduced-
motion + colorblind-safe palettes; screen-reader state bridge verified.
**90 — Settings & options.** Graphics (quality/motion), audio, accessibility,
AI-art on/off (`ART=fallback`) — all persisted.
**91 — M4 integration, demo capture, replay-renders-clean.** Full `verify:ci`
green; deterministic replay renders identically; record the demo clip; M4
acceptance against the pre-registered bar; human sign-off.

---

## Critical path & sequencing
- **62 and 63 are gates:** if 62 says codex-art isn't viable, the plan pivots
  to curated-set-primary + optional image-API (the renderer work R1–R5 is
  unchanged; only the art *source* changes). Retire both before R1.
- **64 (ART.md) freezes the design contract** before any sprite/tile phase.
- **65 (pipeline + fallback set)** unblocks every render phase and guarantees
  offline beauty from the start.
- R1→R2→R3 can overlap once 65 lands (Cursor fan-out on disjoint files:
  tilemap / camera / HUD / audio are largely independent). R4 theming depends
  on R1 tiles. R5 closes.
- Parallelism: renderer subsystems are file-disjoint enough for the usual
  Codex-depth + Cursor-breadth pairing; the ArtDirector/Art-Gauntlet is the
  one Codex-heavy spine (mirror the original Director build discipline,
  including a live provider contract test as subtask 1).

## What this does NOT do
- No engine/gameplay/balance changes (M0–M3 work stands).
- No new gameplay systems (bosses, NPC convo) — those remain post-MVP backlog.
- The prefer-generated all-AI-floors browser-WIN residual (floor-12 poll-loop)
  is a separate gameplay-harness item, not part of M4.
