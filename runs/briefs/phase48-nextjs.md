IMPLEMENT TASK — PHASE-48: Next.js scaffold & API transport (contract: phase-plans/PHASE-48-NEXTJS-SCAFFOLD.md; read TECH_SPEC §3/§4, UX §1 layout skeleton, ENVIRONMENT.md .next/port facts).

GATE SCOPE: alone — full pnpm run check at end (clean .next before typecheck per the documented trap). Do NOT commit.
STEP 0: 38's transport handlers (src/director/orchestration/transport) mount as routes; engine is a pure lib the client imports; Zustand store mirrors engine state (NO game logic in app/ — mirror only).
OWNED FILES: app/**, next.config.*, root config edits ONLY as Next requires (tsconfig paths, package.json scripts dev/build + pinned next/react/tailwind/zustand deps).

THE WORK:
1. Next.js App Router + Tailwind + Zustand (pinned exact versions), dark theme tokens; pnpm run dev on ${PORT:-3001}.
2. Single game route: the UX §1 three-region skeleton (grid area / right column HUD+context / bottom log strip) as empty styled boxes with correct proportions.
3. API routes mounting the three transport handlers verbatim (thin: parse → call → serialize).
4. Zustand store: engine-state mirror (subscribe/update from a GameState object) + UI toggles slice; a fixture state hydrates the skeleton in dev.
5. .next hygiene: gitignore covers it (verify), typecheck unpolluted after a dev run (TEST THIS: run dev briefly, kill, then pnpm run typecheck — paste).
6. Boundary lint: app/ imports only engine/harness public surfaces (add the dependency-direction guard if cheap).
DEFINITION OF DONE: pnpm run check green AFTER a dev-server run (paste); curl smokes of the three routes (paste). Report + actual vs 35m. NO commit. Then stop.
