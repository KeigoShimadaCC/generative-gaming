IMPLEMENT TASK — PHASE-31: provider seam — mock + ambient adapters (contract: phase-plans/PHASE-31-PROVIDER-SEAM.md AMENDED per TECH_SPEC §6 two-adapter model; the AI-SDK/API adapter is DEFERRED until a key exists — design the interface so it slots in later).

GATE SCOPE (sibling in src/director/prompt): pnpm run typecheck + pnpm exec eslint src/director/provider + pnpm exec vitest run src/director/provider. Do NOT commit.
STEP 0: read runs/spikes/29-ambient-director/findings.md (orchestrator appendix: host-side constraint, ~30s latency) and src/schemas/manifest.ts (parseManifest is your output contract). ENVIRONMENT facts: codex exec needs `< /dev/null`; never invoke from inside a Codex sandbox (your own tests must MOCK the subprocess — spawn a fake codex via an injected exec function; one @ambient-tagged real-call test, env-gated AMBIENT_LIVE=1).

OWNED FILES: src/director/provider/** (+ tests).

THE WORK:
1. types.ts: DirectorProvider interface: generateManifest(prompt, opts) → Promise<ProviderResult> where ProviderResult = {ok, raw, manifest} | {ok:false, error: typed taxonomy (timeout | process_error | parse_fail | validate_fail), raw?} + usage {latencyMs, tokens?: numbers|null}; judge(prompt) → small-verdict variant (for Gate 3 later).
2. ambient.ts: shells `codex exec --sandbox read-only -c approval_policy=never "<prompt>" < /dev/null` via injected exec (child_process default), hard timeout (config, default 120s, kill on expiry), pipes stdout → parseManifest, maps failures to the taxonomy, captures latency; judge() via `cursor-agent --print --model composer-2.5` same pattern (JSON verdict demanded, parsed).
3. mock.ts: fixture-backed same interface; failure-mode injection (each taxonomy entry triggerable); deterministic.
4. config: provider selection (mock | ambient | api-future) + timeouts in src/config (add a director group if absent, [T] source comments).
5. Tests (all mocked exec): taxonomy coverage (each failure path); timeout kills the process (fake hanging exec); parse pipeline; usage captured. @ambient: one real generateManifest (skip cleanly if codex absent), assert ok|taxonomy — never model-variance failures.
DEFINITION OF DONE: scoped gates green (paste); rg 'Math.random|Date.now' src/director/ empty (latency via injected clock/Date allowed ONLY in the adapter behind an injected now() — keep src clean). Report + actual vs 35m. NO commit. Then stop.
