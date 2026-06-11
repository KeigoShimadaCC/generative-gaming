# UX.md — How the Game Feels to Play

This document describes the player's experience of the *machine*: screens, input,
rhythm, feedback, and information. It deliberately ignores fiction, tone, and naming
(NORTH_STAR §1 owns those). If NORTH_STAR is what we're making and TECH_SPEC is what
it's made of, this is what it's like to sit in front of it.

Design stance in one line: **a fast, keyboard-driven, text-dense roguelike that feels
instant to play — with the AI's work surfaced as a quiet second layer you can always
pull open, and never forced to wait on.**

---

## 1. The Screen

One screen, no scrolling, desktop browser, dark by default. Three fixed regions:

```
┌────────────────────────────────────────────┬──────────────────────┐
│                                            │  HUD                 │
│                                            │  depth · turn · HP   │
│                THE GRID                    │  status · resources  │
│         (tile glyphs, the world)           ├──────────────────────┤
│                                            │  CONTEXT PANEL       │
│                                            │  inspect · inventory │
│                                            │  quest · dialogue    │
├────────────────────────────────────────────┴──────────────────────┤
│  MESSAGE LOG (last ~6 lines, full history one keypress away)      │
└────────────────────────────────────────────────────────────────────┘
```

- **The grid** is the protagonist of the screen. Generous cell size, one glyph per
  entity, color carries meaning (hostile / friendly / item / terrain / you). Unseen
  tiles are dark, remembered tiles are dimmed, visible tiles are lit — the classic
  three-state fog, readable at a glance.
- **The HUD** is glanceable, not studied: depth, turn count, HP as number + bar,
  active statuses as small labeled chips, key resources. Anything that changed this
  turn pulses once.
- **The context panel** is one space with modes (inspect, inventory, quest log,
  dialogue). Only one mode visible at a time; the panel never stacks windows.
- **The message log** narrates every turn in one terse line per event. It is the
  game's voice; if something happened, it is in the log, always.

No modals over the grid during normal play. The player's eyes never need to leave
the grid to know they're safe; they look right when they want detail.

## 2. The Input Model

Keyboard-first, single-keystroke verbs, zero chording. The mouse works (click to
move/inspect) but everything is reachable without it.

- **Arrows / WASD / vi-keys** — move (moving into an enemy attacks; into an NPC,
  talks; into an item, steps on it).
- **g** — pick up · **i** — inventory · **q** — quest log · **x** — inspect mode
  (cursor roams the grid; every entity has a card) · **.** — wait · **>** — descend.
- **Enter / Esc** — confirm / cancel, universally, no exceptions.
- **Tab** — toggle the diary/artifact layer (§7). **?** — the full keymap, one page.

Rules the engine UI must obey:

1. **Every keypress responds within one frame.** A turn resolves synchronously in the
   client-side engine; there is no spinner anywhere in moment-to-moment play, ever.
2. **Illegal inputs are explained, not eaten.** Bumping a wall says so in the log.
   A disabled action shows *why* ("too heavy to throw") in its menu entry.
3. **Dangerous turns ask once, inline.** Stepping into visible lava or attacking a
   friendly prompts a one-line confirm in the log area ("Really? y/n") — not a modal.
4. **Menus are lists, not trees.** Inventory and dialogue are flat, number-or-arrow
   selectable, one level deep. Anything deeper is a design failure.

All input produces **structured actions** under the hood — the same actions bots use.
If a thing can be done, it appears in a menu or has a key; there is no hidden verb
and no free-text input during play.

## 3. The Turn Rhythm

The core loop runs at the speed of thought:

> glance at grid → press key → world steps once → log line appears → glance → press.

A practiced player takes 5–10 turns in ten seconds; the UI must never be the reason
that rhythm breaks. Animation is therefore *subordinate to* tempo: a melee hit is a
one-frame flash and a floating number; movement is instant repositioning with a
~50ms ease; effects never queue input. Holding a direction key auto-repeats moves
and auto-stops on anything notable (enemy sighted, item underfoot, HP threshold) —
the roguelike "travel" convention, conservative by default.

When several things happen in one turn (you move, two enemies act, a status ticks),
the log renders them as discrete ordered lines in deterministic engine order, and
the grid shows the end state. The player can always reconstruct *what just happened*
from the log alone.

## 4. Knowing Things: Inspection as a First-Class Verb

Generated content means the player constantly meets entities they have never seen.
The UX answer is total inspectability:

- **x + cursor** over anything shows its card in the context panel: glyph, name,
  one-line descriptor, known stats, known abilities, and — crucially — *what the
  player has learned vs. not* ("unidentified: effect unknown").
- Items follow identify-by-use: an unknown item's card says exactly what is unknown.
  Once used anywhere in this run, knowledge persists for the run.
- Enemy cards accumulate observed facts ("hits for 4–6", "fled at low HP") rather
  than revealing the stat block — the engine tracks what the player has witnessed.
- Hovering (mouse) anywhere shows the same card. No information requires the wiki
  that doesn't exist.

The contract: **the player may be surprised by content, never by rules.** Anything
the engine knows and fairness requires, the player can look up in two keypresses.

## 5. Talking and Questing (the Structured Kind)

Dialogue is a context-panel mode, not a cutscene. Walking into an NPC opens their
card: portrait glyph, name, their lines rendered as short paragraphs, and a flat
list of 2–5 numbered replies. Replies are choices, not text entry. Esc leaves
mid-conversation; the world is paused while talking (it is still your turn).

The quest log (q) lists active and completed objectives as checklist lines, each
with a "where/what" hint and a marker on the grid when the target is on the current
floor. Quest state changes announce themselves in the message log and pulse the HUD
chip — quests never advance silently.

## 6. Floor Boundaries: Where the AI Hides

The only place the AI could make the player wait — and the UX exists to make sure
it never does.

- Generation for floor N+1 begins the moment the player arrives on floor N
  (TECH_SPEC §4). Median play time per floor exceeds generation time by design.
- Taking the stairs plays a short, interruptible transition beat (1–2s): floor
  number, a one-line whisper of what's below. In the common case the next floor is
  already validated and waiting, and the transition is pure theater.
- If generation *hasn't* finished: the transition holds up to a hard cap (~8s) with
  a subtle progress shimmer, then the gauntlet's fallback floor serves instead.
  The player sees a normal floor either way. **There is no "AI is generating"
  spinner, no error toast, no broken floor — degradation is invisible at the table
  and loud only in the artifact log.**
- Floor arrival is a small ritual: grid fades in from the entrance outward, the log
  prints the floor's one-line introduction, quest chips update. Three seconds of
  orientation, then the rhythm resumes.

## 7. The Second Layer: Diary and Artifacts (Tab)

Play never requires this layer; curiosity is rewarded by it. Tab flips the whole
screen (game is paused) to a two-tab surface:

- **Diary** — a human-readable, scrolling recap of the run so far: per floor, what
  was notable, written for the player. After death/victory this becomes the full
  post-run diary (§8).
- **Artifacts** — the engineer's view, read-only: each floor's manifest, which gates
  it passed, what was rejected or repaired, fallbacks used, model id, timings. A
  tree of plain documents, searchable, with a copy button. This is the
  "machinery behind the magic" view from NORTH_STAR §6 — present for every run,
  demo-ready by default.

Tab again returns exactly where you were. The layer is one keypress away and zero
keypresses in the way.

## 8. Dying, Winning, and Starting Again

Permadeath is honest but never abrupt:

- The killing turn plays at full readable speed — the log shows exactly what killed
  you; no "you died" before you saw why.
- The death/victory screen is the **diary**, led by a summary strip (depth reached,
  turns, kills, discoveries) and followed by the floor-by-floor recap. One more
  screen follows: a short "what the dungeon learned" note — explicit, readable
  evidence that the next run starts informed (the cross-run memory made visible).
- One key starts the next run. Time from death to moving on a new floor 1: under
  ten seconds, no menus in the way. A run's diary and artifacts remain browsable
  from the title screen's run index.

The title screen itself is minimal: continue / new run / run index / settings.
Settings fit one screen: volume-less (no audio in MVP), keybinding view, glyph size,
color theme, message-speed and auto-travel toggles.

## 9. First Five Minutes (Onboarding Without a Tutorial)

No tutorial mode, no instructional overlays. Instead:

- Floor 1 of any first run is mechanically gentle (engine guarantee, not AI
  goodwill) — few enemies, safe geometry, one of everything to learn on.
- The first time each verb becomes relevant, the log offers a one-line hint
  ("an item lies here — g to pick it up"), each hint shown once per profile, all
  hints killable in settings.
- **?** shows the keymap; **x** answers everything else. A player who has played
  any roguelike is fluent in sixty seconds; a player who hasn't is fluent on
  floor 2.

## 10. Feel, Accessibility, and Non-Negotiables

- **Latency budget:** input-to-grid-update < 16ms; stairs-to-playable < 2s typical,
  8s worst case (then fallback). These are tested numbers, not aspirations.
- **Readability:** glyph size adjustable; color is never the *only* channel (shape
  and label always accompany it); the log is plain selectable text; full play is
  possible at 125% browser zoom.
- **Trust:** the log never lies and never omits — every state change the player can
  perceive has a log line; replays (from the run index) re-render any past run
  turn-by-turn from its trace, with the same UI.
- **Quiet failure:** the player never sees a stack trace, a malformed floor, or an
  apology toast. The game's failure mode is "slightly less personal content,"
  full stop.

The sentence to test every UI decision against:

> **The grid answers "what is happening," the log answers "what just happened,"
> the cards answer "what is this," and Tab answers "how was this made" — each in
> at most two keypresses, and none of them ever makes the player wait.**
