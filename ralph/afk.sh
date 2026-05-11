#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${1:-}" ]]; then
  echo "Usage: $0 ITERATIONS [scripts/ralph-loop args...]" >&2
  exit 1
fi

iterations="$1"
shift

root="$(git rev-parse --show-toplevel)"
cd "$root"

for ((i = 1; i <= iterations; i++)); do
  echo "==> Ralph AFK iteration ${i}/${iterations}"

  if ! output="$(scripts/ralph-loop run --limit 1 "$@" 2>&1)"; then
    echo "$output"
    exit 1
  fi

  echo "$output"

  if [[ "$output" == *"NO MORE TASKS"* || "$output" == *"no matching issues found"* ]]; then
    echo "Ralph complete after ${i} iteration(s)."
    exit 0
  fi
done
