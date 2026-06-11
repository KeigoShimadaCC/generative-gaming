# PHASE-19 — NPC Mechanics: Dialogue & Barter

## 1. Objective
NPCs as mechanical objects: finite dialogue trees, choice selection, merchant barter — fiction-agnostic.

## 2. Context
GAME_DESIGN §10 (0–2 per floor, trees ≤3 deep / 2–5 choices, merchant ≤6 items, invulnerable); §8 (buy 50% / sell 100–150%); UX §5 (panel interaction model).

## 3. Dependencies
06 (12 for barter inventory ops). Parallel with 18.

## 4. Scope IN
- `src/engine/npc/`: NPC entity (invulnerable flag honored by combat targeting), dialogue tree walker (node → choices → node, exit anywhere), talk action wiring through 07B, choice consequences limited to: dialogue flags, barter open, quest offer hook (20 fills), end conversation.
- Barter: price calculation from config multipliers, buy/sell against player inventory + coin.

## 5. Scope OUT
- Quest logic (20). Dialogue *content* (26/Director). The Kept fiction (prompt-side, not engine).

## 6. Owned files
`src/engine/npc/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Dialogue walker + talk wiring + flags + tests | npc/dialogue.ts | Codex | 15m / 30m | 18 |
| 2 | implement | Barter + pricing + tests | npc/barter.ts | Codex (same session) | 15m / 30m | — |
| 3 | verify | Tree bounds enforced (4-deep tree rejected); NPC untargetable by attacks; barter conserves value (coin+goods total invariant) | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · barter conservation property test.

## 9. Completion criteria
1. Dialogue trees walk correctly, exit-anywhere works, depth/choice bounds enforced (tests).
2. NPCs cannot take damage from any source (test vs melee, bolt, burst, traps).
3. Barter math matches config; conservation invariant holds (property test).
4. Acceptance bar: an NPC defined as pure schema data is fully interactable with zero bespoke code.

## 10. Risks & escalation
Burst effects hitting NPCs is the sneaky path to the invulnerability test — verifier must include it.
