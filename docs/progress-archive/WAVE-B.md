## Task Queue

| ID | Task | Owner (agent) | Worktree / branch | Status | Notes |
|---|---|---|---|---|---|
| 21-1 | Run loop, caps, Hoard, endings | Codex | main (src/engine/run) | ready-for-verify | provider contract frozen in `src/engine/run/loop.ts`; full gate green; deterministic scan clean; no commit |
| 26-1 | Fallback content pack (Old Stock) | Cursor | main (content/, loader) | in-progress | |
| 21/26-I | Wire fallback pack to run loop + unified events | Codex | main (integration) | ready-for-verify | fallback provider wired; full-run smoke over real fallback content; full gate green; no commit |
| — | Wave B merged through 16/20 (b1ccd1d): 06–20,22 all verified | — | — | merged | engine complete except run loop |

Status values: `queued` → `claimed` → `in-progress` → `ready-for-verify` →
(archived at Wave B close)
