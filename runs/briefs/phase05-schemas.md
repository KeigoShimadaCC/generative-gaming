IMPLEMENT TASK — PHASE-05: schemas & content vocabularies (contract: phase-plans/PHASE-05-SCHEMAS-VOCABULARIES.md; read it plus GAME_DESIGN.md §§6–10 and TECH_SPEC.md §6 BEFORE writing code).

THIS IS THE HIGHEST-BLAST-RADIUS PHASE IN THE PROJECT. Everything downstream imports what you build. If any shape decision feels ambiguous, STOP on it, list it under AMBIGUITIES, and continue with the rest — do not improvise shapes.

STEP 0 (ENVIRONMENT.md, verified): gates pnpm run check; zod 4.4.3 already installed; import bounds from src/config (bounds export) — NEVER hardcode a number that exists in config. Do NOT commit.

OWNED FILES: src/schemas/** only.

THE WORK:
1. src/schemas/vocab/: zod schemas for the closed vocabularies, deriving allowed values/bounds from src/config bounds where present:
   - statuses (the 10 ids of GAME_DESIGN §6) + status application {status, duration} with per-status duration bounds
   - effect verbs (the 16 of §7) — one schema per verb with its parameter bounds; effects as a discriminated union BY FIELD (see constraint 3 below)
   - triggers (§7: quaff, read, throw_hit, equip_passive, on_hit, on_struck, step, use) with proc-chance/charge bounds
   - targeting shapes (§7: self, melee, bolt, burst, floor) with range/radius bounds
   - effect bundle: 1–3 effects + one trigger + one targeting shape
2. src/schemas/entities/: item definitions (every §8 category incl. weapon/armor bonuses, charm single-passive rule, coin), enemy definitions (stat block + 1–3 behavior ids from §9.2 with per-behavior params incl. pack_hunter allyCount 2–4, flee threshold 20–50, caster cooldown 3–6 + 0–2 abilities as effect bundles + origin tag made|old_stock|kept), NPC definitions (dialogue tree ≤3 deep, 2–5 choices per node, merchant inventory ≤6, quest hook slot), quest definitions (6 objective types of §10 as a tagged structure), trap definitions (hidden + step-trigger bundle), narration beats (floor intro + ≤3 observation beats, text length caps).
3. PROVIDER-COMPAT CONSTRAINTS (TECH_SPEC §6 — structural law, these enable LLM structured output later): no root-level unions anywhere a schema may be sent to a provider; every object property required (use nullable placeholders instead of .optional() in entity schemas); model discriminated unions as objects with a literal `kind` field + per-kind nullable payload fields where a provider-facing schema needs union semantics. Internal-only schemas may use idiomatic zod, but mark provider-facing ones with a comment.
4. src/schemas/protocol.ts: PROTOCOL_VERSION = '1.0.0' + stamp(object) helper adding {protocolVersion, engineVersion (from package.json), createdAt: injected — takes a timestamp param, no Date.now() inside}.
5. Tests per schema family: valid fixture passes; for EACH bound: an out-of-bounds fixture fails; malformed/extra-property fixtures fail (strict mode). Fixtures live in src/schemas/fixtures/.

DEFINITION OF DONE — run and paste:
1. pnpm run check (green)
2. A coverage table: GAME_DESIGN row (§6 each status, §7 each verb+trigger+shape, §9.2 each behavior, §10 each objective) → schema export name. Every row of those doc tables must appear.
3. rg 'Math.random|Date.now' src/schemas/ (empty)
Report: files, coverage table, AMBIGUITIES (if any), actual time vs 45m estimate. NO commit. Then stop.
