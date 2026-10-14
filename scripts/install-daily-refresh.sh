#!/bin/zsh
# Installs (or with --uninstall removes) a macOS launchd job that runs scripts/refresh-daily.sh every day.
# Usage: scripts/install-daily-refresh.sh [HH:MM]     default 06:30 local time
# If the Mac is asleep at that time, launchd runs the job when it wakes.
set -e
LABEL="com.myscreener.refresh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "$1" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed $LABEL"
  exit 0
fi

TIME="${1:-06:30}"; HOUR="${TIME%%:*}"; MIN="${TIME##*:}"
mkdir -p "$DIR/.data" "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$DIR/scripts/refresh-daily.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>$((10#$HOUR))</integer><key>Minute</key><integer>$((10#$MIN))</integer></dict>
  <key>StandardErrorPath</key><string>$DIR/.data/launchd.err.log</string>
  <key>StandardOutPath</key><string>$DIR/.data/launchd.out.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed $LABEL: daily at $TIME. Log: $DIR/.data/refresh.log"
echo "Run now:  launchctl kickstart gui/$(id -u)/$LABEL"
