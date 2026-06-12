RECONCILIATION TASK — PHASE-23A/23B format unification (verifier found 7 findings; the recorder (23A) is CANONICAL — align everything else to it).

OWNED FILES: src/harness/trace/**, src/harness/replay/**, tests/golden/** (+ their tests).
THE WORK, per finding:
1+2+3) Align the replayer's parser to the recorder's actual header (contentRef shape, runId scheme) — recorder canonical; where the recorder itself violates TECH_SPEC §5 (missing modelId — finding 5): add modelId to the recorder stamp (value: the content/director source's model id; 'none' for fallback runs).
4) Turn-counter semantics: pick the recorder's post-step convention; fix the replayer to match; add an explicit comment in BOTH files stating the convention.
6) Single computeStateHash: move to src/harness/trace/hash.ts (or engine-state if cleaner — no, keep in harness), both modules import it; delete the duplicate.
7) Re-mint tests/golden traces via the CANONICAL recorder (the buildTraceFromRun helper dies or becomes a thin wrapper over the real recorder).
THE KEYSTONE (finding 1): an integration round-trip test — REAL recorder records a 2-floor fixture run → REAL replayer verifies identical; plus the induced-divergence test now runs against a canonically-minted trace. Run it 3× in your verification.
DEFINITION OF DONE: pnpm run check green (paste); the integration round-trip test name quoted + 3× identical. Report + actual vs 25m. NO commit. Then stop.
