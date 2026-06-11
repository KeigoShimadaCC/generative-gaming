# PHASE-48 — Next.js Scaffold & API Transport

## 1. Objective
The web shell exists: Next.js App Router app booting the engine client-side, with 38's transport handlers mounted as API routes.

## 2. Context
TECH_SPEC §3 (framework choices), §4 (server = thin transport); UX §1 (one screen, three regions — skeleton only here); ENVIRONMENT.md (.next typecheck pollution, port facts).

## 3. Dependencies
28. Parallel with Wave F.

## 4. Scope IN
- `app/`: Next.js + Tailwind + Zustand setup (versions pinned), single game route with the three-region layout skeleton (empty boxes, correct proportions), API routes mounting 38's handlers verbatim, Zustand store mirroring engine state (subscribe → render data), dark theme tokens.
- `pnpm run dev` with `${PORT:-3001}`; `.next` cleaning wired into the typecheck gate (ENVIRONMENT.md fact).

## 5. Scope OUT
- All actual UI rendering (49A/B onward). Any game logic in app/ (lint-guarded: app may import engine/harness public APIs only).

## 6. Owned files
`app/**`, root Next config files.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Next+Tailwind+Zustand setup + layout skeleton + store | app/** | Codex | 20m / 40m | Wave F |
| 2 | implement | API route mounting + dev script + gate fix for .next | app/api/**, configs | Cursor | 10m / 20m | task 1 |
| 3 | verify | Boot, hit each API route via curl, typecheck clean after a dev-server run (the .next trap), no engine imports beyond public API (grep) | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` (post-dev-run) · `pnpm run dev` + curl smoke on each route.

## 9. Completion criteria
1. App boots; three-region skeleton renders; store hydrates a fixture state.
2. All transport routes respond correctly (curl smoke).
3. The .next/typecheck trap defused (gate green after dev run — explicitly tested).
4. Acceptance bar: every Wave G phase can build inside this shell without touching scaffold files.

## 10. Risks & escalation
Keep the store dumb (mirror, not logic) — any reducer-smelling code in app/ is a boundary violation; verifier flags it.
