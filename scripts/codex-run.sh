#!/usr/bin/env bash
set -u

usage() {
  printf 'Usage: scripts/codex-run.sh <label> <prompt-or-@promptfile> [model] [effort]\n' >&2
}

if [ "$#" -lt 2 ] || [ "$#" -gt 4 ]; then
  usage
  exit 2
fi

label=$1
prompt_arg=$2
model=${3:-default}
effort=${4:-default}

case "$label" in
  ''|*[!a-z0-9-]*)
    printf 'error: label must match ^[a-z0-9-]+$\n' >&2
    exit 2
    ;;
esac

if [ "${prompt_arg#@}" != "$prompt_arg" ]; then
  prompt_file=${prompt_arg#@}
  if [ -z "$prompt_file" ] || [ ! -f "$prompt_file" ]; then
    printf 'error: prompt file not found: %s\n' "$prompt_file" >&2
    exit 2
  fi
  prompt=$(cat "$prompt_file")
else
  prompt=$prompt_arg
fi

session_dir='runs/sessions'
jsonl_file="$session_dir/$label.jsonl"
last_file="$session_dir/$label-last.txt"
status_file="$session_dir/.$label.status.$$"
ledger_file='scripts/ledger.tsv'
agent='codex'
temp_codex_home=''

mkdir -p "$session_dir" || exit 1

cleanup_temp_codex_home() {
  if [ -n "$temp_codex_home" ] && [ -d "$temp_codex_home" ]; then
    python3 - "$temp_codex_home" <<'PY'
import shutil
import sys

shutil.rmtree(sys.argv[1], ignore_errors=True)
PY
  fi
}

trap cleanup_temp_codex_home EXIT

codex_home=${CODEX_HOME:-}
if [ -z "$codex_home" ] && [ -n "${HOME:-}" ]; then
  codex_home="$HOME/.codex"
fi

if [ -n "$codex_home" ] && [ ! -w "$codex_home" ] && [ -r "$codex_home/auth.json" ]; then
  temp_parent=${TMPDIR:-/tmp}
  temp_codex_home=$(mktemp -d "$temp_parent/codex-run-home.XXXXXX") || exit 1
  cp "$codex_home/auth.json" "$temp_codex_home/auth.json" || exit 1
  chmod 600 "$temp_codex_home/auth.json" || exit 1
  export CODEX_HOME="$temp_codex_home"
fi

run_codex() {
  if [ "$model" != 'default' ] && [ "$effort" != 'default' ]; then
    codex exec --json --sandbox workspace-write \
      -c sandbox_workspace_write.network_access=true \
      -c approval_policy=never \
      -c "model=$model" \
      -c "model_reasoning_effort=$effort" \
      -o "$last_file" \
      "$prompt"
  elif [ "$model" != 'default' ]; then
    codex exec --json --sandbox workspace-write \
      -c sandbox_workspace_write.network_access=true \
      -c approval_policy=never \
      -c "model=$model" \
      -o "$last_file" \
      "$prompt"
  else
    codex exec --json --sandbox workspace-write \
      -c sandbox_workspace_write.network_access=true \
      -c approval_policy=never \
      -o "$last_file" \
      "$prompt"
  fi
}

timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
start_seconds=$(date +%s)

{
  run_codex
  printf '%s\n' "$?" > "$status_file"
} < /dev/null | tee "$jsonl_file"

end_seconds=$(date +%s)
seconds=$((end_seconds - start_seconds))

if [ -f "$status_file" ]; then
  IFS= read -r exit_code < "$status_file"
  rm -f "$status_file"
else
  exit_code=1
fi

token_fields=$(
  python3 - "$jsonl_file" <<'PY'
import json
import sys

path = sys.argv[1]
usage = None

try:
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("type") == "turn.completed":
                usage = event.get("usage") or {}
except OSError:
    usage = None

def int_field(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 0
    return parsed if parsed >= 0 else 0

if usage is None:
    print("0 0 0")
else:
    print(
        int_field(usage.get("input_tokens")),
        int_field(usage.get("output_tokens")),
        int_field(usage.get("cached_input_tokens")),
    )
PY
)

set -- $token_fields
input_tokens=${1:-0}
output_tokens=${2:-0}
cached_input_tokens=${3:-0}
total_tokens=$((input_tokens + output_tokens))

if [ ! -s "$ledger_file" ]; then
  printf 'timestamp\tlabel\tagent\tmodel\teffort\tseconds\tinput_tokens\toutput_tokens\ttotal_tokens\texit_code\n' > "$ledger_file"
fi

printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
  "$timestamp" \
  "$label" \
  "$agent" \
  "$model" \
  "$effort" \
  "$seconds" \
  "$input_tokens" \
  "$output_tokens" \
  "$total_tokens" \
  "$exit_code" >> "$ledger_file"

exit "$exit_code"
