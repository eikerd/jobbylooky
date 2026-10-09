#!/bin/bash
# Installs the daily 4am link sweep as a launchd agent, from a copy of its two files, so that
# whatever branch the repo checkout is on later (or an `npm ci` there) cannot break it.
# Re-run after merging a change to mac/link-sweep.mjs or server/link-verdicts.mjs.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
dest="$HOME/Library/Application Support/JobbyLinkSweep"
label=com.jobbylooky.link-sweep
plist="$HOME/Library/LaunchAgents/$label.plist"
log="$HOME/Library/Logs/jobbylooky-link-sweep.log"
# shellcheck disable=SC1091
node="$(source "$HOME/.nvm/nvm.sh" >/dev/null && nvm which "$(cat "$repo/.nvmrc")")"
version="$("$node" -p "require('$repo/package.json').devDependencies['playwright-core'].replace(/^\\^/, '')")"

mkdir -p "$dest/mac" "$dest/server"
cp "$repo/mac/link-sweep.mjs" "$dest/mac/"
cp "$repo/server/link-verdicts.mjs" "$dest/server/"
printf '{ "private": true }\n' > "$dest/package.json"
(cd "$dest" && PATH="$(dirname "$node"):$PATH" npm install --silent --no-audit --no-fund "playwright-core@$version")

cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>$node</string><string>$dest/mac/link-sweep.mjs</string></array>
  <key>WorkingDirectory</key><string>$dest</string>
  <!-- 4am daily; launchd runs a missed time when the Mac wakes. -->
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$log</string>
  <key>StandardErrorPath</key><string>$log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"
echo "Installed $label: $dest, log $log"
