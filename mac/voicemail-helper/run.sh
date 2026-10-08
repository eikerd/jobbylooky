#!/bin/zsh
# Runs JobbyVoicemail through Launch Services and waits for it, so macOS
# checks the helper's own Full Disk Access instead of the caller's.
# Usage: run.sh probe | run.sh export --days 183 | run.sh audio ID...
set -euo pipefail

app=${JOBBY_VOICEMAIL_APP:-$HOME/Applications/JobbyVoicemail.app}
out="$HOME/Library/Application Support/JobbyVoicemail"
[[ $# -gt 0 ]] || set -- probe

rm -f "$out/error.json"
open -W -n -g "$app" --args "$@"

if [[ -f "$out/error.json" ]]; then
  cat "$out/error.json" >&2
  exit 1
fi
echo "$out"
