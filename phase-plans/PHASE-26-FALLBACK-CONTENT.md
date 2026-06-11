# PHASE-26 — Fallback Content Pack (Old Stock)

## 1. Objective
The handcrafted content pack that makes the game fully playable offline: items, enemies, traps, NPCs, quests, and floor params for all 12 floors — canonically the Old Stock.

## 2. Context
NORTH_STAR §4.5 (offline invariant); WORLD §4.3 (Old Stock: unpersonalized on purpose); GAME_DESIGN §8–10 (bounds it must satisfy); 21's content-injection interface.

## 3. Dependencies
14, 16, 20. Parallel with 23–25.

## 4. Scope IN
- `content/fallback/`: ~25 items (all categories, all bands), ~18 enemies (Old Stock flavor: vermin/fungus/cave-things; all behaviors exercised at least once across the set), ~8 traps, 4 NPCs with dialogue, 4 quests (covering ≥4 objective types), floor params for floors 1–12 within band budgets.
- All content as schema-validated data files; loader with validation-at-load; names/text follow WORLD §5–6 fences (humble, concrete, no jokes).
- A content-coverage test: every vocabulary entry (verb/behavior/trigger) used by ≥1 fallback entity — the pack doubles as the engine's living integration fixture.

## 5. Scope OUT
- Made/Kept content (Director's job). Balance perfection (58 tunes). Theme art.

## 6. Owned files
`content/fallback/**`, `src/harness/content-loader.ts`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Loader + validation-at-load + tests | content-loader.ts | Cursor | 10m / 20m | — |
| 2 | implement | Items + traps data | content/fallback/items*, traps* | Codex | 15m / 30m | task 3 via file split |
| 3 | implement | Enemies + NPCs + quests + floor params data | content/fallback/enemies*, npcs*, quests*, floors* | Codex (same session) | 20m / 40m | — |
| 4 | verify | Coverage test green; full-pack bot batch (3×10 seeds, floors 1–12) terminates within band thresholds loosely (no hard gate yet) | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · vocabulary-coverage test · `pnpm run simulate -- --batch` on the pack.

## 9. Completion criteria
1. Pack loads, validates, and covers every vocabulary entry (test).
2. 30-run bot batch on the pack: 100% terminate, no engine errors.
3. Text spot-check against WORLD fences (verifier reads 10 random strings).
4. Acceptance bar: with zero API keys, `pnpm run play` offers a complete 12-floor game.

## 10. Risks & escalation
Tone is human-owned taste — flag any text the verifier finds off-fence to the human at phase close rather than looping on wording.
