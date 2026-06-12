IMPLEMENT TASK — PHASE-46: ambient judge gate + signature moment (contract: phase-plans/PHASE-46-JUDGE-SIGNATURE.md AMENDED for ambient: the judge model is cursor composer via the provider seam's judge() — BUT the Cursor lane has been unstable; implement judge with the seam's judge interface and config model selection, mock-tested; ONE optional live judge calibration attempt, skip cleanly if the CLI hangs >60s).

GATE SCOPE: alone — full pnpm run check. Do NOT commit.
STEP 0: provider seam exposes judge(prompt) with taxonomy; gate3 heuristics + registerGate3 hook exist (r3); config gate3/judge knobs go in src/config; signature flag legality already in Gate 1 (Middle band only) and budget-relax marker in the manifest metadata. Do NOT modify gates 0–2, repair beyond the existing hook, or the seam.
OWNED FILES: src/gauntlet/gate3/judge.ts, src/director/prompt/signature.ts, src/config (judge + signature groups, additive) (+ tests).

THE WORK:
1. judge.ts: config-gated (off = heuristics-only, the DEFAULT until calibrated); when on: judge() over narration + named-entity text only (cost), structured verdict {onTone, coherent, specific} parsed from JSON; verdict into the Gate 3 report as advisory-or-blocking per config (default advisory); registers alongside heuristics in the gate3 hook.
2. signature.ts: the once-per-run signature ask — extends the task block when ctx says signature floor (Middle band, not yet used): bolder instruction + the budget-relax percent from config woven into the injected budget numbers; one-per-run enforcement state lives in run ctx (Gate 1 already checks the flag).
3. Calibration corpus: 10 fixture texts (5 on-tone Deep-voice, 5 violations) committed; a calibration test (mock judge) + the optional @ambient-judge live attempt (env-gated AMBIENT_LIVE=1, skip-on-hang).
4. Tests: off-switch = byte-identical behavior to heuristics-only (serialize gate reports both ways); judge verdict parsing + taxonomy; signature ask appears exactly once per run (two-floor fixture); budget-relax numbers correct in the prompt snapshot.
DEFINITION OF DONE: pnpm run check green (paste). Report + actual vs 40m. NO commit. Then stop.
