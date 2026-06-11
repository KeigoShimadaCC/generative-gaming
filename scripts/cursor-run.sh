#!/usr/bin/env bash
set -u

usage() {
  printf 'Usage: scripts/cursor-run.sh <label> <workspace-dir> <prompt-or-@promptfile> [model]\n' >&2
}

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  usage
  exit 2
fi

label=$1
workspace_dir=$2
prompt_arg=$3
model=${4:-composer-2.5}

case "$label" in
  ''|*[!a-z0-9-]*)
    printf 'error: label must match ^[a-z0-9-]+$\n' >&2
    exit 2
    ;;
esac

if [ ! -d "$workspace_dir" ]; then
  printf 'error: workspace directory not found: %s\n' "$workspace_dir" >&2
  exit 2
fi

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

script_dir=$(cd "$(dirname "$0")" && pwd)
repo_root=$(cd "$script_dir/.." && pwd)
session_dir="$repo_root/runs/sessions"
log_file="$session_dir/$label.log"
status_file="$session_dir/.$label.status.$$"
ledger_file="$repo_root/scripts/ledger.tsv"
agent='cursor'
effort='default'

mkdir -p "$session_dir" || exit 1

workspace_abs=$(cd "$workspace_dir" && pwd)

timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
start_seconds=$(date +%s)

{
  (
    cd "$workspace_abs" || exit 1
    cursor-agent --print --output-format text --model "$model" "$prompt"
  )
  printf '%s\n' "$?" > "$status_file"
} < /dev/null | tee "$log_file"

end_seconds=$(date +%s)
seconds=$((end_seconds - start_seconds))

if [ -f "$status_file" ]; then
  IFS= read -r exit_code < "$status_file"
  rm -f "$status_file"
else
  exit_code=1
fi

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
  'NA' \
  'NA' \
  'NA' \
  "$exit_code" >> "$ledger_file"

exit "$exit_code"
