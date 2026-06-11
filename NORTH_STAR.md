# Generative Gaming — North Star

> **Can an AI agent author a living game world at runtime — items, enemies, quests, NPCs,
> story — with enough freedom to genuinely surprise the player, while a deterministic
> engine and an eval harness keep the game playable, fair, and finite?**

This document is the project's fixed point. It explains what we are building, why it is
interesting, and what must never break. It deliberately stays at low technical resolution:
implementation contracts live in `AGENTS.md` and `phase-plans/` (to be authored next).

---

## 1. The Concept

We are building a **Mystery Dungeon-style (不思議なダンジョン) roguelike where the dungeon
is authored, floor by floor, by an AI Director while you play it.**

In a classic Mystery Dungeon game, procedural generation shuffles a fixed deck: the same
enemies, items, and floor layouts in new arrangements. Here, the deck itself is generative.
The AI Director invents new items, enemies, quests, NPCs, floor themes, and story beats at
runtime — but it can only express them through a strict, schema-validated content language
that a deterministic engine executes. The AI proposes; the engine disposes.

The one-line pitch: **a dungeon that reads you back.**

The Director watches *how* you actually play — your trace, not your words. Hoard
consumables and it sends enemies that punish hoarding and an NPC who mocks your full
pockets. Flee every fight and the dungeon grows narrow and pursuing. Talk to every NPC and
the story deepens around the characters you favored. Die, and your next run descends into a
dungeon that remembers the last one. No two players experience the same dungeon, because
the dungeon is, in a real sense, *about them*.

### Working fiction (revisable)

Working title: **Everdeep**. The dungeon is a vast, formless entity that shapes itself
around each delver who enters — part labyrinth, part storyteller, part adversary. The
deeper you go, the more it knows you, and the more personal its inventions become. The
fiction is intentionally thin scaffolding: it justifies "the dungeon adapts to you" inside
the story itself, so the AI's authorship is a feature of the world rather than a mechanic
bolted onto it. Tone, naming, and story arc are decided later and are not load-bearing
for the architecture.

---

## 2. Why This Genre (Bottom-Up Reasoning)

We chose the genre from technical constraints first, exactly as instructed, and then made
sure the constraints themselves produce the fun.

A turn-based, grid-based, tile/text-rendered roguelike is the genre where today's LLMs and
agent tooling are strongest and weakest in the right places:

- **Turn-based** — no real-time latency pressure. The Director can think for seconds
  between floors without the player ever waiting, because generation happens in the
  background while the current floor is being played.
- **Grid + structured actions** — game state is small, serializable, and inspectable.
  Both humans and bot players consume the same structured action interface, which makes
  automated evaluation (and agent-driven QA) cheap and honest.
- **Seeded determinism in the engine** — the engine's randomness is reproducible. The only
  nondeterministic component is the Director, and its output is captured as an artifact, so
  every run can be replayed exactly.
- **Floor boundaries** — natural generation checkpoints. Each floor is a self-contained
  content unit that can be validated, simulated, and rejected *before* the player sets foot
  on it. This is what makes runtime AI freedom safe.
- **Tile/text-first rendering** — content is data, not assets. An AI-invented enemy needs a
  glyph, stats, and behavior parameters — not a sprite sheet. This is what makes runtime AI
  freedom *cheap*.

The genre's native expectations also align with generative content: roguelike players
already expect unfamiliar items with unknown effects, identify-by-use, permadeath, and
runs that tell their own stories. AI-invented content feels like a deepening of the genre,
not a gimmick on top of it.

### Where the "genuinely interesting" lives

1. **Gameplay**: adaptive content keeps the difficulty curve and tactical texture personal.
   The Director's job description is "be a great dungeon master," not "be hard" — surprise,
   tempo, and fairness over raw challenge.
2. **Scenario**: emergent personal narrative. Quests, NPCs, and story beats are written in
   response to your actual deeds, and the dungeon's memory persists across runs. The story
   is not branching — it is *grown*.
3. **Spectacle**: every floor manifest is an inspectable artifact. "Show me what the AI
   invented for me and why" is itself part of the experience — a post-run "dungeon diary"
   that recaps what the Director made of you.

---

## 3. The Two-Layer World Model

The architecture has exactly one big idea, inherited from our reference projects and
sharpened: **separate creative intent from world physics.**

### Layer 1 — The Engine (deterministic, hand-written, trusted)

A finite, turn-based, seeded roguelike engine. It owns movement, combat resolution, line of
sight, item effects resolution, status effects, hunger/resources, win/loss, and rendering.
It is ordinary, well-tested software. It never calls an LLM. The game is fully playable
offline against a built-in fallback content pack — the AI is an enhancement, never a
runtime dependency for taking the next turn.

### Layer 2 — The Director (generative, AI, untrusted)

An LLM agent that authors content *between* floors, expressed only in a bounded content
language (the "floor manifest"): layout parameters, enemy definitions, item definitions,
NPC definitions with finite dialogue, quest definitions, event scripts, and narration. The
Director reads the player's trace and the run's memory, and writes the next floor.

Every manifest passes through a gauntlet before the player sees it (Section 5). A manifest
that fails any gate is repaired or replaced by fallback content — the player never sees a
broken floor, only a slightly less personal one.

### The freedom spectrum

"More freedom than Mystery Dungeon" is the point, so we are explicit about where freedom
lives:

| The Director MAY invent | The Director may NOT touch |
|---|---|
| New items: names, glyphs, effects composed from an effect vocabulary | The effect vocabulary itself (engine-owned verbs) |
| New enemies: stats, behavior parameters, abilities from a behavior vocabulary | Combat math, turn order, engine rules |
| New NPCs with finite dialogue and barter | Unbounded free-chat NPCs (post-MVP, behind the same gates) |
| Quests referencing real entities on real floors | Quests requiring entities that don't exist (integrity-checked) |
| Floor themes, layout parameters, events, narration | Map solvability (validated), player stats, inventory (engine-owned) |
| Story beats, callbacks, run-to-run memory hooks | Win/loss conditions, the existence of an ending |

The deliberate design bet: **composable vocabularies give the feeling of unbounded
invention with the safety of bounded execution.** A vocabulary of a few dozen effect and
behavior primitives, composed freely with AI-authored parameters, names, and fiction,
yields a combinatorial space no content team could exhaust — and every point in it is
something the engine already knows how to run.

---

## 4. Core Invariants (Never Break These)

1. The game is **finite** — explicit `WIN` / `LOSS` / `ABORTED` terminal states, fixed
   maximum depth per run.
2. The game is **turn-based** with **structured actions** — no real-time input, no
   free-text gameplay commands.
3. The engine is **deterministic and seeded** — identical seed + identical manifests +
   identical actions = identical run.
4. **AI output never mutates state directly.** It is parsed, validated, simulated, and
   applied by deterministic code, or it is discarded. The schema is the world's physics.
5. The game is **playable with zero API calls** — fallback content packs make the AI
   optional at runtime, mandatory only for the magic.
6. Every Director generation is **persisted as an inspectable artifact** — manifest in,
   gates passed, content out. Evidence over vibes.
7. **Playability is gated, not hoped for** — no floor reaches the player without passing
   the validation gauntlet.
8. The Director **cannot make the game unfinishable, unfair, or unfun by fiat** — bounds
   on stats, economy, and difficulty are enforced outside the model.

---

## 5. Harnessing the AI: The Gauntlet and the Evals

This is the project's center of gravity. Generative freedom is only worth having if the
game stays playable, so the harness is a first-class product, not test infrastructure.

### Runtime gauntlet (every floor manifest, every time)

- **Gate 0 — Structure.** Schema validation. Malformed output is rejected outright.
- **Gate 1 — Legality.** Referential integrity (every quest target, NPC, and item the
  manifest mentions actually exists in it or in the run) and hard bounds (stats, economy
  values, counts, text lengths all inside engine-enforced ranges).
- **Gate 2 — Playability.** The floor is simulated before it is served: a path to the
  stairs exists, quest objectives are reachable, and a small ensemble of scripted bot
  players completes the floor within a survivability band. Floors that are unwinnable or
  trivially empty are rejected.
- **Gate 3 — Quality.** Coherence and novelty checks: tone fits the run's fiction, content
  is not a near-duplicate of recent floors, difficulty trend fits the run's curve. (Cheap
  heuristics first; LLM-judge where heuristics can't reach.)
- **Fallback.** A bounded repair loop, then graceful degradation to handcrafted content.
  Failure is invisible to the player and loud in the logs.

### Offline eval suite (every change to prompts, models, or schemas)

A standing benchmark, run in CI and before any Director change ships:

- A bank of recorded player traces and personas (hoarder, pacifist, speedrunner,
  completionist, chaos gremlin) is fed to the Director.
- Scored on: **validity rate** (gates 0–1), **solvability rate** (gate 2), **difficulty
  band accuracy** (bot survival within target band), **novelty** (distance from content
  bank and from the trace's previous floors), **responsiveness** (does the floor measurably
  reference the trace it was given?), **latency and cost** per floor.
- Thresholds are regression gates: a prompt "improvement" that drops solvability does not
  merge.
- Periodic agent-played full runs (an LLM player completing whole games) as an end-to-end
  smoke of fun, not just function.

A model or prompt change is treated exactly like a code change: benchmarked, compared,
accepted on evidence.

---

## 6. The Player Experience (Demo Through-Line)

The five-minute experience the whole project optimizes for:

1. Start a run. Floor 1 is gentle and watchful — the dungeon is learning you.
2. Play a few floors. Notice the content bending: the items lean toward your style, an
   enemy appears that counters your habit, narration nods at something you actually did.
3. Meet an NPC who references your deeds and offers a quest that only makes sense for
   *this* run.
4. Hit the mid-run signature moment: the Director makes one bold, personal invention —
   a named rival, a cursed gift, a floor built around your weakness.
5. Win or die. Read the dungeon diary: what was invented for you, and what the dungeon
   inferred about you to invent it.
6. Start a second run. The dungeon remembers the first. The opening narration proves it.
7. (For technical audiences) Open the artifact viewer: manifests, gates, rejected
   generations, fallbacks — the machinery behind the magic, fully inspectable.

---

## 7. How We Build It: Agents Building the Agent Game

The project is also an exercise in agentic development. Two agent populations, two
timescales:

- **Runtime agent** — the Director, inside the game, generating content for players.
- **Build-time agents** — **Codex** and **Cursor Agent (composer-2.5)** writing and testing
  the game itself, orchestrated by Claude Code as planner/integrator.

Division of labor for build-time agents:

- **Codex**: large bounded implementation phases — engine subsystems, the gauntlet, the
  Director pipeline — and deep debugging or second-opinion passes when stuck.
- **Cursor Agent (composer-2.5)**: parallel small bounded tasks — single test files,
  verification passes, localized fixes, lint/typecheck sweeps — fanned out concurrently.
- **Human (Keigo)**: phase plan approval, PR merges, taste decisions on fun and fiction.

Process rules inherited from the reference projects' battle scars (see
`references/guildmaster_working_doc.docx` findings — kept out of git, lessons kept in
heads and in `AGENTS.md`):

1. **Phase plans are contracts.** Bite-sized phases with explicit completion criteria,
   each stating what is IN and OUT of scope. Agents do not treat completion criteria as
   a starting point for exploration.
2. **Live contract tests run first** in any LLM-integrated phase. Mocked tests cannot
   catch a provider rejecting your schema; one real API call at subtask 1 can.
3. **One writer per file.** Parallel agents work in isolated worktrees; an auditor pass
   reviews each phase before the human merges. No merge before audit.
4. **Evidence-based acceptance.** Agent self-report is not proof. Tests, simulated runs,
   and eval scores decide whether a phase is done.
5. **The harness validates the game; the game never validates itself.**

---

## 8. Technical Direction (Coarse, On Purpose)

Decisions at north-star resolution only; `phase-plans/` will pin versions and details.

- **TypeScript, strict mode, local-first.** Engine, gauntlet, Director pipeline, and evals
  all run on a laptop with no external infrastructure beyond LLM APIs.
- **Engine and harness are a headless library first.** The UI is a thin client over the
  same structured interface bots use.
- **UI: web-based, tile/text rendering.** Readable, atmospheric, asset-light. Juice later.
- **Schemas authored once** (Zod or equivalent) and used everywhere: LLM structured output,
  validation, persistence, and tests share one source of truth.
- **Model-agnostic Director seam.** The Director is a prompt + schema + gauntlet behind an
  interface; swapping models is an eval run, not a refactor.
- **Artifacts as flat files.** Runs, manifests, traces, and eval reports are plain
  inspectable files — the audit trail is greppable.

---

## 9. Scope: What We Are Not Building (MVP)

- Real-time anything. No action combat, no animation-timing gameplay.
- Graphics pipelines: no generated images, sprites, music, or voice as requirements.
- Free-text gameplay commands or unbounded NPC chat (candidate post-MVP, behind gates).
- Multiplayer, accounts, cloud saves, mobile, monetization.
- Engine-rewriting AI: the Director authors content, never code or rules.
- Infinite/endless modes — the game ends, every time.
- A second game/genre before the first one is fun.

When a tempting idea conflicts with this list, the move is the bounded translation:
"AI-animated cutscenes" becomes "Director-authored narration beats"; "NPCs you can talk to
about anything" becomes "finite dialogue authored per-run by the Director."

---

## 10. Success Criteria

**M0 — Playable skeleton.** The engine runs a complete, finite, seeded run with fallback
content, headless and in the UI, fully offline. Bots can play it end to end.

**M1 — The Director lives.** AI-generated floors pass the gauntlet and get played.
Validity and solvability rates measured. A floor visibly responds to the player's trace.

**M2 — It reads you.** Across a full run, persona-distinct players receive measurably
distinct content (responsiveness eval), the difficulty band holds, and the dungeon diary
correctly narrates what happened. Run-to-run memory works.

**M3 — It's actually fun.** Honest sessions with real players: the majority spontaneously
mention a moment the dungeon "knew them," and want a second run. Eval suite green in CI.

The single sentence to test every decision against:

> **If the player can't feel the dungeon responding to them, the AI freedom is wasted;
> if the player ever sees a broken floor, the harness has failed. Ship neither.**

---

## 11. Long-Term Vision (Not Now)

- Richer Director toolkit: multi-floor story arcs, faction systems, persistent NPCs.
- Free-form NPC conversation behind the same gauntlet discipline.
- The adversarial improvement loop from dungeon-forge, aimed at the Director: reviewer
  agents play runs and pressure prompt/vocabulary improvements with trace evidence.
- Community seeds: shareable run setups where the same dungeon "personality" reads
  different players.
- Visual and audio layers, once the text-first core is unambiguously fun.

---

*Repo: <https://github.com/KeigoShimadaCC/generative-gaming> · Companion docs to come:
`AGENTS.md` (operating rules for build-time agents) and `phase-plans/` (bite-sized,
in/out-scoped implementation contracts). `references/` is local-only and gitignored.*
