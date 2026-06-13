# Art Pipeline

Phase 65 owns the deterministic half of the art path:

1. `sprite-manifest.ts` validates `everdeep.sprite-manifest.v1` and rasterizes it
   to RGBA pixel data.
2. `atlas.ts` caches rasterized sprites by `(themeId | "fallback", entityId, seed)`.
3. `resolver.ts` maps existing render/game-state discriminants to sprite IDs.
4. `fallback.ts` validates the curated Old Stock JSON set in
   `content/art/fallback/index.json`.
5. `art-director.ts` defines the seam and exports the concrete ArtDirector
   wiring from `src/artdirector/`; renderer and resolver behavior remain
   fallback-safe when no generated atlas entry exists.

The engine, schemas, Director, gauntlet, and app renderer remain untouched.
