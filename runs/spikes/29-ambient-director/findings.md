# Phase 29 Ambient Director CLI Spike

## Question

Can `codex exec` serve as the Director's inference engine when invoked directly as:

```sh
codex exec --sandbox read-only -c approval_policy=never "<prompt>" < /dev/null
```

## Probe Setup

- Prompt: `runs/spikes/29-ambient-director/prompt.txt`
- Runner: `runs/spikes/29-ambient-director/run-probe.mjs`
- Validator: `runs/spikes/29-ambient-director/validate-manifest.test.ts`
- Validation schema: composed scratch `ManifestProbeSchema` importing actual `src/schemas` Zod exports for enemies, items, traps, NPCs, quests, narration, plus the run-loop `params` shape.
- Caveat: this repo currently has no exported `src/schemas/manifest` / `ManifestSchema`. The probe used the manifest-scale shape implied by `FloorContentProvider` plus `NarrationBeatsSchema`.

## Results

| Attempt | Latency (s) | Exit | Timed out | JSON parse | Zod validate | Failure reason |
|---|---:|---:|---|---|---|---|
| codex-1 | 0.227 | 1 | no | no | no | empty stdout; stderr: failed to initialize in-process app-server client |
| codex-2 | 0.230 | 1 | no | no | no | empty stdout; stderr: failed to initialize in-process app-server client |
| codex-3 | 0.226 | 1 | no | no | no | empty stdout; stderr: failed to initialize in-process app-server client |
| codex-4 | 0.227 | 1 | no | no | no | empty stdout; stderr: failed to initialize in-process app-server client |
| codex-5 | 0.224 | 1 | no | no | no | empty stdout; stderr: failed to initialize in-process app-server client |

Raw capture paths:

- `runs/spikes/29-ambient-director/attempts/codex-*/stdout.txt`
- `runs/spikes/29-ambient-director/attempts/codex-*/stderr.txt`
- `runs/spikes/29-ambient-director/attempts/codex-*/meta.json`
- Summary: `runs/spikes/29-ambient-director/run-summary.json`
- Validation summary: `runs/spikes/29-ambient-director/validation-results.json`

## Latency Stats

Codex attempts, wall-clock:

- n: 5
- min: 0.224s
- p50: 0.227s
- avg: 0.227s
- max: 0.230s

These are startup-failure latencies, not inference latencies.

## Parse / Validate Rates

- Codex JSON parse: 0/5
- Codex Zod validate: 0/5
- Cursor judge JSON parse: 0/1

## Failure Taxonomy

1. `codex exec` direct invocation failed before inference in all 5 attempts.
   - stderr included: `Reading additional input from stdin...`
   - terminal error: `failed to initialize in-process app-server client: Operation not permitted (os error 1)`
   - This matches the documented nested-Codex sandbox issue in `ENVIRONMENT.md`.
2. `cursor-agent --print --model composer-2.5` also failed before inference.
   - terminal error: `EPERM: operation not permitted, open '/Users/keigoshimada/.cursor/cli-config.json.tmp'`
   - This appears to be a Codex-worker sandbox permission issue for Cursor's config write.
3. No model output was produced, so there were no schema-shape failures to classify.

## Cursor Judge Probe

Command shape:

```sh
cursor-agent --print --model composer-2.5 "<100-word tone-verdict prompt>"
```

Result:

- latency: 2.257s
- exit: 1
- stdout: empty
- JSON parse: no
- failure: `EPERM: operation not permitted, open '/Users/keigoshimada/.cursor/cli-config.json.tmp'`

## Recommendation

NO-GO for the ambient adapter using direct `codex exec` from this worker sandbox. It achieved 0/5 parse and 0/5 validation, below the GO bar of at least 3/5 validate or 4/5 parse with fixable failure modes.

This result is a launch-path NO-GO, not a model-quality NO-GO. A follow-up host-side or wrapper-based probe could still test whether Codex can produce valid manifests once inference actually starts, but the direct command path specified here cannot serve as the Director engine in the current worker environment.

## Verification

```sh
node runs/spikes/29-ambient-director/run-probe.mjs
```

Result: completed; five Codex attempts and one Cursor attempt captured, all exit 1 with empty stdout.

```sh
pnpm exec vitest run --config runs/spikes/29-ambient-director/vitest.config.ts --reporter verbose
```

Result: 1 test file passed, 1 test passed. The validator wrote `validation-results.json`.

The initial direct Vitest invocation also confirmed root Vitest discovery excludes this owned scratch directory:

```sh
pnpm exec vitest run runs/spikes/29-ambient-director/validate-manifest.test.ts --reporter verbose
```

Result: no test files found because root config includes only `src/**/*.test.ts`; fixed by adding the local spike Vitest config.

## Scope Deviations / Risks

- Did not edit `PROGRESS.md` because the task owned files are limited to `runs/spikes/29-ambient-director/**`.
- Did not use `scripts/codex-run.sh` or alter `CODEX_HOME`; the brief specified the direct `codex exec` command.
- Did not update `ENVIRONMENT.md`; it is locked to workers. Environment discoveries are listed below for orchestrator ingestion.

## Environment Discoveries

- From a Codex worker sandbox, direct nested `codex exec --sandbox read-only -c approval_policy=never "<prompt>" < /dev/null` fails before inference with `failed to initialize in-process app-server client: Operation not permitted (os error 1)`.
- From the same sandbox, `cursor-agent --print --model composer-2.5` fails before inference trying to write `/Users/keigoshimada/.cursor/cli-config.json.tmp`.

## Actual Time

~12 minutes against a 15-minute hard timebox.

## Orchestrator Appendix — Host-Shell Re-Probe (the valid measurement)

The worker's 5 in-sandbox attempts measured the nested-Codex limitation, not the
question. Re-run from the host shell (where the game server would invoke it):

| Attempt | Latency | Exit | JSON parse | Notes |
|---|---|---|---|---|
| host-1 | 29s | 0 | OK | pure JSON, 9 keys, roster 4 / items 6 |
| host-2 | 26s | 0 | OK | roster 3 / items 6 |
| host-3 | 34s | 0 | OK | roster 4 / items 7 |

**VERDICT: GO.** 3/3 parse, ~30s median, $0 marginal. Full Zod validation pends
PHASE-30's manifest envelope (none exported yet — the worker's caveat stands).
Constraint: the ambient adapter must run host-side (or with the temp-CODEX_HOME
fix) — never from inside a Codex sandbox.
