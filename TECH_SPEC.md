# TECH_SPEC.md — Technical Guidelines

How Generative Gaming is built, at the level of technology choices and boundaries —
not code. Phase plans pin exact versions and contracts; this document pins the *kind*
of stack and the rules that keep it coherent. When a phase plan and this document
conflict, stop and report (per `CLAUDE.md`).

Two guiding constraints:

1. **Local-first** (from `NORTH_STAR.md`). Everything runs on one laptop with no
   infrastructure beyond LLM API keys. Anything that requires an account, a hosted
   service, or a deploy step to *play the game* is out.
2. **Agent-operable.** This project is built with minimal human intervention by
   coding agents (CLAUDE.md / AGENTS.md), so every layer must be fully reachable
   through text: readable as source, changeable as a diff, verifiable by a CLI
   command. A technology where part of the capability lives behind a GUI editor,
   a scene inspector, or a binary asset format is partially inaccessible to a
   headless worker — and a half-operable tool is worse than a smaller fully-operable
   one. When two options are close, pick the one an agent can iterate on alone:
   plain code over engine editors, files over dashboards, CLI over clicks.

---

## 1. Language, Runtime, Tooling

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict: true`, no `any` escape hatches | One language across engine, server, UI, evals; agent-friendly |
| Runtime | Node.js (current LTS) | Boring, everywhere, fine for turn-based workloads |
| Package manager | pnpm | Fast, disciplined; matches reference projects |
| Repo shape | Single package, hard module boundaries (see §7) | Parallel agents need folder ownership, not package overhead; split into workspaces only if a phase proves the need |
| Lint/format | ESLint + Prettier, enforced in CI | No style debates in PRs |
| Unified check | `pnpm run check` = typecheck + lint + test | The single green light AGENTS.md requires |

---

## 2. Architecture Shape

Three layers with one-way dependencies. Lower layers never import from higher ones.

```
UI (Next.js)  ──▶  Harness / Server (Director pipeline, gauntlet, persistence)  ──▶  Engine (pure library)
CLI & Evals   ──▶  same harness  ──────────────────────────────────────────────▶  same engine
```

- **Engine** — a pure, headless TypeScript library. Deterministic, seeded, no I/O, no
  timers, no `Date.now()`, no LLM calls, no imports from anywhere else in the repo.
  Exposes the stable game contract (start / available actions / step / render /
  terminal check) consumed identically by the UI, the CLI, bots, and evals.
- **Harness** — everything around the engine: the Director pipeline (prompt → LLM →
  parse → gauntlet → apply), fallback content serving, run recording, persistence,
  bot players, and the eval runners. This is the only layer that talks to LLM
  providers or touches disk.
- **UI** — a thin client. Renders engine state, submits structured actions, shows the
  dungeon diary and artifact viewer. Owns zero game rules; if the UI is deleted, the
  game still plays headlessly.

The headless CLI path (`play`, `simulate`, `replay`, `eval`) is built **before** the
UI and remains the reference client forever.

---

## 3. Frontend

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + React | One framework gives the UI and the server-side API routes the Director needs (API keys never reach the browser); proven in our reference builds |
| Styling | Tailwind CSS | Fast, consistent, no CSS sprawl |
| Client state | Zustand (single store) | Simple mirror of engine state + UI toggles; the engine state object remains the truth |
| Rendering | DOM/CSS grid with Unicode/tile glyphs | Content is data, not assets; readable and cheap. Canvas/WebGL only if a measured perf problem appears |
| Targets | Desktop browser, keyboard-first | No mobile, no touch, no PWA in MVP |

UI surfaces in scope: game grid + HUD + message log, structured action input
(keyboard), dungeon diary (post-run recap), artifact viewer (manifests, gates,
rejections — read-only).

---

## 4. Backend / Server

- **Next.js API routes (Node runtime)** are the only server. They host exactly two
  concerns: Director generation requests and run persistence. No auth, no accounts,
  no sessions in MVP — single local player.
- The server is **stateless between requests** except through the persistence layer
  (§5). All game-turn logic stays client-side against the engine library; the server
  is only consulted at floor boundaries (generation) and run boundaries (memory).
- Long-running work (floor generation) is fire-and-forget with polling or streaming —
  generation for floor N+1 starts when the player enters floor N, so latency hides
  behind play.
- The CLI shares the same harness code paths, not HTTP — the server is a thin
  transport, never the home of logic.

---

## 5. Data & Persistence

Two kinds of data, two storage answers:

| Data | Store | Notes |
|---|---|---|
| Structured live state: run memory, dungeon's cross-run memory of the player, profile, run index | **SQLite** (better-sqlite3), single local file | Queryable, transactional, survives restarts, zero infra |
| Artifacts: floor manifests, gate reports, playthrough traces, eval reports, dungeon diaries | **Flat files** under `runs/` — JSON for documents, NDJSON for traces, Markdown for human-facing reports | Greppable, diffable, inspectable; the audit trail is the filesystem |

Rules:
- Artifacts are **append-only evidence**: regenerate, never hand-edit (AGENTS.md
  invariant). SQLite holds nothing that can't be rebuilt or exported.
- Every artifact carries: schema/protocol version, engine version, model id, seed,
  and timestamps — enough to replay or attribute any run exactly.
- No hosted DB, no ORM. A thin repository module wraps SQLite; raw SQL is fine.

---

## 6. AI / Director Stack

- **Provider seam: Vercel AI SDK** (`generateObject`/structured output) as the
  abstraction over providers. Swapping models is a config + eval run, not a refactor
  (NORTH_STAR §8). Direct provider SDKs are allowed only inside the seam if the AI
  SDK blocks a needed capability.
- **Default models**: a frontier model for the Director (quality-critical, low call
  volume — one call per floor), a cheap/fast model for LLM-judge gates and bot
  players. Exact ids live in config, never in code, and are chosen by eval results.
- **Schemas: Zod is the single source of truth**, converted to JSON Schema for
  provider calls. Known landmines from the Guildmaster build apply: no root-level
  unions, every declared property required (nullable placeholders over optionals),
  `additionalProperties: false` throughout. Every schema gets a **live provider
  contract test** before pipeline code is built on it (AGENTS.md rule).
- **Gauntlet placement**: gates 0–2 (structure, legality, simulated playability) are
  pure deterministic code in the harness — no LLM. Gate 3 (quality) uses heuristics
  first, LLM-judge only where heuristics can't reach.
- **Budget posture**: one Director call per floor + bounded repair retries (cap: 2).
  Token/cost per floor is a tracked eval metric from day one.
- API keys live in `.env` (gitignored), documented in `.env.example`, server-side
  only. The engine and the gameplay loop must run with no keys present.

---

## 7. Repository Layout (boundaries = ownership)

Folder boundaries are agent task boundaries — briefs assign ownership by these paths.

```
src/engine/      pure game library: state, actions, combat, RNG, render   (no imports from elsewhere)
src/schemas/     Zod schemas + content vocabularies (effects, behaviors)  (imported by everyone)
src/director/    prompts, provider seam, manifest generation
src/gauntlet/    gates 0–3, repair loop, fallback selection
src/harness/     run recording, bots, replay, persistence repositories
src/evals/       persona bank, eval runners, scoring, regression thresholds
src/cli/         play / simulate / replay / eval commands
app/             Next.js UI + API routes (thin client + thin transport)
content/         handcrafted fallback packs, vocabulary data
runs/            generated artifacts (gitignored above a size threshold; sample runs kept)
phase-plans/     implementation contracts
docs/            ADRs, runbooks, feature docs
```

Dependency direction: `engine ← schemas`-only at the bottom; `director`, `gauntlet`,
`harness` may use `engine` + `schemas`; `app` and `cli` may use anything below them;
nothing imports from `app` or `cli`.

---

## 8. Testing & Evals

| Layer | Tool | Scope |
|---|---|---|
| Unit / integration | Vitest | Engine rules, schema validation, gauntlet gates, reducers — fast, no network |
| Determinism | Vitest property-style tests | Same seed + same inputs = same run, byte-for-byte |
| LLM contract | Vitest, tagged `@live`, excluded from default runs | One real call per schema: provider accepts shape, output parses |
| E2E | Playwright, exactly one happy path | Boot UI → play a floor → see generated content land |
| Evals | Custom CLI runner in `src/evals/` | Persona bank → Director → scored on validity, solvability, difficulty band, novelty, responsiveness, latency, cost (NORTH_STAR §5) |

Test-fidelity hierarchy (a Guildmaster lesson, now law): schema unit tests → mocked
pipeline tests → **live contract tests** → live end-to-end. Mocked green is not
proof a provider accepts anything.

CI (GitHub Actions):
- Every PR: `pnpm run check` + mocked eval smoke. No live API calls, no secrets.
- Manual/nightly: live contract tests + full eval suite against current config;
  eval-threshold regressions block Director-related merges.

---

## 9. Determinism & Versioning Rules

- All randomness flows through one injected, seeded RNG. No `Math.random`, no
  `Date.now()` inside engine or gauntlet simulation; clocks are injected.
- Replays are first-class: a recorded seed + manifests + action trace must reproduce
  a run exactly. CI keeps a golden-seed replay test.
- Content vocabularies and the manifest schema carry an explicit **protocol version**;
  manifests are stamped with it, and the gauntlet rejects version mismatches rather
  than guessing.
- Engine changes that alter outcomes for an existing seed are breaking changes:
  flagged in the PR, golden seeds re-baselined deliberately, never silently.

---

## 10. Explicit Non-Choices (MVP)

Decided against, to keep relitigating cheap:

- No game engine frameworks (Unity, Godot, Phaser) — the engine is plain TS. This
  follows directly from the agent-operability constraint: Unity-class engines keep
  much of their capability behind GUI editors, scene graphs, and binary assets that
  a headless coding agent can neither fully drive nor verify. An agent could use
  maybe a fifth of Unity through scripts alone; it can use **all** of a plain-TS
  engine — read it, change it, simulate a thousand seeded runs, and prove the change
  worked, with no human clicking anything in between.
- No hosted databases, queues, or caches — SQLite + files.
- No Docker — `pnpm install && pnpm dev` is the whole setup.
- No auth/accounts — single local player.
- No ORM, no GraphQL, no microservices — one repo, one process (plus Next dev server).
- No streaming LLM output into gameplay — floors arrive whole and validated or not
  at all.
- No asset pipeline — glyphs and text until the core is unambiguously fun.

Each of these is reversible later; none is reversible cheaply mid-MVP.
