SPIKE TASK — PHASE-29 (REFRAMED by orchestrator + human: ambient-CLI Director feasibility, no API key needed). Timebox 15m HARD — knowledge out, code throwaway.

OWNED FILES: runs/spikes/29-ambient-director/** only.
THE QUESTION: can `codex exec` serve as the Director's inference engine?
THE PROBE:
1. Build a floor-manifest-scale prompt: system-style preamble (~1 page: you are a dungeon director, here is the floor schema as a JSON example with all required fields — hand-write a compact example conforming to src/schemas/manifest expectations; read the schema exports to get field names right) + a request (depth 3, Shallows band, a 3-sentence fake player summary) + 'Reply with ONLY the JSON manifest, no prose, no markdown fences.'
2. Run it 5× via: codex exec --sandbox read-only -c approval_policy=never "<prompt>" < /dev/null, capturing wall-clock per call and the raw output.
3. For each output: does it parse as JSON? Does it Zod-validate against the actual manifest schema (write a tiny scratch script importing src/schemas)? Record per-attempt: latency, parse ok, validate ok, failure reasons.
4. Also probe ONE call through cursor-agent --print --model composer-2.5 (judge-model candidate) with a 100-word tone-verdict prompt → latency + JSON parse.
FINDINGS: runs/spikes/29-ambient-director/findings.md — the 5-attempt table, latency stats, parse/validate rates, failure taxonomy, and a GO/NO-GO recommendation for the ambient adapter (GO bar: ≥3/5 validate OR ≥4/5 parse with fixable failure modes; latency ≤120s/call).
NO commit. Then stop.
