#!/usr/bin/env bash
set -u

script_dir=$(cd "$(dirname "$0")" && pwd)
ledger_file="$script_dir/ledger.tsv"

if [ ! -f "$ledger_file" ]; then
  printf 'error: ledger not found: %s\n' "$ledger_file" >&2
  exit 1
fi

python3 - "$ledger_file" <<'PY'
import sys

path = sys.argv[1]

groups: dict[str, dict[str, int]] = {}
grand = {"runs": 0, "seconds": 0, "tokens": 0, "failures": 0}

with open(path, encoding="utf-8") as handle:
    header = handle.readline()
    for line in handle:
        line = line.rstrip("\n")
        if not line:
            continue
        fields = line.split("\t")
        if len(fields) < 10:
            continue

        label = fields[1]
        dash = label.find("-")
        group = label[:dash] if dash > 0 else label

        seconds = int(fields[5]) if fields[5].isdigit() or (
            fields[5].lstrip("-").isdigit()
        ) else 0
        total_tokens_field = fields[8]
        tokens = 0
        if total_tokens_field != "NA":
            try:
                tokens = int(total_tokens_field)
            except ValueError:
                tokens = 0

        try:
            exit_code = int(fields[9])
        except ValueError:
            exit_code = 1

        bucket = groups.setdefault(
            group, {"runs": 0, "seconds": 0, "tokens": 0, "failures": 0}
        )
        bucket["runs"] += 1
        bucket["seconds"] += seconds
        bucket["tokens"] += tokens
        if exit_code != 0:
            bucket["failures"] += 1

        grand["runs"] += 1
        grand["seconds"] += seconds
        grand["tokens"] += tokens
        if exit_code != 0:
            grand["failures"] += 1

for group in sorted(groups):
    stats = groups[group]
    print(
        f"{group}\truns={stats['runs']}\tseconds={stats['seconds']}"
        f"\ttokens={stats['tokens']}\tfailures={stats['failures']}"
    )

print(
    f"TOTAL\truns={grand['runs']}\tseconds={grand['seconds']}"
    f"\ttokens={grand['tokens']}\tfailures={grand['failures']}"
)
PY
