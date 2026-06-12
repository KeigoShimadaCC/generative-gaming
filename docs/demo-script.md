# Demo Script

This script is for the Phase 59 human rehearsal. The worker-owned goal is the script, edge-state sweep, and top-level boundary; the two full rehearsals are human/orchestrator work.

## Preflight

Ambient variant, the real demo:

```bash
pnpm install --frozen-lockfile
codex login
PORT=3001 pnpm run dev
```

Open `http://localhost:3001`. Keep every other Codex process closed while the demo is running. Ambient generation is expected to produce artifacts under `runs/` and may still fall back if a gate rejects a floor.

Mock/fallback variant:

```bash
pnpm install --frozen-lockfile
PORT=3001 pnpm run dev
```

Skip `codex login`, or run on a machine without Codex auth. The game should still boot, play, descend, show the diary, and show artifact/fallback messaging without blocking input.

CLI fallback smoke, useful before opening the browser:

```bash
pnpm run play --seed demo-smoke
```

## Beat 1: Start A Run

Commands and keys:

1. Open `http://localhost:3001`.
2. On the title screen, press `>` or click `New run`.
3. Press `?`, then `Esc`, to show and close the keymap if the audience needs the input map.

Expected on-screen outcome:

- Title screen starts on `Everdeep` with a seed.
- The play screen appears with the grid, HUD, inspect panel, and message log.
- Floor 1 is readable, gentle, and immediately controllable.

Recovery note:

- If the title shows `Continue`, click it only if the active run is part of the demo. Otherwise click `New run`.
- If local storage looks stale, use the browser's site-data clear action and reload; this is presentation cleanup only, not engine recovery.

## Beat 2: Play A Few Floors

Commands and keys:

1. Move with arrows, `WASD`, or `hjkl`.
2. Press `g` on items.
3. Press `i` for inventory, `x` for inspect, and `q` for quest log.
4. Move to stairs and press `>`.
5. If the adjacent-enemy prompt appears, press `y` only when you want to descend anyway; press `n` to keep playing.

Expected on-screen outcome:

- The HUD and log update turn by turn.
- The side panel changes without hiding the grid.
- Descending shows the floor transition; generated and fallback floors use the same theatrical presentation.

Recovery note:

- If the floor is not ready, wait for the transition to finish; fallback should serve instead of leaving the player stuck.
- If input appears locked after a transition, wait one second and press a movement key again.

Ambient variant:

- Call out that the next floor is being authored between turns and must pass the gauntlet before it appears.

Mock/fallback variant:

- Call out that the same UI path is using mock/fallback content, proving the offline safety path.

## Beat 3: NPC And Run-Specific Quest

Commands and keys:

1. Move into an adjacent NPC to talk.
2. Use number keys for finite replies when offered.
3. Press `q` to show the quest log after accepting or observing a quest.

Expected on-screen outcome:

- Dialogue appears in the context panel without free-text input.
- The quest log shows structured objectives tied to real floor entities.

Recovery note:

- If no NPC appears in the current floor, descend once and continue. In the mock/fallback variant, treat the finite dialogue/quest panel itself as the safety demonstration if the generated personal quest is absent.

Ambient variant:

- The NPC should reference a recent action, item habit, or previous floor fact.

Mock/fallback variant:

- The NPC may be stock content. Do not claim personalization; say this is the offline contract.

## Beat 4: Signature Moment

Commands and keys:

1. Keep playing until the mid-run narration or floor content clearly changes around the player's behavior.
2. Press `Tab`, then choose `Diary` if the audience needs evidence of the inferred pattern so far.
3. Close with `Esc` or `Close`.

Expected on-screen outcome:

- Ambient demo: a bold invention appears, such as a named rival, cursed gift, or floor built around a habit.
- Mock/fallback demo: the game remains stable and coherent, but may not produce a personal invention.

Recovery note:

- If the live generation is underwhelming, do not fake it. Descend once more; if still weak, state that this is variance and move to artifacts where the accepted/rejected attempts are inspectable.

## Beat 5: Terminal State And Diary

Commands and keys:

1. If the run naturally reaches `WIN` or `LOSS`, let it resolve.
2. If time is short, press `Esc`, then `y`, to abandon the run and force a terminal diary.
3. Read the final diary screen.

Expected on-screen outcome:

- The title/summary surface shows the final dungeon diary.
- The diary summarizes outcome, depth, turns, discoveries, and what the Deep keeps.

Recovery note:

- `ABORTED` is acceptable only as a rehearsal fallback. For the public demo, prefer a natural win/loss if rehearsal proves the route reliable.

## Beat 6: Start A Second Run

Commands and keys:

1. From the terminal diary, read the memory note under the diary.
2. Click `New run`.
3. Watch the first floor intro and early narration.

Expected on-screen outcome:

- The summary explicitly says what the Deep remembers.
- Ambient demo: opening context should reflect the previous run through the prompt memory path.
- Mock/fallback demo: the new run starts cleanly even when memory does not influence content.

Recovery note:

- If the second run lacks a visible callback, say that cross-run memory is prompt-side evidence and show the artifact or diary evidence instead of forcing the claim.

## Beat 7: Artifact Viewer

Commands and keys:

1. During play, press `Tab`.
2. Click `Artifacts`.
3. Use the search box for `Gate`, `fallback`, `manifest`, or the visible NPC/item name.
4. Click a floor, attempt, gate, manifest, or raw-output document.
5. Click `Copy` if a short excerpt is needed for the discussion.

Expected on-screen outcome:

- The artifact pane lists generation records when they exist.
- Missing or empty `runs/` data lands as a presentable empty state, not an exception.
- Fallback attempts are highlighted and explain why the player still received a playable floor.

Recovery note:

- If the pane says no artifacts exist for the run, continue the demo as a fallback/offline run and use a known recorded run from `runs/` for technical audiences after the play segment.

## Edge-State Sweep

- First-ever run, no DB/local storage: title screen shows a seed and `New run`; starting a run reaches the playable grid.
- No Codex auth: browser boot still works; ambient calls fail closed into mock/fallback behavior; `.env` keys are not required.
- Mid-run reload: `Continue` appears when an active run exists; continuing restores the run from browser storage.
- Empty or missing `runs/`: artifact pane shows an empty state and play remains unaffected.
