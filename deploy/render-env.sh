#!/usr/bin/env bash
# Render deploy/.env from jobbylooky.env.tpl via 1Password and ship it to Chungus, mode 600.
# Values are never printed. Usage: deploy/render-env.sh [--dry-run]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
pi="${CHUNGUS_SSH:-chungus.local}"
target=/home/eikerd/jobbylooky/deploy/.env
out="$(mktemp)"; chmod 600 "$out"; trap 'rm -f "$out"' EXIT
op inject -i "$here/jobbylooky.env.tpl" -o "$out" --force >/dev/null
if grep -Eq 'op://[^/[:space:]]+/[^/[:space:]]+/[^[:space:]]+' "$out"; then
  echo "unresolved 1Password reference; aborting" >&2; exit 1
fi
echo "keys: $(awk -F= '/^[A-Z_]+=/{printf "%s ", $1}' "$out")"
[ "${1:-}" = "--dry-run" ] && exit 0
ssh "$pi" "umask 077 && mkdir -p $(dirname "$target") && cat > $target && chmod 600 $target" < "$out"
echo "shipped to $pi:$target"
