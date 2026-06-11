IMPLEMENT TASK — PHASE-03: repo scaffold (contract: phase-plans/PHASE-03-REPO-SCAFFOLD.md; read it first, plus TECH_SPEC.md §1 and §7).

STEP 0 — environment facts (ENVIRONMENT.md, all verified): macOS BSD userland; `rm -rf` blocked in your sandbox (Node fs ok); non-destructive `&&` works; network available (pnpm install will work); you CAN write .git but must NOT commit (orchestrator commits). First check `pnpm --version` — if pnpm is missing, STOP and report (do not install global tooling).

OWNED FILES: root config files (package.json, pnpm-lock.yaml, tsconfig.json, eslint/prettier/vitest configs), src/** (skeleton only), content/.gitkeep, .env.example, .gitignore (append only). Do NOT touch: scripts/**, phase-plans/**, runs/**, any *.md doc in root except none.

THE WORK:
1. package.json: pnpm, Node LTS engines field, pinned exact versions. Dependencies: zod only. DevDependencies: typescript, vitest, eslint + @typescript-eslint, prettier, eslint-config-prettier.
2. tsconfig.json: strict true, noUncheckedIndexedAccess true, ES2022 target, NodeNext modules, src rootDir.
3. ESLint flat config + .prettierrc; eslint must enforce no-restricted-imports stubs ready for layer rules (a placeholder rule entry with a TODO-PHASE-05 comment is fine).
4. vitest.config.ts: include src/**/*.test.ts; `@live`-tagged tests excluded by default (env-gated: only run when CODEX_LIVE=1 or similar — document in the config comment).
5. Scripts (exact names): "typecheck" (tsc --noEmit), "lint" (eslint .), "test" (vitest run), "check" (typecheck && lint && test), "format".
6. Module skeleton per TECH_SPEC §7: src/engine/ src/schemas/ src/director/ src/gauntlet/ src/harness/ src/evals/ src/cli/ — each with index.ts (export {} placeholder + one-line module-boundary comment) and one trivial placeholder .test.ts. Plus content/.gitkeep.
7. .env.example: commented placeholders for OPENAI_API_KEY / ANTHROPIC_API_KEY / AI_GATEWAY key names (values empty), one comment line each.
8. .gitignore: APPEND a scaffold section: node_modules/, dist/, *.tsbuildinfo (note: .next, sqlite, env entries already exist — do not duplicate).

DEFINITION OF DONE — run and include outputs:
1. pnpm install (fresh)
2. pnpm run typecheck && pnpm run lint && pnpm test
3. pnpm run check
4. find src -name "*.ts" | sort  (show the skeleton)
Report: file list, gate outputs, environment discoveries, actual time vs 30m estimate. NO commit. Then stop.
