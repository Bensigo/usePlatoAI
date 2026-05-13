#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${1:-}" ]]; then
  echo "Usage: $0 PR_NUMBER [scripts/review-pr args...]" >&2
  exit 1
fi

pr="$1"
shift

root="$(git rev-parse --show-toplevel)"
cd "$root"

exec scripts/review-pr --pr "$pr" "$@"
