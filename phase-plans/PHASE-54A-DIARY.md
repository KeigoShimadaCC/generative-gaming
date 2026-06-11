# PHASE-54A — Dungeon Diary View

## 1. Objective
The Deep's manuscript made visible: the in-run diary (Tab), the death/victory diary screen, and the "what the dungeon learned" note.

## 2. Context
UX §7 (Tab layer), §8 (diary as death screen, summary strip, learned-note); WORLD §7 (the diary is canonically the Deep's page about you); 44's learned-summary; narration/artifact data.

## 3. Dependencies
45, 53. Parallel with 54B (disjoint folders).

## 4. Scope IN
- `app/components/diary/`: per-floor recap entries (composed from trace events + narration beats + memory callbacks — a deterministic composer in `src/harness/diary.ts` is in scope here, UI renders it), summary strip (depth/turns/kills/discoveries from 21's run summary), the learned-note section, in-run partial view (Tab) vs final view (death/victory), Deep-voice styling per WORLD §6.
- Pause-on-Tab; return-exact-position.

## 5. Scope OUT
- Artifact tab (54B). New narration generation (composes existing artifacts only — the diary is derived, never freshly generated).

## 6. Owned files
`app/components/diary/**`, `src/harness/diary.ts`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Diary composer (deterministic, tested on fixture runs) | src/harness/diary.ts | Codex | 20m / 40m | 54B |
| 2 | implement | Diary UI (in-run + final + learned-note) | app/components/diary/** | Cursor | 15m / 30m | task 1 |
| 3 | verify | Fixture-run diary audit: every notable event represented, nothing invented (cross-check against trace), Tab round-trips exactly | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · composer fixture tests · trace-faithfulness audit.

## 9. Completion criteria
1. Diary is a pure function of run artifacts (same run → same diary; test).
2. Faithfulness: no diary claim lacks a trace/artifact source (audit).
3. Death screen leads with the diary per UX §8 (smoke).
4. Acceptance bar: the demo beat "read what the dungeon made of you" works on a real fixture run — human reads one at close (taste checkpoint).

## 10. Risks & escalation
The diary must never fabricate — composition over generation is the rule; if it reads flat, report (human may approve a generation pass later as a new phase).
