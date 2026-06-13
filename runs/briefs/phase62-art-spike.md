# PHASE 62 — SPIKE: AI-sprite-as-code is viable (retire the #1 M4 risk)

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- Node 24, pnpm 10.28.x. Full gate is `pnpm run verify:ci` (typecheck+lint+all vitest configs).
- ONE codex process system-wide. The existing AmbientDirectorProvider
  (src/director/provider/ambient.ts) spawns `codex exec` via child_process —
  study it; the ArtDirector will mirror it. Do NOT run the live codex
  generation yourself if it nests codex in your sandbox; the orchestrator runs
  the live smoke host-side (this is a SPIKE — your deliverable is KNOWLEDGE +
  the harness, not a merged subsystem).

## BRANCH ASSIGNMENT (orchestrator authority)
Work on the `main` working tree. NO git commits, NO branches.

## OBJECTIVE (one sentence)
Prove that an AI (codex) can generate a usable game sprite AS CODE/DATA
(not raster), validated and rendered, and freeze the sprite-manifest contract
— or report that it can't and the raster-image-API upgrade is needed.

## SCOPE IN
- A sprite-manifest format: a compact, codex-friendly encoding. Recommend a
  16x16 (and 24x24) PIXEL MATRIX: `{ w, h, palette: ["#rrggbb",...], px: number[][] }`
  where px[y][x] is a palette index (0 = transparent). Justify dims in ART terms.
- A pure validator: parses + checks (dims match, palette legal hex, indices in
  range, not-all-transparent, a basic readability heuristic e.g. >=8% non-empty).
- A pure renderer: sprite-manifest -> an offscreen canvas / PNG buffer (node-canvas
  or a tiny hand-rolled RGBA buffer -> PNG) so we can SEE the output.
- ONE or TWO HAND-AUTHORED example sprites (e.g. a cave-slug + a stone floor tile)
  in this format, rendered to PNG files under runs/spikes/phase62/, proving the
  format -> render path works end to end and looks like the thing.
- The ArtDirector PROMPT that would ask codex to emit this JSON for a given
  (theme, entity, dims, palette-constraint) — written and saved, ready for the
  orchestrator to run live.
- A go/no-go recommendation with reasoning.

## SCOPE OUT
- NO PixiJS (that's phase 63). NO app/ integration. NO ArtDirector subsystem
  build (that's R0/65+). NO engine/schema/director changes. NO merged render code.
- Do not run the live codex art-gen (orchestrator does, host-side).

## OWNED FILES (spike sandbox only)
- runs/spikes/phase62/** (harness, examples, rendered PNGs, the prompt, the report)
You MAY create throwaway TS under runs/spikes/phase62/. Do NOT touch src/, app/, content/.

## CONTEXT PAYLOAD
- Mirror the ambient provider's shape: read src/director/provider/ambient.ts
  (it runs `codex exec --sandbox read-only -c approval_policy=never <prompt>`
  and parses stdout JSON) — the ArtDirector will do the same for sprites.
- The art bible (ART.md) doesn't exist yet (phase 64); propose the palette/dims
  here as spike findings to seed it.
- Schema entities the renderer must eventually cover: enemies, items, NPCs,
  terrain (floor/wall/door/stairs/water/trap), the Hoard. The spike only needs
  1-2 examples to prove the path.

## DONE = paste actual command output + the PNGs exist
- The validator + renderer have a quick node/vitest run proving they parse and
  render the hand-authored examples (paste exit 0).
- `ls runs/spikes/phase62/*.png` shows the rendered example sprites.
- A REPORT: the frozen sprite-manifest contract (format, dims, palette rules,
  readability bar), the saved ArtDirector prompt (paste it), and a clear
  GO (codex-art path) / NO-GO (need raster API) recommendation with reasoning.
  If GO, state exactly what the orchestrator should run to do the live smoke.

## TIMEBOX
≤ 1 day equivalent; this is a spike. If the pixel-matrix format proves clumsy,
try compact SVG and report which is better for codex to emit. STOP + report if
blocked > 20 min on any single unknown.
