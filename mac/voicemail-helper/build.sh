#!/bin/zsh
# Builds JobbyVoicemail.app and installs it in ~/Applications.
#
# Signed with the Apple Development identity so the Full Disk Access grant
# follows the team and bundle ID: rebuilding keeps the grant. An ad-hoc
# signature would tie it to the binary's hash and drop it on every build.
set -euo pipefail

here=${0:A:h}
app_name=JobbyVoicemail
bundle_id=com.eikerd.jobbyvoicemail
dest=${INSTALL_DIR:-$HOME/Applications}
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT

identity=$(security find-identity -v -p codesigning | awk -F'"' '/Apple Development/ {print $2; exit}')
if [[ -z $identity ]]; then
  echo "No Apple Development signing identity in the keychain." >&2
  exit 1
fi

app=$build/$app_name.app
mkdir -p "$app/Contents/MacOS"
swiftc -O -o "$app/Contents/MacOS/$app_name" "$here"/*.swift

cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>$bundle_id</string>
  <key>CFBundleName</key><string>$app_name</string>
  <key>CFBundleExecutable</key><string>$app_name</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>26.0</string>
  <key>LSUIElement</key><true/>
  <key>NSSpeechRecognitionUsageDescription</key><string>Transcribes voicemails that Apple did not transcribe, on this Mac, for Jobbylooky.</string>
</dict>
</plist>
PLIST

codesign --force --options runtime --timestamp=none --sign "$identity" "$app"
codesign --verify --strict "$app"

mkdir -p "$dest"
rm -rf "$dest/$app_name.app"
ditto "$app" "$dest/$app_name.app"
echo "Installed $dest/$app_name.app"
