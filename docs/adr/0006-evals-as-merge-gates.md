# ADR 0006: Evals As Merge Gates

Context: Prompt and schema changes can regress playability, novelty, responsiveness, or latency even when unit tests pass.

Decision: Treat evals as merge gates. CI runs a mocked eval smoke against committed thresholds, and ambient evals run locally on hosts with Codex auth. Reports are persisted under `runs/` and baselines change only through deliberate review.

Consequence: The project pays an ongoing test-cost tax, but quality claims become reproducible. A prompt improvement that lowers solvability or responsiveness is a failed change, not a subjective debate.
