# PHASE-05 — Schemas & Content Vocabularies

## 1. Objective
The single source of truth for every content type: the closed vocabularies (statuses, effect verbs, behaviors, triggers, targeting) and the entity schemas composed from them, with protocol versioning.

## 2. Context
GAME_DESIGN §6 (statuses), §7 (effect verbs, composition rules), §9.2 (behaviors), §10 (quest objectives); TECH_SPEC §6 (Zod single source, provider schema landmines); NORTH_STAR §3 (freedom spectrum).

## 3. Dependencies
04B (bounds come from config), 04C. Serial — everything downstream imports this.

## 4. Scope IN
- `src/schemas/`: Zod schemas for: the 10 statuses, 16 effect verbs (with parameter bounds from config), triggers, targeting shapes, effect bundles (1–3 effects + trigger + shape), item definitions (all categories §8), enemy definitions (stats + 1–3 behaviors + 0–2 abilities + origin tag), NPC definitions (dialogue tree ≤3 deep, 2–5 choices, merchant inventory ≤6), quest definitions (6 objective types), trap definitions, narration beats.
- `PROTOCOL_VERSION` constant + stamping helper.
- Provider-compat constraints honored *now*: no root unions, all properties required (nullable placeholders), `additionalProperties: false` (TECH_SPEC §6) — so the manifest schema (PHASE-30) composes these without rework.
- Validation tests: valid fixtures pass; out-of-bounds and malformed fixtures fail cleanly, per schema.

## 5. Scope OUT
- No floor-manifest envelope (PHASE-30). No engine logic. No JSON-schema conversion (PHASE-29/30 proves it live).

## 6. Owned files
`src/schemas/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Vocabulary schemas: statuses, verbs, triggers, shapes, bundles + tests | src/schemas/vocab/** | Codex | 20m / 40m | — |
| 2 | implement | Entity schemas: items, enemies, NPCs, quests, traps, narration + tests | src/schemas/entities/** | Codex (same session) | 20m / 40m | — |
| 3 | implement | Protocol version + stamping helper + test | src/schemas/protocol.ts | Cursor | 5m / 15m | after 1 |
| 4 | verify | Fixture audit: every vocab item from GAME_DESIGN present, every bound enforced, provider-compat rules obeyed | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · verifier's coverage table (GAME_DESIGN row ↔ schema) in report.

## 9. Completion criteria
1. All §6/§7/§9.2/§10 vocabulary entries exist as schemas with config-sourced bounds; nothing extra, nothing missing.
2. Malformed/out-of-bounds fixtures fail with clear errors (tested per entity type).
3. Provider-compat constraints structurally enforced (verifier checked).
4. Acceptance bar: PHASE-30 can build the manifest by composition only, and engine phases can import types without redefining anything.

## 10. Risks & escalation
This is the highest blast-radius phase: any shape doubt → stop and report (schema shapes are human-ask territory, CLAUDE.md §When Unsure). Do not "improve" GAME_DESIGN values in passing.
