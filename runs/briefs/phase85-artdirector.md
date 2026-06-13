# PHASE 85 (+ Art Gauntlet) — ArtDirector: the AI draws the floors

## STEP 0 — environment facts
- Repo root: /Users/keigoshimada/Documents/generative-gaming. `pnpm install` done.
- Gate: `pnpm run verify:ci`. ONE codex at a time, system-wide.
- The ambient provider that spawns codex is src/director/provider/ambient.ts
  (`codex exec --sandbox read-only -c approval_policy=never <prompt>`, parses
  stdout JSON, handles wrapper text). MIRROR it. Your sandbox may not allow
  nested live codex — build + a contract test; the ORCHESTRATOR runs the live
  generation smoke host-side.
- Frozen contracts: ART.md §2 (sprite v1), §13 (ArtDirector→gauntlet→fallback);
  src/art/ (validator, atlas, resolver, ArtDirector SEAM interface from phase 65),
  content/art/fallback/ (the curated Old Stock set + the saved prompt at
  runs/spikes/phase62/artdirector-prompt.md — already proven live to produce a
  recognizable cave slug).

## BRANCH ASSIGNMENT (orchestrator authority)
Work on `main`. NO git commits, NO branches.

## OBJECTIVE
Build the ArtDirector generation subsystem so the same AI that authors floors
DRAWS them: per (theme, entity) it generates a sprite-manifest v1 via ambient
codex, passes it through an ART GAUNTLET (validate → palette legality → renders
→ readability), caches into the atlas keyed (theme, entity, seed), and falls
back to the curated Old Stock set on reject/timeout — all invisibly. Mirror the
Director→gauntlet→fallback discipline exactly.

## SUBTASK 1 (do FIRST) — live provider contract test
Per CLAUDE.md for LLM-integrated work: a single real-call contract proving the
ArtDirector prompt + parser accept a codex-generated sprite manifest. Since you
may not nest codex, instead: (a) build the provider + parser to the ambient
shape, (b) write a contract test that feeds the parser the ALREADY-CAPTURED live
output at runs/spikes/phase62 (ai-live-slug.sprite.json) and a couple of
adversarial malformed outputs, proving parse + gauntlet accept/reject correctly.
The orchestrator runs the end-to-end live smoke (codex → your provider → atlas).

## SCOPE IN
1. `src/artdirector/` provider: builds the prompt from (theme, entity, dims,
   palette constraint) per ART.md, spawns codex like the ambient provider,
   extracts+parses the JSON sprite manifest (reuse the ambient JSON-extraction
   robustness). A configurable timeout (default ~45s).
2. ART GAUNTLET: schema (v1) → palette legality → renders-without-throw (use the
   src/art rasterizer) → readability heuristic (ART.md §2 bar). Records each
   attempt + verdict as an artifact (mirror the gauntlet's artifact discipline;
   reuse the existing artifact fs if shared).
3. Atlas integration via the phase-65 ArtDirector SEAM: accepted sprites cache
   keyed (theme, entity, seed) — deterministic, generated-once-per-floor, identical
   on replay. Reject/timeout → curated fallback (resolver already returns fallback).
4. A mode/flag: ART=fallback forces curated set (no generation); default attempts
   generation then falls back. The renderer must look good in BOTH.

## SCOPE OUT
- NO PixiJS/render changes (R1/R2 own the stage; the resolver already reads the
  atlas). NO engine/schemas/director(content)/gauntlet(gameplay) changes. NO raster
  image API. Do not regress the curated-fallback path.

## OWNED FILES
- src/artdirector/** (provider, art-gauntlet, prompt builder, types, tests)
- src/art/** ONLY to implement the seam interface's concrete wiring (no breaking
  changes to phase-65 exports; note any).
- content/art/ ONLY if you add a generated-cache scaffold (keep curated set intact).
Forbidden: src/engine, src/schemas, src/director, src/gauntlet, app/**, content/fallback.

## DONE = paste outputs with exit codes
- `pnpm run verify:ci` → exit 0 (incl. your contract + gauntlet tests).
- The contract test (subtask 1) passing on the captured live slug + rejecting
  malformed outputs — paste it.
- REPORT: the provider/gauntlet/atlas wiring, the exact codex command, the cache
  key + determinism story, the fallback path, and EXACTLY what the orchestrator
  should run for the end-to-end live smoke (codex generating a fresh themed sprite
  that lands in the atlas and renders).

## ESTIMATE / TIMEBOX
Large bounded (Codex spine, mirror the Director build). 60 min estimate, 120 min
timebox. STOP+report if the phase-65 seam can't accept generated sprites without
a breaking change (escalate the seam revision).
