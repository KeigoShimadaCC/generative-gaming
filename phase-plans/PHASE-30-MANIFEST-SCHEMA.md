# PHASE-30 — Floor Manifest Schema

## 1. Objective
The complete floor-manifest envelope — everything the Director may say, in one provider-accepted, gauntlet-validatable schema.

## 2. Context
GAME_DESIGN §12 (the what-and-how-much contract: layout knobs, theme, roster+placements, items, traps, 0–2 NPCs, quest, narration beats, metadata, signature flag); 29's findings (accepted constructs only); TECH_SPEC §6.

## 3. Dependencies
29.

## 4. Scope IN
- `src/schemas/manifest.ts`: the envelope composing PHASE-05 entity schemas; placement coordinates as floorgen-relative hints (room index + preference, not absolute tiles — engine resolves via 17's placement API); origin tags; callback references; protocol version stamp; signature-moment flag with its budget-relax marker.
- **Live contract test (`@live`, subtask 1): the full manifest schema accepted by the provider + one real generation parses.** Mock fixtures: 3 hand-written valid manifests (one per band) + a malformed set.

## 5. Scope OUT
- Prompt content (32). Gate logic (33/34). Application (35).

## 6. Owned files
`src/schemas/manifest.ts` (+ fixtures + tests).

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | **Live contract test first** — envelope skeleton accepted by provider | manifest.ts (@live test) | Codex | 10m / 20m | — |
| 2 | implement | Full envelope + fixtures + validation tests | manifest.ts + fixtures | Codex (same session) | 25m / 50m | — |
| 3 | verify | §12 coverage table (every manifest element ↔ schema field); re-run @live test; malformed set all rejected | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · `pnpm test -- --tag @live` (key present) · coverage table in report.

## 9. Completion criteria
1. Live test green: provider accepts the schema, output parses, Zod validates.
2. Every GAME_DESIGN §12 element expressible; nothing beyond it expressible.
3. Band fixtures validate; malformed set fails with usable error messages.
4. Acceptance bar: 31–35 build against a provider-proven shape; schema changes after this = protocol bump.

## 10. Risks & escalation
If a §12 element can't survive provider constraints (e.g., nesting depth), stop and report — the orchestrator + human decide the redesign; never silently drop an element.
