# Phase 62 Art Spike Report

## Verdict

GO for the codex-art-as-code path, with the pixel-matrix manifest as the Phase 64 seed contract.

The path is viable because the format is compact enough for `codex exec` to emit as strict JSON, easy to validate deterministically, renderable to PNG without native dependencies, and visually inspectable. The spike does not prove live provider quality because the brief explicitly forbids nested live codex; the orchestrator should run the host-side smoke below.

## Frozen Sprite-Manifest Contract

Version: `everdeep.sprite-manifest.v1`

Strict JSON shape:

```json
{
  "w": 16,
  "h": 16,
  "palette": ["#rrggbb"],
  "px": [[0]]
}
```

Rules:
- `w` and `h` are square and must be either `16` or `24`.
- `16x16` is the default for terrain, items, normal enemies, NPCs, and the player because it preserves tile readability, keeps JSON short for codex, and matches roguelike glance-read needs.
- `24x24` is reserved for the Hoard, signature inventions, bosses, or unusually large feature sprites; it costs 2.25x the matrix tokens, so it should not be the default.
- `palette` has 1-15 visible colors. Index `0` is transparent and is not included in the palette.
- Palette colors are lowercase `#rrggbb` strings only.
- `px` is a row-major `number[][]` with exactly `h` rows and exactly `w` integers per row.
- Each `px[y][x]` is an integer from `0` through `palette.length`; nonzero index `n` maps to `palette[n - 1]`.
- Readability bar: not all transparent; at least 8% non-transparent pixels; non-transparent pixels occupy at least 3 rows and 3 columns; at least 2 visible palette colors.

## Harness

- Validator and renderer: `runs/spikes/phase62/sprite-manifest.js`
- Example manifests: `runs/spikes/phase62/examples/*.sprite.json`
- Renderer scripts:
  - `node runs/spikes/phase62/render-examples.js`
  - `node runs/spikes/phase62/render-one.js <sprite.json> <out.png>`
- Test config: `runs/spikes/phase62/vitest.config.js`
- Saved ArtDirector prompt: `runs/spikes/phase62/artdirector-prompt.md`

The renderer is a dependency-free RGBA-to-PNG path using Node `zlib`, not PixiJS and not node-canvas.

## Saved ArtDirector Prompt

See `runs/spikes/phase62/artdirector-prompt.md`. It mirrors the ambient provider shape: the provider can pass the prompt string to `codex exec --sandbox read-only -c approval_policy=never <prompt>` and parse stdout as strict JSON.

## Host-Side Live Smoke

Run this outside nested Codex, from the repo root:

```sh
codex exec --sandbox read-only -c approval_policy=never "$(cat runs/spikes/phase62/artdirector-prompt.md)" > runs/spikes/phase62/codex-cave-slug.sprite.json
node runs/spikes/phase62/render-one.js runs/spikes/phase62/codex-cave-slug.sprite.json runs/spikes/phase62/codex-cave-slug.png
ls runs/spikes/phase62/codex-cave-slug.png
```

Pass condition: `render-one.js` accepts the JSON and produces a recognizable slug PNG. If the first codex output fails only for JSON wrapper text, the future provider should reuse the ambient provider's JSON extraction/parse failure handling. If repeated host-side attempts fail the validator or produce unreadable silhouettes, pivot to curated fallback primary plus optional raster image API.

## Recommendation Rationale

Pixel matrix beats compact SVG for the first contract because every pixel is bounded, palette legality is trivial, transparent background is unambiguous, and rendering cannot execute model-authored drawing logic. SVG may become useful later for larger portraits or UI illustrations, but it has a broader validation surface and is less deterministic to rasterize across environments.

Seed Phase 64 ART.md with:
- Primary sprite size: `16x16`.
- Large/signature sprite size: `24x24`.
- Palette budget: 3-6 colors for normal sprites, up to 8 for signature sprites, hard max 15.
- Shallows seed palette direction: dark cave outline, cool stone mids, moss green accent, warm torch highlight.

## Verification Evidence

`node runs/spikes/phase62/render-examples.js`:

```text
examples/cave-slug.sprite.json -> /Users/keigoshimada/Documents/generative-gaming/runs/spikes/phase62/cave-slug.png
examples/stone-floor.sprite.json -> /Users/keigoshimada/Documents/generative-gaming/runs/spikes/phase62/stone-floor.png
```

`pnpm exec vitest run --config runs/spikes/phase62/vitest.config.js --reporter verbose`:

```text
Test Files  1 passed (1)
Tests  3 passed (3)
```

`ls runs/spikes/phase62/*.png`:

```text
runs/spikes/phase62/cave-slug.png
runs/spikes/phase62/stone-floor.png
```

`file runs/spikes/phase62/*.png`:

```text
runs/spikes/phase62/cave-slug.png:   PNG image data, 128 x 128, 8-bit/color RGBA, non-interlaced
runs/spikes/phase62/stone-floor.png: PNG image data, 128 x 128, 8-bit/color RGBA, non-interlaced
```

`pnpm run check`:

```text
Test Files  80 passed (80)
Tests  553 passed | 2 skipped (555)
```

`pnpm run verify:ci`:

```text
All steps passed.
```

## Scope, Risks, and Notes

- Implementation writes were kept to `runs/spikes/phase62/**`; no intentional `src/`, `app/`, `content/`, schema, engine, director, PixiJS, or live codex changes.
- Post-verification status also shows unrelated dirty `package.json`/`pnpm-lock.yaml` PixiJS changes and regenerated `runs/milestones/m0/**` artifacts outside the owned sandbox. They are not part of this spike deliverable and were left untouched rather than hand-edited or reverted outside ownership.
- Live codex sprite quality remains unproven by this worker because the brief forbids nested live codex. The host-side smoke command above is the required next proof.
- `PROGRESS.md` was not updated because this brief's owned files restrict writes to `runs/spikes/phase62/**`.
- Environment discoveries: full `pnpm run check` / `pnpm run verify:ci` can leave tracked `runs/milestones/m0/**` artifacts dirty while still passing.
- Actual time spent: about 20 minutes versus the brief's `<= 1 day` spike timebox.
