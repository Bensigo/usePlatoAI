#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

exec scripts/ralph-loop run --limit 1 "$@"
