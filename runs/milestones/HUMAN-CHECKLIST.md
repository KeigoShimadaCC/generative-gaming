# Human Acceptance Checklist

Complete these in order. Do not change code while collecting this evidence; log
findings and decide follow-up scope after the verdict.

## 1. M0 Ratification - Offline CLI

Command:

```bash
pnpm run play
```

Pass note: playable offline CLI run starts and accepts structured controls.
Evidence target: update `runs/milestones/m0/report.md` or final verdict notes.

## 2. Grid Readability Eyeball - Browser Fixture

Commands:

```bash
PORT=3001 pnpm run dev
```

Open `http://localhost:3001`. Use the dev fixture state seeded by
`app/store/fixture.ts` (`phase-48-dev-fixture`) and inspect normal play, fog,
markers, HUD, log, panels, inventory/dialogue/quest views, and terminal states.

Pass note: the grid is readable without overlap or ambiguity.

## 3. M1 Review

Read:

```bash
runs/milestones/m1/report.md
```

Pass note: accept or reject the M1 human review pending line, especially whether
the responsiveness spot-proof visibly correlates with player trace content.

## 4. M2 Two-Run Live Session

Script from `runs/milestones/m2/report.md`:

```bash
pnpm run dev
```

Then:

1. Open `http://localhost:3001`.
2. Start run 1 and play it to death.
3. Start run 2 from the same browser profile.
4. On run 2, look for an opening recognition line that references run 1's death.
5. Press `Tab`, switch to `Artifacts`, and verify the artifact tree loads for the current run.

Record:

- Recognition line observed:
- `Tab` -> `Artifacts` loaded:
- Human feel verdict:

## 5. Detector Taste Review

Review:

```bash
src/evals/metrics/responsiveness.ts
```

Detector IDs to taste-review:

- `hoarder_item_density`
- `hoarder_thief_pressure`
- `hoarder_inventory_narration` (uncertain)
- `pacifist_route_options`
- `pacifist_soft_threats`
- `pacifist_caution_narration`
- `speedrunner_compact_floor`
- `speedrunner_near_entrance_loot`
- `speedrunner_pace_narration` (uncertain)
- `completionist_dialogue_depth`
- `completionist_quest_richness`
- `completionist_rich_callbacks`
- `chaos_behavior_diversity` (uncertain)
- `chaos_trap_variety` (uncertain)
- `chaos_content_variance` (uncertain)
- `chaos_varied_engagement` (uncertain)

Known taste questions to answer: completionist presence checks may be too
trivial; pacifist/speedrunner overlap may be too high; keyword narration
detectors may be gameable; chaos may measure provenance more than design.

## 6. Demo Rehearsals x2

Read and run twice:

```bash
docs/demo-script.md
```

Suggested preflight commands:

```bash
pnpm install --frozen-lockfile
codex login
PORT=3001 pnpm run dev
```

Also rehearse the mock/fallback variant without Codex auth:

```bash
pnpm install --frozen-lockfile
PORT=3001 pnpm run dev
```

Pass note: both rehearsals complete the script or document exact recovery points.

## 7. M3 Player Sessions

Use:

```bash
runs/milestones/m3/observation-sheet.md
```

Run 3+ honest player sessions. Count only spontaneous comments before prompted
questions. M3 needs a majority to mention a moment the dungeon "knew them" and a
majority to want or start a second run.

## 8. Standing Backlog Review

Review:

```bash
PROGRESS.md
```

Minimum backlog items to decide:

- Bot WIN-drive gap.
- Balance calibration.
- Completionist detector strength.
- Watchdog reliability.
- Test-event union leak.
