# Phase 63 spike — PixiJS in Next.js + accessibility bridge

**Status:** proven in-repo (no merge commit; main-tree spike)  
**Seam version:** `phase63-v1`  
**Pixi:** `pixi.js@8.19.0` on Next `15.5.19`

## Verdict

PixiJS v8 mounts in the Next 15 app as a **client-only, dynamically imported** canvas. The
visual layer is a **pure function of `GridViewModel`** (`createStageDrawList`), and an
off-screen DOM **a11y mirror** (`StageA11yMirror`) stays in sync with the same view-model.
The existing DOM `GameGrid` is untouched; swap happens at the frozen seam.

## Frozen render seam

App wiring passes **`StageProps`** to a renderer chosen by **`StageSurface`**:

```ts
// app/components/stage/seam.ts
export type StageProps = {
  readonly state: GameState | null;
  readonly markers?: readonly GridOverlayMarker[];
  readonly glyphSizeRem?: number;
};

export type StageRendererProps = StageProps & {
  readonly surface?: "dom" | "pixi"; // default stays "dom" until product flips
};
```

**Data flow (both surfaces):**

```
GameState
  → createGridViewModel(state, previousCursor, markers)   // existing grid/model.ts
  → DOM: GridFrame(model)           |  Pixi: createStageDrawList(model) → PixiStageCanvas
  → Pixi only: StageA11yMirror(model)  // visually hidden, same aria grid as GameGrid
```

**Swap pattern for R1+ (not wired in this spike):**

```tsx
import { GridRegion } from "@/components/grid";
import { PixiStage } from "@/components/stage";

const usePixiStage = process.env.NEXT_PUBLIC_STAGE_SURFACE === "pixi";

{usePixiStage ? (
  <PixiStage state={state} markers={markers} />
) : (
  <GridRegion state={state} markers={markers} />
)}
```

Tilemap, camera, sprites, and lighting plug in **behind** `createStageDrawList` / the Pixi
painter — `app/` keeps passing `StageProps` only.

## Pure draw-list (headless test surface)

```ts
createStageDrawList(model: GridViewModel): StageDrawList
```

- One background rect per cell; optional entity overlay rect for visible player/enemy/npc/item/trap.
- Colors keyed only from `GridCellView` fields (`colorsForCell`) — no `Math.random`, no clocks.
- Vitest covers mapping + determinism without WebGL.

## Accessibility mirror pattern

`StageA11yMirror` renders `role="grid"` / `role="gridcell"` with the same `aria-label`
shape as `GameGrid` (`"${x},${y} ${label}"`), clipped off-screen via CSS (not `display:none`,
so AT can traverse). Canvas host is `aria-hidden="true"`. Full keyboard focus routing is
**phase 89**; this spike proves the **dual-layer pattern** (canvas visual + DOM semantic grid).

## Next.js + Pixi v8 gotchas (for R1+)

1. **`"use client"` + `dynamic(..., { ssr: false })`** on `PixiStageCanvas` — never SSR the
   WebGL canvas; Pixi `Application.init()` is async.
2. **Guard `window`** in the canvas effect; host ref mounts only on client.
3. **Resize on view-model change:** `app.renderer.resize(canvasWidth, canvasHeight)` then
   repaint from draw-list (no simulation inside Pixi).
4. **Destroy on unmount:** `app.destroy(true, { children: true })` and clear the host node.
5. **Build:** `pixi.js` bundles cleanly with Next 15 production build; no webpack aliases required.
6. **Determinism suites:** engine untouched; draw-list is isolated from Pixi imports.

## Owned artifacts

| Path | Role |
|------|------|
| `app/components/stage/seam.ts` | Frozen `StageProps` / surface types |
| `app/components/stage/draw-list.ts` | Pure view-model → rects |
| `app/components/stage/colors.ts` | Deterministic palette |
| `app/components/stage/a11y-mirror.tsx` | Off-screen aria grid |
| `app/components/stage/PixiStage.tsx` | Client entry + dynamic import |
| `app/components/stage/PixiStageCanvas.tsx` | Pixi mount + repaint |
| `app/components/stage/PixiStage.test.ts` | Headless seam tests |

## Environment discoveries

None beyond STEP 0 facts. `pnpm add pixi.js@^8` resolved to `8.19.0` without native build scripts.
