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
stall_flag="$session_dir/.$label.stall.$$"
agent_pid_file="$session_dir/.$label.agent-pid.$$"
ledger_file="$repo_root/scripts/ledger.tsv"
agent='cursor'
effort='default'
watchdog_pid=''
pipeline_pid=''

mkdir -p "$session_dir" || exit 1

workspace_abs=$(cd "$workspace_dir" && pwd)

log_size_bytes() {
  if [ -f "$1" ]; then
    wc -c < "$1" | tr -d '[:space:]'
  else
    printf '0'
  fi
}

append_ledger_row() {
  local row_seconds=$1
  local row_exit_code=$2

  if [ ! -s "$ledger_file" ]; then
    printf 'timestamp\tlabel\tagent\tmodel\teffort\tseconds\tinput_tokens\toutput_tokens\ttotal_tokens\texit_code\n' > "$ledger_file"
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$timestamp" \
    "$label" \
    "$agent" \
    "$model" \
    "$effort" \
    "$row_seconds" \
    'NA' \
    'NA' \
    'NA' \
    "$row_exit_code" >> "$ledger_file"
}

stop_stall_watchdog() {
  if [ -n "$watchdog_pid" ] && kill -0 "$watchdog_pid" 2>/dev/null; then
    kill "$watchdog_pid" 2>/dev/null
    wait "$watchdog_pid" 2>/dev/null
  fi
  watchdog_pid=''
}

cleanup_on_exit() {
  stop_stall_watchdog
  rm -f "$agent_pid_file"
}

trap cleanup_on_exit EXIT

start_stall_watchdog() {
  local pipeline_target_pid=$1
  (
    grace_secs=90
    check_secs=10
    stall_secs=300
    size_threshold=300
    unchanged_secs=0
    last_size=0
    size=0
    target_pid=''
    pgid=''

    sleep "$grace_secs"

    if [ -f "$agent_pid_file" ]; then
      IFS= read -r target_pid < "$agent_pid_file"
    fi

    if [ -z "$target_pid" ] || ! kill -0 "$target_pid" 2>/dev/null; then
      exit 0
    fi

    last_size=$(log_size_bytes "$log_file")

    while kill -0 "$pipeline_target_pid" 2>/dev/null && kill -0 "$target_pid" 2>/dev/null; do
      sleep "$check_secs"

      if ! kill -0 "$pipeline_target_pid" 2>/dev/null || ! kill -0 "$target_pid" 2>/dev/null; then
        exit 0
      fi

      size=$(log_size_bytes "$log_file")

      if [ "$size" -lt "$size_threshold" ] && [ "$size" -eq "$last_size" ]; then
        unchanged_secs=$((unchanged_secs + check_secs))
      else
        unchanged_secs=0
      fi
      last_size=$size

      if [ "$unchanged_secs" -ge "$stall_secs" ]; then
        printf 'STALL-DETECTED label=%s\n' "$label" >&2
        : > "$stall_flag"

        end_seconds=$(date +%s)
        stall_seconds=$((end_seconds - start_seconds))
        append_ledger_row "$stall_seconds" '124'

        pgid=$(ps -o pgid= -p "$target_pid" 2>/dev/null | tr -d '[:space:]')
        if [ -n "$pgid" ]; then
          kill -TERM -"$pgid" 2>/dev/null || kill -TERM "$target_pid" 2>/dev/null
        else
          kill -TERM "$target_pid" 2>/dev/null
        fi
        exit 0
      fi
    done
  ) &
  watchdog_pid=$!
}

timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
start_seconds=$(date +%s)

{
  (
    cd "$workspace_abs" || exit 1
    python3 -c 'import os, sys; os.setpgrp(); os.execvp(sys.argv[1], sys.argv[1:])' \
      cursor-agent --print --output-format text --model "$model" "$prompt" &
    agent_pid=$!
    printf '%s\n' "$agent_pid" > "$agent_pid_file"
    wait "$agent_pid"
  )
  printf '%s\n' "$?" > "$status_file"
} < /dev/null | tee "$log_file" &
pipeline_pid=$!

start_stall_watchdog "$pipeline_pid"

wait "$pipeline_pid" 2>/dev/null
stop_stall_watchdog

end_seconds=$(date +%s)
seconds=$((end_seconds - start_seconds))

if [ -f "$stall_flag" ]; then
  rm -f "$stall_flag" "$status_file" "$agent_pid_file"
  exit 124
fi

if [ -f "$status_file" ]; then
  IFS= read -r exit_code < "$status_file"
  rm -f "$status_file" "$agent_pid_file"
else
  exit_code=1
fi

append_ledger_row "$seconds" "$exit_code"

exit "$exit_code"
