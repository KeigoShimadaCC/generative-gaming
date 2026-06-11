# Codex Sandbox Environment Findings (PHASE-01A)

Date: 2026-06-11
Worker: Codex
Raw session log observed: `runs/spikes/01A-codex-env/session.jsonl`

## 1. Claim: `.git` writes are blocked

Command:

```sh
git commit --allow-empty -m test
```

Invocation recorded by Codex:

```sh
/bin/zsh -lc 'git commit --allow-empty -m test'
```

Output:

```text
[main 36a3db0] test
```

Exit code: 0

Verdict: REFUTED

Notes: The empty commit succeeded and advanced `HEAD` to `36a3db0 test`. Per the task brief, no undo was attempted.

## 2. Claim: `rm -rf` is blocked

Command:

```sh
mkdir -p /tmp/spike-test && rm -rf /tmp/spike-test
```

Invocation recorded by Codex:

```sh
/bin/zsh -lc 'mkdir -p /tmp/spike-test && rm -rf /tmp/spike-test'
```

Output:

```text
exec_command failed for `/bin/zsh -lc 'mkdir -p /tmp/spike-test && rm -rf /tmp/spike-test'`: CreateProcess { message: "Rejected(\"`/bin/zsh -lc 'mkdir -p /tmp/spike-test && rm -rf /tmp/spike-test'` rejected: blocked by policy\")" }
```

Exit code: no process started; rejected before execution

Verdict: CONFIRMED

Notes: This command also contains `&&`, but the separate harmless chain probe below succeeded, so this rejection is attributable to the destructive `rm -rf` policy.

## 3. Claim: chained shell commands are blocked

Command:

```sh
printf 'left\n' && printf 'right\n'
```

Invocation recorded by Codex:

```sh
/bin/zsh -lc "printf 'left\\n' && printf 'right\\n'"
```

Output:

```text
left
right
```

Exit code: 0

Verdict: REFUTED

Notes: A non-destructive `&&` chain executed successfully.

## 4. Claim: no browser launch

Command:

```sh
which chromium
```

Invocation recorded by Codex:

```sh
/bin/zsh -lc 'which chromium'
```

Output:

```text
chromium not found
```

Exit code: 1

Additional command, using `--no-install` to honor the brief's "do NOT install anything" constraint:

```sh
npx --no-install playwright --version
```

Invocation recorded by Codex:

```sh
/bin/zsh -lc 'npx --no-install playwright --version'
```

Output:

```text
npm error code EPERM
npm error syscall open
npm error path /Users/keigoshimada/.npm/_cacache/tmp/***
npm error errno EPERM
npm error
npm error Your cache folder contains root-owned files, due to a bug in previous versions of npm which has since been addressed.
npm error
npm error To permanently fix this problem, please run:
npm error   sudo chown -R 501:20 "/Users/keigoshimada/.npm"
npm error Log files were not written due to an error writing to the directory: /Users/keigoshimada/.npm/_logs
npm error You can rerun the command with `--loglevel=verbose` to see the logs in your terminal
```

Exit code: 1

Verdict: CONFIRMED

Notes: No `chromium` binary was present, and the Playwright CLI availability check failed before reporting a version because npm could not open its cache. No browser launch was possible through the permitted checks. This was an availability probe only; no browser was launched.

## 5. Claim: network access is available with current flags

Command:

```sh
curl -sI https://example.com | head -3
```

Invocation recorded by Codex:

```sh
/bin/zsh -lc 'curl -sI https://example.com | head -3'
```

Output:

```text
HTTP/2 200 
date: Thu, 11 Jun 2026 09:21:51 GMT
content-type: text/html
```

Exit code: 0

Verdict: CONFIRMED

## 6. JSONL usage field names

Command:

```sh
rg -n '"usage"|"input_tokens"|"output_tokens"|"total_tokens"' runs/spikes/01A-codex-env/session.jsonl
```

Invocation recorded by Codex:

```sh
/bin/zsh -lc 'rg -n '"'"'"usage"|'"'"'"input_tokens"|'"'"'"output_tokens"|'"'"'"total_tokens"'"'"' runs/spikes/01A-codex-env/session.jsonl'
```

Output:

```text

```

Exit code: 1

Verdict: not visible from inside

Notes: `session.jsonl` was visible and readable from inside the spike folder, but no JSON keys named `usage`, `input_tokens`, `output_tokens`, or `total_tokens` were present at the time of inspection. Earlier broad searches only matched prose captured from repository documents, not JSON usage fields.

## Summary

| # | Claim / probe | Verdict | Evidence |
|---|---|---|---|
| 1 | `.git` writes are blocked | REFUTED | `git commit --allow-empty -m test` succeeded: `[main 36a3db0] test` |
| 2 | `rm -rf` is blocked | CONFIRMED | `mkdir -p /tmp/spike-test && rm -rf /tmp/spike-test` rejected by policy before execution |
| 3 | chained shell commands are blocked | REFUTED | `printf 'left\n' && printf 'right\n'` exited 0 and printed both lines |
| 4 | no browser launch | CONFIRMED | `which chromium` found no binary; `npx --no-install playwright --version` failed with npm `EPERM` before version check |
| 5 | network access is available | CONFIRMED | `curl -sI https://example.com | head -3` returned `HTTP/2 200` |
| 6 | JSONL usage field names visible | not visible from inside | no `usage`, `input_tokens`, `output_tokens`, or `total_tokens` JSON keys found in visible `session.jsonl` |
