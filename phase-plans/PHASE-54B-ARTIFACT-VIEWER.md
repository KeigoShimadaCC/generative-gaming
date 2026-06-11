# PHASE-54B — Artifact Viewer

## 1. Objective
The engineer's tab: every generation's manifests, gate reports, repairs, fallbacks, and costs — browsable, searchable, copyable, read-only.

## 2. Context
UX §7 (artifacts tab spec); NORTH_STAR §6.7 (demo: "machinery behind the magic"); 37's reader API.

## 3. Dependencies
37, 53. Parallel with 54A.

## 4. Scope IN
- `app/components/artifacts/`: per-floor generation tree (attempt chain: manifest → gate report → repair → outcome), document view (pretty JSON + readable gate summaries), search across the run's artifacts, copy button, usage/cost line per generation, fallback events highlighted.
- Strictly read-only (no mutation paths at all — reader API only).

## 5. Scope OUT
- Diary (54A). Cross-run artifact browsing beyond the run index's entry point. Editing anything ever.

## 6. Owned files
`app/components/artifacts/**`.

## 7. Task breakdown
| Task | Type | Objective | Owned files | Agent | Est / Timebox | Parallel with |
|---|---|---|---|---|---|---|
| 1 | implement | Tree + document views + search + copy | artifacts/** | Codex | 25m / 50m | 54A |
| 2 | verify | Fixture-run completeness: every artifact 37 wrote is reachable in the viewer; gate reasons readable; zero write paths (code audit) | — (read-only) | Cursor | 10m / 15m | — |

## 8. Verification commands
`pnpm run check` · completeness fixture test · write-path code audit.

## 9. Completion criteria
1. Every persisted artifact reachable and rendered (test).
2. A rejected manifest's reasons readable by a non-engineer (verifier judgment noted).
3. Read-only proven (audit).
4. Acceptance bar: the technical-audience demo beat needs zero terminal — it's all in this tab.

## 10. Risks & escalation
None unusual; this is pure presentation over 37. JSON blobs too raw for the demo → readable-summary mode is in scope, prettifying beyond that is not.
