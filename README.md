# Generative Gaming

[![ci](https://github.com/KeigoShimadaCC/generative-gaming/actions/workflows/ci.yml/badge.svg)](https://github.com/KeigoShimadaCC/generative-gaming/actions/workflows/ci.yml)

A finite, seeded, turn-based roguelike where the dungeon can be authored between floors by an ambient AI Director. The engine never calls an LLM. Director output is untrusted content that must pass schemas, legality checks, simulations, and quality gates before deterministic code applies it. If anything fails, the game serves the built-in fallback pack and stays playable offline.

The headline: ambient Director inference is a $0 local path through the Codex CLI. No provider API key is required for the demo path; `codex login` supplies local auth, and the same gauntlet persists manifests, gate reports, rejected generations, and fallbacks as inspectable artifacts.

**New here? [QUICKSTART.md](./QUICKSTART.md) gets you playing in 30 seconds.**

Demo GIF placeholder: record the seven-beat flow in [docs/demo-script.md](./docs/demo-script.md) after the human rehearsal pass.

## 60-Second Thesis

Generative content is only useful if the world remains fair, finite, and debuggable. This repo separates creative intent from world physics: the Director may invent names, themes, enemies, items, quests, and narration, but it cannot mutate state, change rules, or bypass playability. The schema is the physics boundary; the gauntlet is the shipping gate; artifacts are the receipt.

## Architecture

```text
Player keys / bots
      |
      v
Deterministic engine  <----- fallback content pack
      |
      | floor request between turns
      v
Director prompt + trace memory
      |
      v
Ambient Codex CLI or mock provider
      |
      v
Gauntlet: schema -> legality -> bot simulation -> quality
      |
      +--> accepted manifest -> deterministic materializer -> next floor
      |
      +--> repair attempts -> fallback floor
      |
      v
runs/ artifacts: prompts, raw output, manifests, gates, outcomes
```

Layer 1 is trusted TypeScript: movement, combat, status effects, hunger, quests, win/loss, rendering, trace replay, and bots. Layer 2 is untrusted generation: it produces bounded manifests and never state deltas. The gauntlet is the contract between them.

## Setup

Prerequisites: Node 24, pnpm 10.28.x, and a shell with `codex` on `PATH` for ambient mode.

```bash
git clone https://github.com/KeigoShimadaCC/generative-gaming.git
cd generative-gaming
pnpm install --frozen-lockfile
```

Offline play needs no auth and no `.env`:

```bash
pnpm run play
```

For the browser demo:

```bash
codex login
PORT=3001 pnpm run dev
```

Open `http://localhost:3001`. If Codex auth or the ambient process is unavailable, floor transitions degrade through mock/fallback content instead of blocking play. Keep only one Codex process active at a time on this machine; ambient evals and ambient gameplay should not overlap.

## Demo Through-Line

The target five-minute demo follows [NORTH_STAR.md](./NORTH_STAR.md) section 6:

1. Start a run and show the gentle first floor.
2. Play a few floors and show content bending toward the trace.
3. Meet an NPC whose quest only makes sense for this run.
4. Hit the signature invention.
5. Finish the run or force a terminal state and read the diary.
6. Start a second run and show memory in the opening.
7. Open artifacts and inspect manifests, gates, rejects, and fallback evidence.

Use [docs/demo-script.md](./docs/demo-script.md) for exact keys, expected outcomes, and recovery notes for the ambient and mock/fallback variants.


## Commands

| Command | What it does |
|---|---|
| `pnpm run play` | Play in the terminal, fully offline (`-- --seed <name>` to name a run) |
| `PORT=3001 pnpm run dev` | Browser game; ambient Director if `codex login` is active |
| `pnpm run simulate -- --policy balanced --seed s1` | A bot plays a full run headlessly |
| `pnpm run simulate -- --policy balanced --seed s1 --director ambient` | A bot plays on live AI-generated floors |
| `pnpm run replay -- <trace.ndjson> --watch` | Re-render any recorded run turn by turn |
| `pnpm run evals -- --mode mock --n 1` | The eval suite against the mock provider |
| `pnpm run check` | The full gate: typecheck + lint + 530+ tests |
| `pnpm run e2e` | The single Playwright happy path (host-side) |

## Controls (browser & CLI)

| Key | Action |
|---|---|
| Arrows / WASD / vi-keys | Move (8-way; moving into an enemy attacks, into an NPC talks) |
| `g` | Pick up |
| `i` / `q` / `x` | Inventory / quest log / inspect cursor |
| `.` | Wait · `>` descend (on stairs) |
| `Tab` | The second layer: dungeon diary + AI artifact viewer |
| `Esc` | Close panel; at top level, abandon the run (with confirm) |
| `?` | Full keymap |

## Project Structure

```text
src/engine/     pure deterministic game library (never calls an LLM)
src/schemas/    Zod content vocabularies — the Director's entire language
src/director/   prompts, provider seam (mock | ambient codex), materializer
src/gauntlet/   gates 0–3 + repair loop (the shipping gate for AI output)
src/harness/    traces, replay, bots, artifacts, persistence, diary composer
src/evals/      personas, metrics (incl. novelty + responsiveness), runner
src/cli/        play / simulate / replay
app/            Next.js UI (thin client over the same engine the bots use)
content/        the handcrafted Old Stock fallback pack (12 floors)
runs/           generated evidence: traces, generation artifacts, eval reports
phase-plans/    the 73 implementation contracts this repo was built from
```

## How This Repo Was Built (the second experiment)

This codebase was built almost entirely by orchestrated coding agents — a
Claude orchestrator dispatching Codex and Cursor workers through a scripted
harness over ~2 days: 73 planned phases, 140+ logged worker sessions, ~300M
worker tokens at $0 marginal cost, every merge independently verified. The
full story is in the repo:

- [AUTOMATION_FINDINGS.md](./AUTOMATION_FINDINGS.md) — what worked, what bit, and the next-time blueprint
- [docs/ORCHESTRATION_LOG.md](./docs/ORCHESTRATION_LOG.md) — the timestamped decision log
- [scripts/ledger.tsv](./scripts/ledger.tsv) — every worker session: duration, tokens, exit code
- [runs/milestones/](./runs/milestones) — evidence reports for M0/M1/M2 + the human checklist

## Milestone Status

| Milestone | Status |
|---|---|
| M0 — playable skeleton, offline | Mechanical evidence complete; human ratification pending (`pnpm run play`) |
| M1 — the Director lives | **MET** (5/5 live generations served under honest gates, ~25s median) |
| M2 — it reads you | **MET (mechanical)** — responsiveness 5%→55% same-persona; human session pending |
| M3 — it's actually fun | Awaiting real-player sessions (see `runs/milestones/HUMAN-CHECKLIST.md`) |

## Evals And Gates

CI runs the same gates expected locally:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run check
```

The PR gate also runs a mocked eval smoke and compares the report against committed thresholds:

```bash
pnpm run evals -- --mode mock --n 1 --eval-id ci-mock-baseline
pnpm dlx tsx tests/eval-baselines/compare.ts \
  tests/eval-baselines/mock-baseline.json \
  runs/evals/ci-mock-baseline/report.json
```

Ambient evals are host-local because they require Codex CLI auth and serialized execution:

```bash
pnpm run evals -- --mode ambient --n 1
```

See [docs/runbooks/evals.md](./docs/runbooks/evals.md) for the re-baseline and ambient runbook.

## Doc Spine

- [NORTH_STAR.md](./NORTH_STAR.md): product thesis, invariants, demo through-line.
- [TECH_SPEC.md](./TECH_SPEC.md): implementation contracts and protocol-level decisions.
- [GAME_DESIGN.md](./GAME_DESIGN.md): mechanics, balance targets, content vocabulary.
- [UX.md](./UX.md): interface intent and demo experience.
- [WORLD.md](./WORLD.md): fiction and tone constraints.
- [AGENTS.md](./AGENTS.md): worker contract for Codex, Cursor Agent, and subagents.
- [ENVIRONMENT.md](./ENVIRONMENT.md): sandbox and tool facts.
- [phase-plans/](./phase-plans): phase contracts and acceptance criteria.
- [docs/adr/](./docs/adr): concise records for load-bearing decisions.

## Honest Cuts

- Bot WIN-drive is still weak: fallback batches can reach terminal states, but final-floor victory seeking needs another pass.
- Balance is pending calibration because the current bot/enemy behavior path does not yet expose enough combat pressure.
- The completionist detector is still shallow and should not be treated as a durable taste signal.
- Browser e2e depends on host Playwright/Chromium setup; Codex sandbox verification uses `pnpm run check` and delegates e2e to the orchestrator.
