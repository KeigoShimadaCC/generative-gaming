# PHASE-49A — Grid Renderer & Fog

## 1. Objective
The protagonist of the screen: the DOM/CSS-grid game view — glyphs, color semantics, three-state fog, change pulses — within the frame budget.

## 2. Context
UX §1 (grid spec: cell size, color carries meaning + never alone, fog states), §10 (<16ms input-to-update; shape+label accompany color); TECH_SPEC §3 (DOM first, canvas only on measured need).

## 3. Dependencies
48. Parallel with 49B (disjoint component folders).

## 4. Scope IN
- `app/components/grid/`: cell rendering (glyph + color class + shape/label affordance), fog dimming/dark states, entity layering (actor over item over terrain), single-pass update from store diff, damage/heal floating numbers + one-frame hit flash (UX §3's restraint), adjustable glyph size hook (settings later).
- Render performance test: 48×28 grid (largest band), 100 simulated state updates, frame budget assertion.

## 5. Scope OUT
- Input (50). HUD/log (49B). Animations beyond UX §3's list.

## 6. Owned files
`app/components/grid/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Cells + layers + fog + pulses | grid/** | Codex | 25m / 50m | 49B |
| 2 | verify | Visual fixture review (screenshot set vs UX §1 wording) + perf assertion run | — (read-only) | Cursor | 15m / 20m | — |

## 8. Verification commands
`pnpm run check` · perf test · screenshot set attached to verifier report.

## 9. Completion criteria
1. Fixture states render with correct fog, layering, color+shape semantics (screenshots reviewed against UX §1).
2. Frame budget met on the largest grid (measured).
3. Acceptance bar: a fixture floor is *readable at a glance* — the human gets the screenshot set at phase close (taste checkpoint).

## 10. Risks & escalation
If DOM can't hit budget, do NOT silently go canvas — that's a TECH_SPEC decision; report with measurements.
