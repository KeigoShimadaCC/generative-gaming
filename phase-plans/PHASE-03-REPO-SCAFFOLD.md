# PHASE-03 — Repo Scaffold

## 1. Objective
A bootable TypeScript workspace where `pnpm run check` exists and is green.

## 2. Context
TECH_SPEC §1 (tooling table), §7 (layout); PHASE-00 (gate commands); ENVIRONMENT.md gate block to be updated by this phase.

## 3. Dependencies
02 (all sessions launch through the harness from here on).

## 4. Scope IN
- `package.json` (pnpm, Node LTS engines), strict `tsconfig.json`, ESLint+Prettier configs, Vitest config, `pnpm run check` = typecheck+lint+test, scripts for each gate (cheapest first).
- Empty module skeleton per TECH_SPEC §7 (`src/engine|schemas|director|gauntlet|harness|evals|cli`, `content/`, `runs/.gitkeep`) with a placeholder test per top module.
- `.env.example` (commented, empty values); `.gitignore` additions (runs artifacts size policy, `.next`, sqlite).

## 5. Scope OUT
- No Next.js app (PHASE-48). No CI (04A). No real code in any module. No dependency beyond tooling + zod + vitest.

## 6. Owned files
Root config files, `src/**` (skeleton only), `content/.gitkeep`, `.env.example`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Tooling configs + scripts + check pipeline | root configs | Codex | 20m / 40m | — |
| 2 | implement | Module skeleton + placeholder tests + env/gitignore | src/**, content/, .env.example | Codex (same session) | 10m / 20m | — |
| 3 | verify | Fresh-clone simulation: install + check green; layout matches TECH_SPEC §7 | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm install` · `pnpm run typecheck` · `pnpm run lint` · `pnpm test` · `pnpm run check`.

## 9. Completion criteria
1. `pnpm run check` green from a clean install.
2. Layout matches TECH_SPEC §7 exactly; dependency-direction lint rule (or TODO stub for it) present.
3. Behavioral smoke: verifier reproduces green check from scratch.
4. Acceptance bar: any worker can clone, install, and run gates with zero undocumented steps; ENVIRONMENT.md gate block updated to real commands.

## 10. Risks & escalation
Version churn (pin exact versions). No architecture decisions here — anything tempting goes to backlog.
