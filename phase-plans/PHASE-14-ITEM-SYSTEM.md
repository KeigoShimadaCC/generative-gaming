# PHASE-14 — Item System: Triggers, Targeting, Identification, Curses

## 1. Objective
Items become playable: every trigger type fires its effect bundle through the interpreter, and the identification game works.

## 2. Context
GAME_DESIGN §7 (triggers, shapes, proc chances), §8 (categories, unidentified spawns, cursed gear ≤10% announcing on equip); UX §4 (known-vs-unknown contract).

## 3. Dependencies
13A, 13B.

## 4. Scope IN
- `src/engine/items/`: trigger dispatch — quaff, read, throw_hit (projectile path via geometry), equip_passive, on_hit/on_struck procs (chance via RNG substream), use-with-charges, step (interface for 18).
- Identification: per-run seeded appearance pools for draughts/notes/charms; identify-by-use; knowledge table on run state; weapon/armor bonus reveal on equip; cursed announce-on-equip.
- Per-category log/event lines honoring the "what is unknown" card contract.

## 5. Scope OUT
- Trap placement (18). Item generation/placement on floors (17/26). Economy pricing checks (Gate 1, PHASE-33).

## 6. Owned files
`src/engine/items/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Trigger dispatch + proc chances + charges + tests | items/triggers.ts | Codex | 20m / 40m | — |
| 2 | implement | Identification system + appearance pools + curse reveal + tests | items/identify.ts | Codex (same session) | 15m / 30m | — |
| 3 | verify | End-to-end item scenarios on fixtures: unknown draught → quaff → identified across the run; thrown item hits along path; proc rates within band over 10k rolls | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · proc-rate statistical test · identification-persistence scenario test.

## 9. Completion criteria
1. Every trigger type fires correctly (test per trigger).
2. Appearance pools are per-run seeded and stable within a run (test).
3. Identification knowledge persists for the run and never leaks across runs (test).
4. Acceptance bar: a brand-new item defined as pure schema data is fully playable — quaffable, throwable, equippable — with zero new code.

## 10. Risks & escalation
This phase proves the whole "content is data" thesis; if any item category *needs* bespoke code, that's a design break — stop and report immediately.
