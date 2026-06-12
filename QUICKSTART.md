# Quickstart

A roguelike where an AI writes each dungeon floor *for you, about you* — and a
gauntlet of validators makes sure it can never break the game.

## 30 seconds — play offline (no auth, no keys)

```bash
git clone https://github.com/KeigoShimadaCC/generative-gaming.git
cd generative-gaming
pnpm install
pnpm run play
```

Arrows move · move into enemies to fight · `g` pick up · `i` inventory ·
`>` descend on stairs · reach floor 12 and take one thing from the Hoard.

## 2 minutes — the real thing (AI-generated floors, still $0)

```bash
codex login        # local ChatGPT auth; no API key
PORT=3001 pnpm run dev
```

Open <http://localhost:3001>. Each floor below you is being authored live by
an AI Director that has read how you play — hoard items and it notices; flee
fights and it notices that too. Floors generate in the background while you
play, pass four validation gates, and fall back to handcrafted content
invisibly if anything fails.

**Press `Tab` mid-run** to see the machinery: the dungeon's diary about you,
and every AI generation with its prompts, gate verdicts, and rejections.

## 1 minute — watch a bot play on live AI floors

```bash
pnpm run simulate -- --policy balanced --seed demo-1 --director ambient
```

## Where to go next

- [README.md](./README.md) — full architecture, commands, controls
- [NORTH_STAR.md](./NORTH_STAR.md) — why this exists
- `runs/` after any session — every trace and AI artifact, inspectable
